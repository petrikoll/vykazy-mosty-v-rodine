import React, { useMemo, useState } from "react";
import { ClipboardCheck, Eye, Trash2 } from "lucide-react";
import { api, jsonBody, openApiFilePreview } from "../api.mjs";
import Education from "./Education.jsx";
import EmployeeEvaluation from "./EmployeeEvaluation.jsx";
import { Button, Card, Empty, Field, Modal, Notice, Select, StatusBadge, useTimedNotice } from "./Common.jsx";

const educationYears = [2026, 2027, 2028, 2029];
const formatHours = (value) => Number(value || 0).toLocaleString("cs-CZ", { maximumFractionDigits: 2 });
const formatMoney = (value) => `${Number(value || 0).toLocaleString("cs-CZ")} Kč`;

export default function ManagerEducation({ portal, positions, project, onRefresh }) {
  const isDirector = portal.employee.appRole === "director";
  const [tab, setTab] = useState("evaluations");
  const [year, setYear] = useState(new Date().getFullYear());
  const [notice, setNotice] = useTimedNotice();
  const [busy, setBusy] = useState(false);
  const accessibleEmployees = useMemo(() => portal.employees
    .filter((employee) => employee.active !== false && (isDirector || employee.appRole === "worker" || employee.id === portal.employee.id))
    .sort((a, b) => a.name.localeCompare(b.name, "cs")), [portal.employee.id, portal.employees, isDirector]);
  const [dialog, setDialog] = useState(null);
  const [recordEmployeeId, setRecordEmployeeId] = useState(() => accessibleEmployees.find((employee) => employee.appRole === "worker")?.id || accessibleEmployees[0]?.id || "");
  const evaluationEmployees = useMemo(() => accessibleEmployees.filter((employee) => employee.appRole !== "director"), [accessibleEmployees]);

  const rows = useMemo(() => accessibleEmployees.map((employee) => {
    const plan = portal.educationPlans.find((item) => item.employeeId === employee.id && item.year === year);
    const plannedHours = (plan?.plannedActivities || []).reduce((sum, activity) => sum + Number(activity.hours || 0), 0);
    const plannedCost = (plan?.plannedActivities || []).reduce((sum, activity) => sum + Number(activity.estimatedCost || 0), 0);
    return { employee, plan, plannedHours, plannedCost };
  }), [accessibleEmployees, portal.educationPlans, year]);
  const evaluationRows = useMemo(() => evaluationEmployees.map((employee) => ({
    employee,
    evaluation: portal.employeeEvaluations.find((item) => item.employeeId === employee.id && item.year === year),
    plan: portal.educationPlans.find((item) => item.employeeId === employee.id && item.year === year),
  })), [evaluationEmployees, portal.educationPlans, portal.employeeEvaluations, year]);

  const yearRecords = useMemo(() => portal.educationRecords
    .filter((record) => accessibleEmployees.some((employee) => employee.id === record.employeeId)
      && String(record.dateFrom || record.date || "").startsWith(String(year)))
    .toSorted((a, b) => String(b.dateFrom || b.date).localeCompare(String(a.dateFrom || a.date))),
  [accessibleEmployees, portal.educationRecords, year]);
  const totalRecordedHours = yearRecords.reduce((sum, record) => sum + Number(record.hours || 0), 0);
  const approvedCost = rows.filter((row) => row.plan?.status === "approved").reduce((sum, row) => sum + row.plannedCost, 0);
  const selectedEmployee = accessibleEmployees.find((employee) => employee.id === dialog?.employeeId);
  const recordEmployee = accessibleEmployees.find((employee) => employee.id === recordEmployeeId) || accessibleEmployees[0];

  const employeePlans = (employee) => portal.educationPlans.filter((item) => item.employeeId === employee.id);
  const employeeRecords = (employee) => portal.educationRecords.filter((item) => item.employeeId === employee.id);
  const employeeEvaluations = (employee) => portal.employeeEvaluations.filter((item) => item.employeeId === employee.id);
  const evaluationFor = (employee, targetYear = year) => portal.employeeEvaluations.find((item) => item.employeeId === employee.id && item.year === targetYear);
  const planFor = (employee, targetYear = year) => portal.educationPlans.find((item) => item.employeeId === employee.id && item.year === targetYear);
  const canEditEvaluation = (employee) => isDirector ? employee.appRole === "manager" : portal.employee.appRole === "manager" && employee.appRole === "worker";
  const openDialog = (employeeId, view) => setDialog({ employeeId, view });
  const linkRecord = async (recordId, plannedActivityId) => {
    setBusy(true); setNotice(null);
    try {
      await api(`/api/education-records/${recordId}/link`, { method: "PATCH", body: jsonBody({ plannedActivityId }) });
      setNotice({ type: "success", text: plannedActivityId ? "Vzdělávání bylo propojeno s plánem." : "Vzdělávání bylo od plánu odpojeno." });
      await onRefresh();
    } catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); }
  };
  const deletePlan = async (plan, employee) => {
    if (!window.confirm(`Opravdu smazat vzdělávací plán pracovníka ${employee.name} pro rok ${plan.year}? Propojená uskutečněná vzdělávání zůstanou zachována, ale od plánu se odpojí.`)) return;
    setBusy(true); setNotice(null);
    try {
      await api(`/api/education-plans/${plan.id}`, { method: "DELETE" });
      if (dialog?.employeeId === employee.id) setDialog(null);
      setNotice({ type: "success", text: "Vzdělávací plán byl smazán." });
      await onRefresh();
    } catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); }
  };
  const deleteEducationRecord = async (record) => {
    if (!window.confirm(`Opravdu smazat vzdělávání „${record.title}“ pracovníka ${record.employeeName}?${record.driveFileId ? " Přiložený soubor na Google Disku se přesune do koše." : ""}`)) return;
    setBusy(true); setNotice(null);
    try {
      await api(`/api/education-records/${record.id}`, { method: "DELETE" });
      setNotice({ type: "success", text: "Záznam vzdělávání byl smazán." });
      await onRefresh();
    } catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); }
  };
  const deleteEvaluation = async (evaluation, employee) => {
    if (!window.confirm(`Opravdu smazat hodnocení pracovníka ${employee.name} pro rok ${evaluation.year}? Vzdělávací plán zůstane zachován, ale vazba na hodnocení se odstraní.`)) return;
    setBusy(true); setNotice(null);
    try {
      await api(`/api/employee-evaluations/${evaluation.id}`, { method: "DELETE" });
      if (dialog?.employeeId === employee.id) setDialog(null);
      setNotice({ type: "success", text: "Hodnocení zaměstnance bylo smazáno." });
      await onRefresh();
    } catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); }
  };
  const previewCertificate = async (record) => {
    setNotice(null);
    try {
      await openApiFilePreview(`/api/education-records/${record.id}/certificate`);
    } catch (error) { setNotice({ type: "error", text: error.message }); }
  };
  const planActivitiesFor = (record) => portal.educationPlans.find((plan) => plan.employeeId === record.employeeId && plan.year === year)?.plannedActivities || [];

  return <div className="space-y-3">
    <Notice notice={notice}/>
    <div className="grid grid-cols-3 rounded-xl border border-slate-300 bg-blue-50 p-1 shadow-md shadow-slate-200/60">
      <button type="button" onClick={() => setTab("evaluations")} className={`rounded-lg px-3 py-2 text-sm font-bold ${tab === "evaluations" ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-slate-50"}`}>Hodnocení zaměstnanců</button>
      <button type="button" onClick={() => setTab("plans")} className={`rounded-lg px-3 py-2 text-sm font-bold ${tab === "plans" ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-slate-50"}`}>Vzdělávací plány týmu</button>
      <button type="button" onClick={() => setTab("records")} className={`rounded-lg px-3 py-2 text-sm font-bold ${tab === "records" ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-slate-50"}`}>Uskutečněné vzdělávání</button>
    </div>

    {tab === "evaluations" ? <Card title="Hodnocení zaměstnanců" subtitle="Hodnocení určí profesní cíle a rozvojové potřeby před sestavením vzdělávacího plánu." actions={<Field label="Rok"><Select value={year} onChange={(event) => setYear(Number(event.target.value))}>{educationYears.map((value) => <option key={value}>{value}</option>)}</Select></Field>}>
      {!evaluationRows.length ? <Empty>Nejsou založeni žádní pracovníci k hodnocení.</Empty> : <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-sm">
        <thead><tr className="border-b text-slate-500"><th className="p-2">Pracovník</th><th className="p-2">Hodnotitel</th><th className="p-2">Datum</th><th className="p-2">Stav</th><th className="p-2">Vzdělávací plán</th><th className="p-2 text-right">Akce</th></tr></thead>
        <tbody>{evaluationRows.map(({ employee, evaluation, plan }) => <tr key={employee.id} className="border-b border-slate-100"><td className="p-2"><strong>{employee.name}</strong>{employee.appRole === "manager" && <div className="text-xs text-slate-500">Odborný garant</div>}</td><td className="p-2">{evaluation?.evaluatorName || (employee.appRole === "manager" ? portal.employees.find((item) => item.appRole === "director")?.name : portal.employees.find((item) => item.appRole === "manager")?.name) || "—"}</td><td className="p-2">{evaluation?.evaluationDate || "—"}</td><td className="p-2"><StatusBadge status={evaluation?.status || "missing_evaluation"}/></td><td className="p-2">{plan ? <StatusBadge status={plan.status}/> : <span className="text-slate-400">Nevytvořen</span>}</td><td className="p-2"><div className="flex justify-end gap-2"><Button variant="secondary" className="whitespace-nowrap px-3 py-1.5" disabled={!evaluation && !canEditEvaluation(employee)} onClick={() => openDialog(employee.id, "employeeEvaluation")}><Eye className="mr-1 inline" size={16}/>{evaluation ? "Otevřít hodnocení" : "Zahájit hodnocení"}</Button>{isDirector && evaluation && <Button variant="danger" className="whitespace-nowrap px-3 py-1.5" disabled={busy} onClick={() => deleteEvaluation(evaluation, employee)}><Trash2 className="mr-1 inline" size={16}/>Smazat</Button>}</div></td></tr>)}</tbody>
      </table></div>}
    </Card> : tab === "plans" ? <>
      <Card title="Vzdělávací plány týmu" subtitle="Jeden řádek za pracovníka; podrobnosti se otevřou až po výběru." actions={<Field label="Rok"><Select value={year} onChange={(event) => setYear(Number(event.target.value))}>{educationYears.map((value) => <option key={value}>{value}</option>)}</Select></Field>}>
        {!rows.length ? <Empty>Nejsou založeni žádní pracovníci.</Empty> : <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm">
          <thead><tr className="border-b text-slate-500"><th className="p-2">Pracovník</th><th className="p-2">Stav plánu</th><th className="p-2 text-right">Plánované hodiny</th><th className="p-2 text-right">Předpokládané náklady</th><th className="p-2">Roční vyhodnocení</th><th className="p-2 text-right">Akce</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.employee.id} className={`border-b border-slate-100 ${dialog?.employeeId === row.employee.id ? "bg-blue-50/60" : ""}`}><td className="p-2"><strong>{row.employee.name}</strong>{row.employee.appRole === "manager" && <div className="text-xs text-slate-500">Odborný garant</div>}{row.employee.appRole === "director" && <div className="text-xs text-slate-500">Vedoucí služby/programu</div>}</td><td className="p-2"><StatusBadge status={row.plan?.status || "missing_plan"}/></td><td className="p-2 text-right font-semibold">{row.plan ? `${formatHours(row.plannedHours)} h` : "—"}</td><td className="p-2 text-right font-semibold">{row.plan ? formatMoney(row.plannedCost) : "—"}</td><td className="p-2">{row.plan?.evaluation ? <span className="font-semibold text-emerald-700">Vyplněno</span> : <span className="text-slate-500">Nevyplněno</span>}</td><td className="p-2"><div className="flex justify-end gap-2"><Button variant="secondary" className="whitespace-nowrap px-3 py-1.5" onClick={() => openDialog(row.employee.id, "plan")}><Eye className="mr-1 inline" size={16}/>Otevřít plán</Button><Button variant="secondary" className="whitespace-nowrap px-3 py-1.5" disabled={!row.plan} onClick={() => openDialog(row.employee.id, "annualEvaluation")}><ClipboardCheck className="mr-1 inline" size={16}/>Roční vyhodnocení</Button>{isDirector && row.plan && <Button variant="danger" className="whitespace-nowrap px-3 py-1.5" disabled={busy} onClick={() => deletePlan(row.plan, row.employee)}><Trash2 className="mr-1 inline" size={16}/>Smazat plán</Button>}</div></td></tr>)}</tbody>
          {isDirector && <tfoot className="border-t-2 bg-violet-50 font-bold text-violet-900"><tr><td className="p-2" colSpan="3">Schválené plány celkem</td><td className="p-2 text-right">{formatMoney(approvedCost)}</td><td colSpan="2"/></tr></tfoot>}
        </table></div>}
      </Card>
    </> : <>
      <Card title="Uskutečněné vzdělávání" subtitle="Společný přehled skutečně absolvovaného vzdělávání všech pracovníků." actions={<div className="flex flex-wrap items-end gap-2"><Field label="Rok"><Select value={year} onChange={(event) => setYear(Number(event.target.value))}>{educationYears.map((value) => <option key={value}>{value}</option>)}</Select></Field><Field label="Zapsat pro pracovníka"><Select value={recordEmployee?.id || ""} onChange={(event) => setRecordEmployeeId(event.target.value)}>{accessibleEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</Select></Field></div>}>
        {!yearRecords.length ? <Empty>Pro rok {year} zatím není zapsané žádné uskutečněné vzdělávání.</Empty> : <div className="overflow-x-auto"><table className="w-full min-w-[1200px] text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="p-2">Pracovník</th><th className="p-2">Datum a čas</th><th className="p-2">Vzdělávání</th><th className="p-2">Forma</th><th className="p-2">Poskytovatel</th><th className="p-2">Plní položku plánu</th><th className="p-2">Osvědčení</th><th className="p-2 text-right">Hodiny</th>{isDirector && <th className="p-2 text-right">Akce</th>}</tr></thead><tbody>{yearRecords.map((record) => <tr key={record.id} className="border-b border-slate-100"><td className="p-2 font-semibold">{record.employeeName}</td><td className="whitespace-nowrap p-2">{record.dateFrom || record.date}{record.dateTo && record.dateTo !== record.dateFrom ? ` – ${record.dateTo}` : ""}{record.timeFrom && record.timeTo && <span className="block text-xs text-slate-500">{record.timeFrom}–{record.timeTo}</span>}</td><td className="p-2 font-semibold">{record.title}</td><td className="p-2">{record.format}</td><td className="p-2">{record.provider || "—"}</td><td className="p-2"><Select disabled={busy} value={record.plannedActivityId || ""} onChange={(event) => linkRecord(record.id, event.target.value)}><option value="">Nepřiřazeno</option>{planActivitiesFor(record).map((activity) => <option key={activity.id} value={activity.id}>{activity.topic || activity.title}</option>)}</Select></td><td className="p-2">{(record.driveFileId || record.localFilePath) ? <Button variant="secondary" className="min-h-8 whitespace-nowrap px-2 py-1 text-xs" disabled={busy} onClick={() => previewCertificate(record)}><Eye className="mr-1 inline" size={14}/>Otevřít</Button> : <span className="text-slate-400">—</span>}</td><td className="p-2 text-right">{formatHours(record.hours)}</td>{isDirector && <td className="p-2 text-right"><Button variant="danger" className="min-h-8 px-2 py-1 text-xs" disabled={busy} onClick={() => deleteEducationRecord(record)}><Trash2 className="mr-1 inline" size={14}/>Smazat</Button></td>}</tr>)}</tbody><tfoot className="border-t-2 bg-slate-50 font-bold"><tr><td className="p-2" colSpan="7">Celkem za tým</td><td className="p-2 text-right">{formatHours(totalRecordedHours)} h</td>{isDirector && <td/>}</tr></tfoot></table></div>}
      </Card>
      {recordEmployee && <Education key={`records-${recordEmployee.id}-${year}`} employee={recordEmployee} actor={portal.employee} employees={portal.employees} positions={positions} project={project} plans={employeePlans(recordEmployee)} records={employeeRecords(recordEmployee)} onRefresh={onRefresh} initialYear={year} mode="records" showRecordList={false}/>}
    </>}
    {selectedEmployee && dialog && <Modal title={`${dialog.view === "employeeEvaluation" ? "Hodnocení zaměstnance" : dialog.view === "annualEvaluation" ? "Roční vyhodnocení" : "Vzdělávací plán"} · ${selectedEmployee.name}`} subtitle={`Rok ${year}`} onClose={() => setDialog(null)}>
      {dialog.view === "employeeEvaluation" ? <EmployeeEvaluation
        employee={selectedEmployee} actor={portal.employee} year={year} evaluation={evaluationFor(selectedEmployee)}
        previousEvaluation={evaluationFor(selectedEmployee, year - 1)} previousPlan={planFor(selectedEmployee, year - 1)}
        plan={planFor(selectedEmployee)} readOnly={!canEditEvaluation(selectedEmployee)} onRefresh={onRefresh}
        onOpenPlan={() => setDialog({ employeeId: selectedEmployee.id, view: "plan" })}
      /> : <Education key={`${selectedEmployee.id}-${year}-${dialog.view}`} employee={selectedEmployee} actor={portal.employee} employees={portal.employees} positions={positions} project={project} plans={employeePlans(selectedEmployee)} records={employeeRecords(selectedEmployee)} evaluations={employeeEvaluations(selectedEmployee)} sourceEvaluation={evaluationFor(selectedEmployee)} onRefresh={onRefresh} initialYear={year} mode={dialog.view === "annualEvaluation" ? "evaluation" : dialog.view}/>}
    </Modal>}
  </div>;
}
