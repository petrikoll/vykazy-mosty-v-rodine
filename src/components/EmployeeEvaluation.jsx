import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { api, jsonBody } from "../api.mjs";
import { Button, Empty, Field, Input, Notice, StatusBadge, Textarea, useTimedNotice } from "./Common.jsx";

const today = () => new Date().toLocaleDateString("sv-SE");
const makeGoal = (source = {}) => ({
  _key: source._key || `${Date.now()}-${Math.random()}`,
  id: source.id || "",
  text: source.text || "",
  successCriterion: source.successCriterion || "",
});
const emptyForm = () => ({
  evaluationDate: today(),
  previousGoalsEvaluation: "",
  strengths: "",
  developmentNeeds: "",
  professionalGoals: [makeGoal()],
});

const roleLabel = (role) => role === "manager" ? "Odborný garant" : role === "director" ? "Vedoucí služby/programu" : role === "project_manager" ? "Projektový manažer" : "Pracovník";

export default function EmployeeEvaluation({
  employee, actor, year, evaluation, previousEvaluation, previousPlan, plan, onRefresh, onOpenPlan, readOnly = false,
}) {
  const [form, setForm] = useState(emptyForm);
  const [notice, setNotice] = useTimedNotice();
  const [busy, setBusy] = useState(false);
  const locked = evaluation?.status === "closed" && plan?.status === "approved" && !["director", "project_manager"].includes(actor.appRole);
  const editable = !readOnly && !locked;

  useEffect(() => {
    setForm(evaluation ? {
      evaluationDate: evaluation.evaluationDate || today(),
      previousGoalsEvaluation: evaluation.previousGoalsEvaluation || "",
      strengths: evaluation.strengths || "",
      developmentNeeds: evaluation.developmentNeeds || "",
      professionalGoals: evaluation.professionalGoals?.length ? evaluation.professionalGoals.map(makeGoal) : [makeGoal()],
    } : emptyForm());
  }, [evaluation]);

  const previousGoals = useMemo(() => previousEvaluation?.professionalGoals || [], [previousEvaluation]);
  const setValue = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const setGoal = (key, field, value) => setForm((current) => ({
    ...current,
    professionalGoals: current.professionalGoals.map((goal) => goal._key === key ? { ...goal, [field]: value } : goal),
  }));

  const save = async (status) => {
    setBusy(true); setNotice(null);
    try {
      await api(`/api/employee-evaluations/${year}`, {
        method: "PUT",
        body: jsonBody({
          employeeId: employee.id,
          ...form,
          professionalGoals: form.professionalGoals.map(({ _key, ...goal }) => goal),
          status,
        }),
      });
      setNotice({ type: "success", text: status === "closed" ? "Hodnocení bylo uzavřeno a může sloužit jako podklad vzdělávacího plánu." : "Hodnocení bylo uloženo jako koncept." });
      await onRefresh();
    } catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); }
  };

  const display = evaluation || form;
  if (!editable && !evaluation) return <Empty>Hodnocení tohoto pracovníka zatím nebylo vytvořeno.</Empty>;

  return <div className="space-y-3">
    <Notice notice={notice}/>
    <div className="grid gap-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-3">
      <div><span className="block text-xs font-semibold text-slate-500">Zaměstnanec</span><strong>{employee.name}</strong></div>
      <div><span className="block text-xs font-semibold text-slate-500">Hodnotitel</span><strong>{evaluation?.evaluatorName || actor.name}</strong><span className="block text-xs text-slate-500">{roleLabel(evaluation?.evaluatorRole || actor.appRole)}</span></div>
      <div><span className="block text-xs font-semibold text-slate-500">Stav</span><StatusBadge status={evaluation?.status || "draft"}/></div>
    </div>

    {locked && <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">Hodnocení je uzamčené schváleným vzdělávacím plánem.</div>}

    {editable ? <>
      <div className="grid gap-3 sm:grid-cols-[190px_1fr] sm:items-end">
        <Field label="Datum hodnocení"><Input type="date" value={form.evaluationDate} onChange={(event) => setValue("evaluationDate", event.target.value)}/></Field>
        <Field label="Vyhodnocení předchozích profesních cílů" hint={previousGoals.length ? `Cíle z předchozího hodnocení: ${previousGoals.map((goal) => goal.text).join("; ")}` : previousPlan?.nextYearUpdate ? `Doporučení z minulého plánu: ${previousPlan.nextYearUpdate}` : "V prvním roce může zůstat prázdné."}>
          <Textarea compact value={form.previousGoalsEvaluation} onChange={(event) => setValue("previousGoalsEvaluation", event.target.value)} placeholder="Co se podařilo splnit a co pokračuje dál"/>
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Silné stránky a dosavadní kvalifikace"><Textarea compact value={form.strengths} onChange={(event) => setValue("strengths", event.target.value)} /></Field>
        <Field label="Rozvojové oblasti a potřeby další kvalifikace"><Textarea compact value={form.developmentNeeds} onChange={(event) => setValue("developmentNeeds", event.target.value)} /></Field>
      </div>

      <section className="rounded-lg border border-slate-200 p-3">
        <div className="mb-2 flex items-center justify-between gap-2"><div><h3 className="text-sm font-bold">Profesní cíle pro další období</h3><p className="text-xs text-slate-500">Nejvýše tři konkrétní a ověřitelné cíle.</p></div>{form.professionalGoals.length < 3 && <Button variant="secondary" className="px-2 py-1" onClick={() => setForm((current) => ({ ...current, professionalGoals: [...current.professionalGoals, makeGoal()] }))}><Plus className="mr-1 inline" size={15}/>Přidat cíl</Button>}</div>
        <div className="space-y-2">{form.professionalGoals.map((goal, index) => <div key={goal._key} className="grid gap-2 rounded-lg bg-slate-50 p-2 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <Field label={`Cíl ${index + 1}`}><Input value={goal.text} onChange={(event) => setGoal(goal._key, "text", event.target.value)} /></Field>
          <Field label="Jak poznáme, že byl splněn"><Input value={goal.successCriterion} onChange={(event) => setGoal(goal._key, "successCriterion", event.target.value)} /></Field>
          {form.professionalGoals.length > 1 && <button type="button" className="mb-1 rounded p-2 text-red-600 hover:bg-red-50" aria-label={`Odstranit cíl ${index + 1}`} onClick={() => setForm((current) => ({ ...current, professionalGoals: current.professionalGoals.filter((item) => item._key !== goal._key) }))}><Trash2 size={17}/></button>}
        </div>)}</div>
      </section>

      <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={() => save("draft")}>Uložit koncept</Button><Button disabled={busy} onClick={() => save("closed")}>Uzavřít hodnocení</Button></div>
    </> : <>
      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-lg border border-slate-200 p-3"><h3 className="text-xs font-bold uppercase text-slate-500">Silné stránky a kvalifikace</h3><p className="mt-1 whitespace-pre-wrap text-sm">{display.strengths || "Neuvedeno"}</p></section>
        <section className="rounded-lg border border-slate-200 p-3"><h3 className="text-xs font-bold uppercase text-slate-500">Rozvojové oblasti a potřeby kvalifikace</h3><p className="mt-1 whitespace-pre-wrap text-sm">{display.developmentNeeds || "Neuvedeno"}</p></section>
      </div>
      {display.previousGoalsEvaluation && <section className="rounded-lg border border-slate-200 p-3"><h3 className="text-xs font-bold uppercase text-slate-500">Vyhodnocení předchozích cílů</h3><p className="mt-1 whitespace-pre-wrap text-sm">{display.previousGoalsEvaluation}</p></section>}
      <section className="rounded-lg border border-slate-200 p-3"><h3 className="text-xs font-bold uppercase text-slate-500">Profesní cíle</h3><div className="mt-2 space-y-2">{(display.professionalGoals || []).map((goal, index) => <div key={goal.id || index} className="rounded-lg bg-slate-50 p-2 text-sm"><strong>{index + 1}. {goal.text}</strong><span className="mt-0.5 block text-xs text-slate-600">Splnění: {goal.successCriterion}</span></div>)}</div></section>
    </>}

    {evaluation?.status === "closed" && <div className="flex justify-end"><Button onClick={onOpenPlan}>{plan ? "Otevřít vzdělávací plán" : "Vytvořit vzdělávací plán"}<ArrowRight className="ml-1 inline" size={16}/></Button></div>}
  </div>;
}
