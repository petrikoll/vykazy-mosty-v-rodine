import React, { useEffect, useMemo, useState } from "react";
import { confirmUnsavedChanges, useGuardedState } from "../unsavedChanges.jsx";
import { Eye, Plus, Trash2, Upload } from "lucide-react";
import { api, jsonBody, openApiFilePreview } from "../api.mjs";
import { calculateInclusiveEducationHours } from "../timeRange.mjs";
import { Button, Card, Empty, Field, Input, Notice, Select, StatusBadge, Textarea, useTimedNotice } from "./Common.jsx";

const YEARS = [2026, 2027, 2028, 2029];
const NEED_SOURCES = [
  ["job_requirements", "Požadavky pracovního místa"],
  ["client_needs", "Potřeby klientů / cílové skupiny"],
  ["legislation_methodology", "Změny legislativy nebo metodik"],
  ["employee_evaluation", "Hodnocení zaměstnance"],
  ["supervisor_recommendation", "Doporučení vedoucího pracovníka"],
  ["own_interest", "Vlastní zájem zaměstnance"],
  ["other", "Jiný důvod"],
];
const FORMATS = [
  ["course", "Kurz"], ["seminar", "Seminář"], ["conference", "Konference"],
  ["e_learning", "E-learning"], ["internship", "Stáž"], ["other", "Jiné"],
];
const ACTIVITY_STATUSES = [["planned", "Plánováno"], ["completed", "Splněno"]];
const QUARTERS = [["Q1", "1. čtvrtletí"], ["Q2", "2. čtvrtletí"], ["Q3", "3. čtvrtletí"], ["Q4", "4. čtvrtletí"]];
const today = () => new Date().toLocaleDateString("sv-SE");
const normalizeMatch = (value) => String(value || "").toLocaleLowerCase("cs-CZ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const normalizeQuarter = (value) => {
  if (QUARTERS.some(([quarter]) => quarter === value)) return value;
  const month = Number(String(value || "").match(/^\d{4}-(\d{2})$/)?.[1]);
  return month >= 1 && month <= 12 ? `Q${Math.ceil(month / 3)}` : "";
};
const makeActivity = (source = {}) => ({
  _key: source._key || `${Date.now()}-${Math.random()}`,
  id: source.id || "",
  topic: source.topic || source.title || "",
  accreditationNumber: source.accreditationNumber || "",
  format: FORMATS.some(([value]) => value === source.format) ? source.format : "course",
  plannedDate: normalizeQuarter(source.plannedDate),
  hours: source.hours ?? "",
  estimatedCost: source.estimatedCost ?? "",
  status: source.status === "completed" ? "completed" : "planned",
});
const emptyPlan = () => ({
  goals: "", needs: "", needSources: [], otherNeedSource: "", plannedActivities: [makeActivity()],
  evaluation: "", evaluationNotCompleted: "", nextYearUpdate: "",
  planDate: today(), evaluationDate: "",
});
const emptyRecord = () => ({ dateFrom: "", dateTo: "", timeFrom: "", timeTo: "", title: "", provider: "", format: "Prezenční", accreditation: "", plannedActivityId: "" });
const money = (value) => Number(value || 0).toLocaleString("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 });
const dateTime = (value) => value ? new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "";
const optionLabel = (options, value) => options.find(([key]) => key === value)?.[1] || value || "—";

export default function Education({
  employee, actor = employee, employees = [], positions = [], project = {}, plans, records, onRefresh,
  evaluations = [], sourceEvaluation = null, readOnly = false, initialYear = new Date().getFullYear(), mode = "all", showRecordList = true, embedded = false,
}) {
  const [year, setYear] = useState(initialYear);
  const current = useMemo(() => plans.find((item) => item.year === year), [plans, year]);
  const currentEmployeeEvaluation = useMemo(() => sourceEvaluation?.year === year
    ? sourceEvaluation
    : evaluations.find((item) => item.year === year), [evaluations, sourceEvaluation, year]);
  const [planForm, setPlanForm, resetPlanForm, planGuard] = useGuardedState(emptyPlan);
  const [recordForm, setRecordForm, resetRecordForm] = useGuardedState(emptyRecord);
  const [certificate, setCertificate, resetCertificate] = useGuardedState(null);
  const [certificateInputKey, setCertificateInputKey] = useState(0);
  const [notice, setNotice] = useTimedNotice();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    resetPlanForm(current ? {
      goals: current.goals || "",
      needs: current.needs || "",
      needSources: current.needSources || [],
      otherNeedSource: current.otherNeedSource || "",
      plannedActivities: current.plannedActivities?.length ? current.plannedActivities.map(makeActivity) : [makeActivity()],
      evaluation: current.evaluation || "",
      evaluationNotCompleted: current.evaluationNotCompleted || "",
      nextYearUpdate: current.nextYearUpdate || "",
      planDate: current.planDate || today(),
      evaluationDate: current.evaluationDate || "",
    } : currentEmployeeEvaluation?.status === "closed" ? {
      ...emptyPlan(),
      goals: (currentEmployeeEvaluation.professionalGoals || []).map((goal) => goal.text).filter(Boolean).join("\n"),
      needs: currentEmployeeEvaluation.developmentNeeds || "",
      needSources: ["employee_evaluation"],
    } : emptyPlan());
  }, [current, currentEmployeeEvaluation]);

  useEffect(() => {
    if (recordForm.plannedActivityId || !current?.plannedActivities?.length) return;
    const accreditation = normalizeMatch(recordForm.accreditation);
    const title = normalizeMatch(recordForm.title);
    const match = current.plannedActivities.find((activity) => accreditation && normalizeMatch(activity.accreditationNumber) === accreditation)
      || current.plannedActivities.find((activity) => {
        const topic = normalizeMatch(activity.topic || activity.title);
        return title && topic && (title.includes(topic) || topic.includes(title));
      });
    if (match?.id) setRecordForm((form) => ({ ...form, plannedActivityId: match.id }));
  }, [current, recordForm.accreditation, recordForm.plannedActivityId, recordForm.title]);

  const setPlanValue = (field, value) => setPlanForm((form) => ({ ...form, [field]: value }));
  const setActivityValue = (key, field, value) => setPlanForm((form) => ({
    ...form,
    plannedActivities: form.plannedActivities.map((activity) => activity._key === key ? { ...activity, [field]: value } : activity),
  }));
  const toggleNeedSource = (source) => setPlanForm((form) => ({
    ...form,
    needSources: form.needSources.includes(source)
      ? form.needSources.filter((item) => item !== source)
      : [...form.needSources, source],
  }));

  const savePlan = async (status) => {
    setBusy(true); setNotice(null);
    try {
      await api(`/api/education-plans/${year}`, { method: "PUT", body: jsonBody({
        employeeId: employee.id,
        ...planForm,
        plannedActivities: planForm.plannedActivities.map(({ _key, ...activity }) => activity),
        status,
      }) });
      planGuard.markSaved();
      setNotice({ type: "success", text: status === "approved" ? "Vzdělávací plán byl uložen a elektronicky schválen." : status === "submitted" ? "Vzdělávací plán byl předán Vedoucí služby/programu ke schválení." : "Vzdělávací plán byl uložen jako koncept." });
      await onRefresh();
    } catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); }
  };

  const addRecord = async () => {
    setBusy(true); setNotice(null);
    try {
      const body = new FormData();
      Object.entries({ ...recordForm, hours: educationHours, employeeId: employee.id }).forEach(([key, value]) => body.append(key, String(value ?? "")));
      if (certificate) body.append("certificate", certificate);
      await api("/api/education-records", { method: "POST", body });
      resetRecordForm(emptyRecord());
      resetCertificate(null);
      setCertificateInputKey((value) => value + 1);
      setNotice({ type: "success", text: certificate ? "Absolvované vzdělávání a osvědčení byly uloženy." : "Absolvované vzdělávání bylo zaznamenáno." });
      await onRefresh();
    } catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); }
  };

  const linkRecord = async (recordId, plannedActivityId) => {
    setBusy(true); setNotice(null);
    try {
      await api(`/api/education-records/${recordId}/link`, { method: "PATCH", body: jsonBody({ plannedActivityId }) });
      setNotice({ type: "success", text: plannedActivityId ? "Vzdělávání bylo propojeno s plánem." : "Vzdělávání bylo od plánu odpojeno." });
      await onRefresh();
    } catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); }
  };

  const prefillEvaluation = () => {
    const fulfilled = [];
    const unfulfilled = [];
    for (const activity of planForm.plannedActivities) {
      const linked = records.filter((record) => activity.id && record.plannedActivityId === activity.id);
      if (linked.length) {
        fulfilled.push(`${activity.topic}: ${linked.map((record) => `${record.dateFrom || record.date} – ${record.title} (${Number(record.hours || 0).toLocaleString("cs-CZ")} h)`).join("; ")}`);
      } else if (activity.status === "completed") {
        fulfilled.push(`${activity.topic}: označeno jako splněné`);
      } else if (activity.topic) {
        unfulfilled.push(activity.topic);
      }
    }
    setPlanForm((form) => ({
      ...form,
      evaluation: fulfilled.join("\n"),
      evaluationNotCompleted: unfulfilled.join("\n"),
      evaluationDate: form.evaluationDate || today(),
    }));
    setNotice({ type: "success", text: "Vyhodnocení bylo předvyplněno podle propojených vzdělávání." });
  };

  const positionNames = current?.positionNames?.length
    ? current.positionNames
    : (employee.assignments || []).map((assignment) => positions.find((position) => position.id === assignment.positionId)?.name).filter(Boolean);
  const supervisor = employee.appRole === "worker"
    ? employees.find((candidate) => candidate.active !== false && candidate.appRole === "manager")
    : employee.appRole === "manager"
      ? employees.find((candidate) => candidate.active !== false && candidate.appRole === "director")
      : null;
  const supervisorName = current?.supervisorName || supervisor?.name || (employee.appRole === "worker" ? "Odborný garant" : employee.appRole === "manager" ? "Vedoucí služby/programu" : "—");
  const plannedHours = planForm.plannedActivities.reduce((sum, activity) => sum + Number(activity.hours || 0), 0);
  const plannedCost = planForm.plannedActivities.reduce((sum, activity) => sum + Number(activity.estimatedCost || 0), 0);
  const currentCost = (current?.plannedActivities || []).reduce((sum, activity) => sum + Number(activity.estimatedCost || 0), 0);
  const isManagerOwnPlan = actor?.appRole === "manager" && actor.id === employee.id;
  const finalStatus = isManagerOwnPlan ? "submitted" : "approved";
  const finalAction = isManagerOwnPlan
    ? "Předat Vedoucí služby/programu ke schválení"
    : ["director", "project_manager"].includes(actor?.appRole)
      ? "Schvaluji včetně předpokládané ceny vzdělávání"
      : current?.status === "approved" ? "Uložit změny a znovu schválit" : "Uložit a schválit plán";
  const educationHours = calculateInclusiveEducationHours(recordForm);
  const yearRecords = records.filter((item) => String(item.dateFrom || item.date).startsWith(String(year)));
  const totalHours = yearRecords.reduce((sum, item) => sum + Number(item.hours || 0), 0);
  const planActivityOptions = current?.plannedActivities || [];
  const previewCertificate = async (record) => {
    setNotice(null);
    try {
      await openApiFilePreview(`/api/education-records/${record.id}/certificate`);
    } catch (error) { setNotice({ type: "error", text: error.message }); }
  };
  const recordsTable = !yearRecords.length ? <Empty>Zatím není zapsané žádné absolvované vzdělávání.</Empty> : <div className="overflow-x-auto"><table className="record-table w-full min-w-[780px] text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="p-2">Datum a čas</th><th className="p-2">Vzdělávání</th><th className="p-2">Plní položku plánu</th><th className="p-2">Osvědčení</th><th className="p-2 text-right">Hodiny</th></tr></thead><tbody>{yearRecords.map((item) => <tr key={item.id} className="border-b border-slate-100"><td className="whitespace-nowrap p-2">{item.dateFrom || item.date}{(item.dateTo && item.dateTo !== item.dateFrom) ? ` – ${item.dateTo}` : ""}{item.timeFrom && item.timeTo ? <span className="block text-xs text-slate-500">{item.timeFrom}–{item.timeTo}</span> : null}</td><td className="p-2"><strong>{item.title}</strong><span className="mt-0.5 block text-xs text-slate-500">{[item.provider, item.format].filter(Boolean).join(" · ")}</span></td><td className="p-2">{readOnly ? (item.plannedActivityTitle || "Nepřiřazeno") : <Select disabled={busy} value={item.plannedActivityId || ""} onChange={(event) => linkRecord(item.id, event.target.value)}><option value="">Nepřiřazeno</option>{planActivityOptions.map((activity) => <option key={activity.id} value={activity.id}>{activity.topic || activity.title}</option>)}</Select>}</td><td className="p-2">{(item.driveFileId || item.localFilePath) ? <Button variant="secondary" className="min-h-8 whitespace-nowrap px-2 py-1 text-xs" disabled={busy} onClick={() => previewCertificate(item)}><Eye className="mr-1 inline" size={14}/>Otevřít</Button> : <span className="text-slate-400">—</span>}</td><td className="p-2 text-right">{item.hours}</td></tr>)}</tbody></table></div>;

  const metadata = <div className="grid gap-x-4 gap-y-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
    <div><span className="block text-xs font-semibold text-slate-500">Jméno a příjmení</span><strong>{employee.name}</strong></div>
    <div><span className="block text-xs font-semibold text-slate-500">Pracovní pozice</span><strong>{positionNames.join(", ") || "—"}</strong></div>
    <div><span className="block text-xs font-semibold text-slate-500">Služba / pracoviště</span><strong>{current?.serviceName || project.name || "Mosty v rodině"}</strong></div>
    <div><span className="block text-xs font-semibold text-slate-500">Nadřízený pracovník</span><strong>{supervisorName}</strong></div>
  </div>;
  const evaluationContext = currentEmployeeEvaluation?.status === "closed" ? <details className="rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2 text-sm">
    <summary className="cursor-pointer font-bold text-blue-950">Podklad z hodnocení zaměstnance</summary>
    <div className="mt-2 grid gap-2 md:grid-cols-2"><div><span className="block text-xs font-bold uppercase text-blue-700">Silné stránky</span><p className="mt-1 whitespace-pre-wrap">{currentEmployeeEvaluation.strengths}</p></div><div><span className="block text-xs font-bold uppercase text-blue-700">Rozvojové potřeby</span><p className="mt-1 whitespace-pre-wrap">{currentEmployeeEvaluation.developmentNeeds}</p></div></div>
    <div className="mt-2"><span className="block text-xs font-bold uppercase text-blue-700">Profesní cíle</span><ol className="mt-1 list-decimal space-y-1 pl-5">{(currentEmployeeEvaluation.professionalGoals || []).map((goal) => <li key={goal.id}><strong>{goal.text}</strong>{goal.successCriterion ? ` – splnění: ${goal.successCriterion}` : ""}</li>)}</ol></div>
  </details> : null;

  if (readOnly) {
    return <div className="space-y-3">
      <Card title={embedded ? undefined : "Vzdělávací plán"} subtitle="Plán zapisuje a vyhodnocuje Odborný garant nebo Vedoucí služby/programu." actions={embedded ? undefined : <div className="flex items-center gap-2"><Select aria-label="Rok vzdělávacího plánu" value={year} onChange={(event) => { if (confirmUnsavedChanges()) setYear(Number(event.target.value)); }}>{YEARS.map((value) => <option key={value}>{value}</option>)}</Select>{current && <StatusBadge status={current.status}/>}</div>}>
        {!current ? <div className="space-y-3">{evaluationContext}<Empty>Pro rok {year} zatím není vzdělávací plán založen.</Empty></div> : <div className="space-y-3">
          {metadata}
          {evaluationContext}
          {current.status === "approved" && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><strong>Elektronicky schváleno</strong>{current.approvedByName ? ` · ${current.approvedByName}` : ""}{current.approvedAt ? ` · ${dateTime(current.approvedAt)}` : ""}</div>}
          <div className="grid gap-3 md:grid-cols-2"><section className="rounded-lg border border-slate-200 p-3"><h3 className="text-xs font-bold uppercase text-slate-500">V čem se potřebuji rozvíjet</h3><p className="mt-1 whitespace-pre-wrap text-sm">{current.goals || "Neuvedeno"}</p></section><section className="rounded-lg border border-slate-200 p-3"><h3 className="text-xs font-bold uppercase text-slate-500">Z čeho potřeba vychází</h3><p className="mt-1 text-sm">{(current.needSources || []).map((source) => optionLabel(NEED_SOURCES, source)).join(", ") || "Neuvedeno"}{current.otherNeedSource ? ` – ${current.otherNeedSource}` : ""}</p>{current.needs && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{current.needs}</p>}</section></div>
          <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="record-table w-full min-w-[960px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-2">Oblast / téma</th><th className="p-2">Číslo akreditace</th><th className="p-2">Forma</th><th className="p-2">Termín</th><th className="p-2 text-right">Rozsah</th><th className="p-2 text-right">Náklady</th><th className="p-2">Stav / plnění</th></tr></thead><tbody>{(current.plannedActivities || []).map((activity, index) => { const linked = records.filter((record) => record.plannedActivityId === activity.id); return <tr key={`${activity.topic || activity.title}-${index}`} className="border-t"><td className="p-2 font-semibold">{activity.topic || activity.title}</td><td className="p-2">{activity.accreditationNumber || "—"}</td><td className="p-2">{optionLabel(FORMATS, activity.format)}</td><td className="p-2">{optionLabel(QUARTERS, normalizeQuarter(activity.plannedDate))}</td><td className="p-2 text-right">{Number(activity.hours || 0).toLocaleString("cs-CZ")} h</td><td className="p-2 text-right font-semibold">{money(activity.estimatedCost)}</td><td className="p-2"><strong>{optionLabel(ACTIVITY_STATUSES, activity.status)}</strong>{linked.map((record) => <span key={record.id} className="mt-1 block text-xs text-slate-500">{record.dateFrom || record.date} · {Number(record.hours || 0).toLocaleString("cs-CZ")} h</span>)}</td></tr>; })}</tbody><tfoot className="border-t bg-slate-50 font-bold"><tr><td className="p-2" colSpan="4">Celkem plánováno</td><td className="p-2 text-right">{(current.plannedActivities || []).reduce((sum, activity) => sum + Number(activity.hours || 0), 0).toLocaleString("cs-CZ")} h</td><td className="p-2 text-right">{money(currentCost)}</td><td/></tr></tfoot></table></div>
          <div className="grid gap-3 md:grid-cols-3"><section className="rounded-lg bg-slate-50 p-3"><h3 className="text-xs font-bold uppercase text-slate-500">Uskutečněno a využití v praxi</h3><p className="mt-1 whitespace-pre-wrap text-sm">{current.evaluation || "Dosud nevyplněno"}</p></section><section className="rounded-lg bg-slate-50 p-3"><h3 className="text-xs font-bold uppercase text-slate-500">Neuskutečněno a důvod</h3><p className="mt-1 whitespace-pre-wrap text-sm">{current.evaluationNotCompleted || "Dosud nevyplněno"}</p></section><section className="rounded-lg bg-slate-50 p-3"><h3 className="text-xs font-bold uppercase text-slate-500">Doporučení pro další rok</h3><p className="mt-1 whitespace-pre-wrap text-sm">{current.nextYearUpdate || "Dosud nevyplněno"}</p></section></div>
        </div>}
      </Card>
      {!embedded && <Card title="Absolvované vzdělávání" subtitle={`Za rok ${year}: ${totalHours.toLocaleString("cs-CZ")} / 24 hodin`}>{recordsTable}</Card>}
    </div>;
  }

  return <fieldset disabled={busy} className="min-w-0 space-y-3">
    <Notice notice={notice}/>
    {mode !== "records" && mode !== "evaluation" && <Card title={embedded ? undefined : `Roční vzdělávací plán · ${employee.name}`} subtitle={embedded ? undefined : "Rozvojové potřeby a plánované vzdělávání."} actions={embedded ? undefined : <div className="flex items-end gap-2"><Field label="Rok"><Select value={year} onChange={(event) => { if (confirmUnsavedChanges()) setYear(Number(event.target.value)); }}>{YEARS.map((value) => <option key={value}>{value}</option>)}</Select></Field>{current && <StatusBadge status={current.status}/>}</div>}>
      <div className="space-y-3">
        {metadata}
        {evaluationContext}
        {current?.status === "approved" && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><strong>Elektronicky schváleno</strong>{current.approvedByName ? ` · ${current.approvedByName}` : ""}{current.approvedAt ? ` · ${dateTime(current.approvedAt)}` : ""}</div>}
        {current?.status === "submitted" && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"><strong>Čeká na schválení Vedoucí služby/programu.</strong></div>}
        <section className="rounded-lg border border-slate-200 p-3"><div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-sm font-bold">1. Vzdělávací a rozvojové potřeby</h3><Field label="Datum sestavení"><Input type="date" value={planForm.planDate} onChange={(event) => setPlanValue("planDate", event.target.value)}/></Field></div><div className="grid gap-3 lg:grid-cols-2"><Field label="V čem se potřebuji v tomto roce rozvíjet?"><Textarea compact value={planForm.goals} onChange={(event) => setPlanValue("goals", event.target.value)} placeholder="Rozvojové potřeby a cíle zaměstnance"/></Field><div><span className="mb-1 block text-xs font-semibold text-slate-700">Z čeho potřeba vzdělávání vychází?</span><div className="grid gap-1 sm:grid-cols-2">{NEED_SOURCES.map(([value, label]) => <label key={value} className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium"><input type="checkbox" checked={planForm.needSources.includes(value)} onChange={() => toggleNeedSource(value)}/>{label}</label>)}</div></div>{planForm.needSources.includes("other") && <Field label="Jiný důvod"><Input value={planForm.otherNeedSource} onChange={(event) => setPlanValue("otherNeedSource", event.target.value)}/></Field>}<Field label="Upřesnění vzdělávacích potřeb (nepovinné)"><Textarea compact value={planForm.needs} onChange={(event) => setPlanValue("needs", event.target.value)}/></Field></div></section>
        <section className="rounded-lg border border-slate-200 p-3"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-bold">2. Plán vzdělávání</h3><p className="text-xs text-slate-500">Rozsah a předpokládané náklady se sčítají automaticky.</p></div><Button variant="secondary" className="px-2 py-1" onClick={() => setPlanForm((form) => ({ ...form, plannedActivities: [...form.plannedActivities, makeActivity()] }))}><Plus className="mr-1 inline" size={15}/>Přidat aktivitu</Button></div><div className="space-y-2">{planForm.plannedActivities.map((activity, index) => <div key={activity._key} className="rounded-lg bg-slate-50 p-2"><div className="mb-1 flex items-center justify-between"><strong className="text-xs text-slate-500">Aktivita {index + 1}</strong>{planForm.plannedActivities.length > 1 && <button type="button" className="rounded p-1 text-red-600 hover:bg-red-50" aria-label={`Odstranit aktivitu ${index + 1}`} onClick={() => setPlanForm((form) => ({ ...form, plannedActivities: form.plannedActivities.filter((item) => item._key !== activity._key) }))}><Trash2 size={16}/></button>}</div><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-12"><div className="xl:col-span-3"><Field label="Oblast / téma"><Input value={activity.topic} onChange={(event) => setActivityValue(activity._key, "topic", event.target.value)}/></Field></div><div className="xl:col-span-3"><Field label="Číslo akreditace"><Input value={activity.accreditationNumber} onChange={(event) => setActivityValue(activity._key, "accreditationNumber", event.target.value)}/></Field></div><div className="xl:col-span-2"><Field label="Forma"><Select value={activity.format} onChange={(event) => setActivityValue(activity._key, "format", event.target.value)}>{FORMATS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field></div><div className="xl:col-span-2"><Field label="Předpokládaný termín"><Select value={activity.plannedDate} onChange={(event) => setActivityValue(activity._key, "plannedDate", event.target.value)}><option value="">Vyberte čtvrtletí</option>{QUARTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field></div><div className="xl:col-span-1"><Field label="Hodiny"><Input type="number" min="0" step="0.5" value={activity.hours} onChange={(event) => setActivityValue(activity._key, "hours", event.target.value)}/></Field></div><div className="xl:col-span-1"><Field label="Stav"><Select value={activity.status} onChange={(event) => setActivityValue(activity._key, "status", event.target.value)}>{ACTIVITY_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field></div><div className="md:col-span-2 xl:col-span-3"><Field label="Předpokládaná finanční náročnost (Kč)"><Input type="number" min="0" step="100" value={activity.estimatedCost} onChange={(event) => setActivityValue(activity._key, "estimatedCost", event.target.value)}/></Field></div></div></div>)}</div><div className="mt-2 flex flex-wrap justify-end gap-2 text-sm"><span className="rounded-md bg-blue-50 px-3 py-2 font-semibold text-blue-800">Celkový rozsah: {plannedHours.toLocaleString("cs-CZ")} h</span><span className="rounded-md bg-violet-50 px-3 py-2 font-semibold text-violet-800">Předpokládané náklady: {money(plannedCost)}</span></div></section>
        <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={() => savePlan("draft")}>Uložit koncept</Button><Button disabled={busy} onClick={() => savePlan(finalStatus)}>{finalAction}</Button><span className="self-center text-xs text-slate-500">Ruční podpis není potřeba; schválení se zaznamená elektronicky.</span></div>
      </div>
    </Card>}
    {mode === "evaluation" && <Card title={embedded ? undefined : `Roční vyhodnocení vzdělávacího plánu · ${employee.name}`} subtitle={embedded ? undefined : "Vyhodnocení se předvyplní z propojených záznamů, ale před uložením jej lze upravit."} actions={embedded ? undefined : <div className="flex items-end gap-2"><Field label="Rok"><Select value={year} onChange={(event) => { if (confirmUnsavedChanges()) setYear(Number(event.target.value)); }}>{YEARS.map((value) => <option key={value}>{value}</option>)}</Select></Field>{current && <StatusBadge status={current.status}/>}</div>}>
      {!current ? <Empty>Pro rok {year} nejprve založte vzdělávací plán.</Empty> : <div className="space-y-3">
        {metadata}
        <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="record-table w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-2">Položka plánu</th><th className="p-2">Číslo akreditace</th><th className="p-2">Plnění</th><th className="p-2 text-right">Plán hodin</th></tr></thead><tbody>{planForm.plannedActivities.map((activity) => { const linked = records.filter((record) => record.plannedActivityId === activity.id); return <tr key={activity._key} className="border-t"><td className="p-2 font-semibold">{activity.topic}</td><td className="p-2">{activity.accreditationNumber || "—"}</td><td className="p-2">{linked.length ? linked.map((record) => <span key={record.id} className="block text-emerald-700">{record.dateFrom || record.date} · {record.title} · {Number(record.hours || 0).toLocaleString("cs-CZ")} h</span>) : <span className="text-slate-500">Bez přiřazeného vzdělávání</span>}</td><td className="p-2 text-right">{Number(activity.hours || 0).toLocaleString("cs-CZ")} h</td></tr>; })}</tbody></table></div>
        <div><Button variant="secondary" disabled={busy || !planForm.plannedActivities.some((activity) => activity.topic)} onClick={prefillEvaluation}>Předvyplnit podle uskutečněného vzdělávání</Button></div>
        <div className="grid gap-3 lg:grid-cols-3"><Field label="Co se uskutečnilo a jak bylo využito v praxi?"><Textarea value={planForm.evaluation} onChange={(event) => setPlanValue("evaluation", event.target.value)}/></Field><Field label="Co se neuskutečnilo a proč?"><Textarea value={planForm.evaluationNotCompleted} onChange={(event) => setPlanValue("evaluationNotCompleted", event.target.value)}/></Field><Field label="Doporučení / potřeby pro následující rok"><Textarea value={planForm.nextYearUpdate} onChange={(event) => setPlanValue("nextYearUpdate", event.target.value)}/></Field></div>
        <div className="grid gap-3 sm:grid-cols-[220px_1fr] sm:items-end"><Field label="Datum ročního vyhodnocení"><Input type="date" value={planForm.evaluationDate} onChange={(event) => setPlanValue("evaluationDate", event.target.value)}/></Field><div className="flex flex-wrap items-center gap-2"><Button disabled={busy} onClick={() => savePlan(finalStatus)}>{isManagerOwnPlan ? "Předat vyhodnocení Vedoucí služby/programu" : "Uložit a schválit vyhodnocení"}</Button><span className="text-xs text-slate-500">Schválení se zaznamená elektronicky.</span></div></div>
      </div>}
    </Card>}
    {mode !== "plan" && mode !== "evaluation" && <><Card plain={embedded} tone="blue" title={`Zapsat absolvované vzdělávání · ${employee.name}`} subtitle={`Za rok ${year}: ${totalHours.toLocaleString("cs-CZ")} / 24 hodin`}><div className="grid gap-2 md:grid-cols-4"><Field label="Datum od"><Input type="date" value={recordForm.dateFrom} onChange={(event) => setRecordForm((form) => ({ ...form, dateFrom: event.target.value, dateTo: form.dateTo || event.target.value }))}/></Field><Field label="Datum do"><Input type="date" min={recordForm.dateFrom || undefined} value={recordForm.dateTo} onChange={(event) => setRecordForm((form) => ({ ...form, dateTo: event.target.value }))}/></Field><Field label="Čas od"><Input type="time" value={recordForm.timeFrom} onChange={(event) => setRecordForm((form) => ({ ...form, timeFrom: event.target.value }))}/></Field><Field label="Čas do"><Input type="time" value={recordForm.timeTo} onChange={(event) => setRecordForm((form) => ({ ...form, timeTo: event.target.value }))}/></Field><div className="md:col-span-2"><Field label="Název"><Input value={recordForm.title} onChange={(event) => setRecordForm((form) => ({ ...form, title: event.target.value }))}/></Field></div><Field label="Poskytovatel"><Input value={recordForm.provider} onChange={(event) => setRecordForm((form) => ({ ...form, provider: event.target.value }))}/></Field><Field label="Forma"><Select value={recordForm.format} onChange={(event) => setRecordForm((form) => ({ ...form, format: event.target.value }))}><option>Prezenční</option><option>Online</option></Select></Field><div className="md:col-span-2"><Field label="Akreditace / číslo osvědčení"><Input value={recordForm.accreditation} onChange={(event) => setRecordForm((form) => ({ ...form, accreditation: event.target.value }))}/></Field></div><div className="md:col-span-2"><Field label="Plní položku vzdělávacího plánu" hint="Shoda podle čísla akreditace nebo názvu se nabídne automaticky."><Select value={recordForm.plannedActivityId} onChange={(event) => setRecordForm((form) => ({ ...form, plannedActivityId: event.target.value }))}><option value="">Nepřiřazeno</option>{planActivityOptions.map((activity) => <option key={activity.id} value={activity.id}>{activity.topic || activity.title}</option>)}</Select></Field></div><div className="md:col-span-2"><Field label="Nahrát osvědčení o absolvování" hint="PDF, JPG nebo PNG; nejvýše 15 MB."><Input key={certificateInputKey} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => setCertificate(event.target.files?.[0] || null)}/>{certificate && <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-blue-700"><Upload size={13}/>{certificate.name}</span>}</Field></div></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className={`rounded-lg px-3 py-2 text-sm font-bold ${educationHours > 0 ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>Vypočtená délka: {educationHours > 0 ? `${educationHours.toLocaleString("cs-CZ")} h` : "—"}</span><Button disabled={busy || educationHours <= 0} onClick={addRecord}>Uložit záznam</Button></div></Card>
    {showRecordList && <Card title="Vzdělávací karta">{recordsTable}</Card>}</>}
  </fieldset>;
}
