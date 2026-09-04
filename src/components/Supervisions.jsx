import React, { useState } from "react";
import { useGuardedState } from "../unsavedChanges.jsx";
import { api, jsonBody } from "../api.mjs";
import { calculateTimeRangeHours } from "../timeRange.mjs";
import { Plus, Trash2 } from "lucide-react";
import { Button, Card, Empty, Field, Input, Notice, Select, useTimedNotice } from "./Common.jsx";

const TYPE_LABEL = { individual: "Individuální", team: "Týmová" };

export default function Supervisions({ employee, employees, records, onRefresh }) {
  const isLeader = ["manager", "director", "project_manager"].includes(employee.appRole);
  const isAdmin = ["director", "project_manager"].includes(employee.appRole);
  const [view, setView] = useState("records");
  const [form, setForm, resetForm, formGuard] = useGuardedState({ date: "", type: "team", supervisor: "", timeFrom: "", timeTo: "", participantIds: isLeader ? [] : [employee.id] });
  const [notice, setNotice] = useTimedNotice();
  const [busy, setBusy] = useState(false);
  const supervisionHours = calculateTimeRangeHours(form.timeFrom, form.timeTo);
  const toggleParticipant = (id) => setForm((current) => ({ ...current, participantIds: current.participantIds.includes(id) ? current.participantIds.filter((item) => item !== id) : [...current.participantIds, id] }));

  const save = async () => {
    setBusy(true); setNotice(null);
    try {
      await api("/api/supervisions", { method: "POST", body: jsonBody({ ...form, hours: supervisionHours }) });
      resetForm({ date: "", type: "team", supervisor: "", timeFrom: "", timeTo: "", participantIds: isLeader ? [] : [employee.id] }); setView("records");
      setNotice({ type: "success", text: "Supervize byla zaznamenána." });
      await onRefresh();
    } catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); }
  };

  const remove = async (record) => {
    if (!window.confirm(`Opravdu smazat supervizi ze dne ${record.date}?`)) return;
    setBusy(true); setNotice(null);
    try {
      await api(`/api/supervisions/${record.id}`, { method: "DELETE" });
      setNotice({ type: "success", text: "Supervize byla smazána." });
      await onRefresh();
    } catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); }
  };

  return <fieldset disabled={busy} className="min-w-0 space-y-3">
    <Notice notice={notice}/>
    {view === "records" || !isLeader ? <Card title="Evidence supervizí" subtitle={isLeader ? "Projekt počítá nejméně s jedním setkáním za dva měsíce, celkem se 14 setkáními." : "Zobrazeny jsou supervize, kterých jste se účastnili."} actions={isLeader ? <Button compact onClick={() => setView("form")}><Plus className="mr-1 inline" size={16}/>Přidat supervizi</Button> : undefined}>
      {!records.length ? <Empty>Zatím není zaznamenána žádná supervize.</Empty> : <div className="space-y-2">{records.toSorted((a,b) => b.date.localeCompare(a.date)).map((item) => <article key={item.id} className="rounded-lg border border-slate-200 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold">{item.date} · {TYPE_LABEL[item.type] || (item.type === "group" ? "Týmová" : item.type)}</h3>
          <div className="flex items-center gap-2"><span className="text-xs text-slate-600">{item.timeFrom && item.timeTo ? `${item.timeFrom}–${item.timeTo} · ` : ""}<strong>{item.hours} h</strong></span>{isAdmin && <Button compact variant="danger" disabled={busy} onClick={() => remove(item)}><Trash2 className="mr-1 inline" size={14}/>Smazat</Button>}</div>
        </div>
        <div className="mt-1 grid gap-1 text-xs text-slate-600 sm:grid-cols-[minmax(140px,1fr)_2fr]"><div><span className="text-slate-500">Supervizor: </span>{item.supervisor || "Neuveden"}</div><div><span className="text-slate-500">Účastníci: </span>{(item.participantNames || []).join(", ") || "Neuvedeni"}</div></div>
      </article>)}</div>}
    </Card> : <Card title="Zaznamenat supervizi" tone="blue" subtitle="Vyplňte termín, supervizora a účastníky. Délka se vypočítá automaticky." actions={<Button variant="secondary" onClick={() => { if (!formGuard.confirmDiscard()) return; resetForm({ date: "", type: "team", supervisor: "", timeFrom: "", timeTo: "", participantIds: isLeader ? [] : [employee.id] }); setView("records"); }}>Zpět na přehled</Button>}>
      <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Field label="Datum"><Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}/></Field>
        <Field label="Typ"><Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>{Object.entries(TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
        <Field label="Supervizor"><Input value={form.supervisor} onChange={(e) => setForm((f) => ({ ...f, supervisor: e.target.value }))}/></Field>
        <Field label="Čas od"><Input type="time" value={form.timeFrom} onChange={(e) => setForm((f) => ({ ...f, timeFrom: e.target.value }))}/></Field>
        <Field label="Čas do"><Input type="time" value={form.timeTo} onChange={(e) => setForm((f) => ({ ...f, timeTo: e.target.value }))}/></Field>
        <Field label="Délka"><Input readOnly value={supervisionHours > 0 ? `${supervisionHours.toLocaleString("cs-CZ")} h` : "—"}/></Field>
      </div>
      {isLeader && <div className="mt-3"><div className="mb-1 text-xs font-bold text-slate-700">Účastníci</div><div className="flex flex-wrap gap-1.5">{employees.filter((item) => item.active !== false).map((item) => <label key={item.id} className={`cursor-pointer rounded-full border px-2.5 py-1.5 text-xs ${form.participantIds.includes(item.id) ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-300"}`}><input className="mr-1.5" type="checkbox" checked={form.participantIds.includes(item.id)} onChange={() => toggleParticipant(item.id)}/>{item.name}</label>)}</div></div>}
      <Button className="mt-3" disabled={busy || supervisionHours <= 0} onClick={save}>Uložit supervizi</Button>
    </Card>}
  </fieldset>;
}
