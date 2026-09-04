import React, { useRef, useState } from "react";
import { Archive, Eye, Pencil, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { api, jsonBody } from "../api.mjs";
import { createMeetingPdf, downloadBlob } from "../meetingPdf.mjs";
import { findTaskOwnerId, meetingMinutesFromRecord, meetingTasksFromRecord, normalizeTaskDeadline } from "../meetingUtils.mjs";
import { Button, Card, Empty, Field, Input, Modal, Notice, Select, StatusBadge, Textarea, useTimedNotice } from "./Common.jsx";

const emptyTask = () => ({ rowId: `row-${Date.now()}-${Math.random().toString(36).slice(2)}`, id: "", text: "", ownerId: "", deadline: "" });
const blankForm = () => ({ id: "", originalStatus: "", date: "", participantIds: [], externalParticipantNames: [], content: "", tasks: [emptyTask()] });
const MEETING_YEARS = [2026, 2027, 2028];
const currentMeetingYear = () => MEETING_YEARS.includes(new Date().getFullYear()) ? new Date().getFullYear() : MEETING_YEARS[0];

function taskRows(tasks = [], employees = []) {
  const rows = tasks.map((task) => ({
    rowId: `row-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    id: task.id || "",
    text: task.text || "",
    ownerId: task.ownerId || findTaskOwnerId(task.owner, employees),
    deadline: normalizeTaskDeadline(task.deadline),
  }));
  return rows.length ? rows : [emptyTask()];
}

export default function Meetings({ employee, employees, meetings, project, onRefresh }) {
  const isLeader = ["manager", "director"].includes(employee.appRole);
  const isDirector = employee.appRole === "director";
  const [form, setForm] = useState(blankForm);
  const [view, setView] = useState("archive");
  const [selectedYear, setSelectedYear] = useState(currentMeetingYear);
  const [externalName, setExternalName] = useState("");
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useTimedNotice();
  const importInput = useRef(null);
  const hasContent = Boolean(String(form.content || "").trim());
  const toggle = (id) => setForm((current) => ({ ...current, participantIds: current.participantIds.includes(id) ? current.participantIds.filter((item) => item !== id) : [...current.participantIds, id] }));
  const addExternalParticipant = () => {
    const name = externalName.trim();
    if (!name) return;
    setForm((current) => ({ ...current, externalParticipantNames: current.externalParticipantNames.includes(name) ? current.externalParticipantNames : [...current.externalParticipantNames, name] }));
    setExternalName("");
  };
  const removeExternalParticipant = (name) => setForm((current) => ({ ...current, externalParticipantNames: current.externalParticipantNames.filter((item) => item !== name) }));
  const updateTask = (rowId, patch) => setForm((current) => ({ ...current, tasks: current.tasks.map((task) => task.rowId === rowId ? { ...task, ...patch } : task) }));
  const addTask = () => setForm((current) => ({ ...current, tasks: [...current.tasks, emptyTask()] }));
  const removeTask = (rowId) => setForm((current) => {
    const tasks = current.tasks.filter((task) => task.rowId !== rowId);
    return { ...current, tasks: tasks.length ? tasks : [emptyTask()] };
  });
  const tasksForSave = () => form.tasks.filter((task) => String(task.text || "").trim()).map((task) => ({
    id: task.id || undefined,
    text: task.text.trim(),
    ownerId: task.ownerId || "",
    owner: employees.find((item) => item.id === task.ownerId)?.name || "",
    deadline: task.deadline || "",
  }));

  const useAi = async () => {
    setBusy(true); setNotice(null);
    try {
      const result = await api("/api/ai/meeting-minutes", { method: "POST", body: jsonBody(form) });
      setForm((current) => ({
        ...current,
        content: result.minutes || current.content,
        tasks: taskRows(result.tasks || [], employees),
      }));
      setNotice({ type: "info", text: (result.reviewNotes || []).length ? `Gemini připravila návrh. Zkontrolujte: ${(result.reviewNotes || []).join("; ")}` : "Gemini připravila návrh zápisu ke kontrole." });
    } catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); }
  };

  const importMeeting = async (file) => {
    if (!file) return;
    setBusy(true); setNotice(null);
    try {
      const body = new FormData(); body.append("file", file);
      const result = await api("/api/ai/meeting-import", { method: "POST", body });
      const unmatched = (result.participantNames || []).filter((name) => !(result.matchedParticipantNames || []).some((matched) => matched.includes(name) || name.includes(matched)));
      setForm({
        id: "", originalStatus: "", date: result.date || "", participantIds: result.participantIds || [],
        externalParticipantNames: result.externalParticipantNames || unmatched,
        content: result.minutes || "", tasks: taskRows(result.tasks || [], employees),
      });
      if (MEETING_YEARS.includes(Number(String(result.date || "").slice(0, 4)))) setSelectedYear(Number(String(result.date).slice(0, 4)));
      setView("form");
      const review = [...(result.reviewNotes || []), ...(unmatched.length ? [`Zkontrolujte účastníky: ${unmatched.join(", ")}`] : [])];
      setNotice({ type: review.length ? "warn" : "success", text: review.length ? `Zápis byl převeden. ${review.join("; ")}` : "Zápis byl převeden do formuláře. Před uložením jej zkontrolujte." });
    } catch (error) { setNotice({ type: "error", text: error.message }); } finally {
      setBusy(false);
      if (importInput.current) importInput.current.value = "";
    }
  };

  const save = async (withPdf) => {
    setBusy(true); setNotice(null);
    try {
      const endpoint = form.id ? `/api/meetings/${form.id}` : "/api/meetings";
      const saved = await api(endpoint, { method: form.id ? "PATCH" : "POST", body: jsonBody({ ...form, tasks: tasksForSave(), status: withPdf ? "submitted" : "draft" }) });
      if (withPdf) {
        const blob = await createMeetingPdf(saved.meeting, project);
        const body = new FormData(); body.append("file", blob, `${saved.meeting.date}__zapis.pdf`);
        await api(`/api/meetings/${saved.meeting.id}/pdf`, { method: "POST", body });
        downloadBlob(blob, `${saved.meeting.date}__zapis_z_porady.pdf`);
      }
      if (MEETING_YEARS.includes(Number(String(saved.meeting.date || "").slice(0, 4)))) setSelectedYear(Number(String(saved.meeting.date).slice(0, 4)));
      setForm(blankForm()); setExternalName(""); setView("archive"); setNotice({ type: "success", text: withPdf ? "Zápis byl dokončen, archivován a PDF staženo pro tisk." : "Koncept byl uložen. Kdykoli jej můžete znovu otevřít a dokončit." });
      await onRefresh();
    } catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); }
  };

  const edit = (meeting) => {
    setExternalName("");
    setForm({
      id: meeting.id,
      originalStatus: meeting.status || "draft",
      date: meeting.date || "",
      participantIds: meeting.participantIds || [],
      externalParticipantNames: meeting.externalParticipantNames || [],
      content: meetingMinutesFromRecord(meeting),
      tasks: taskRows(meetingTasksFromRecord(meeting, employees), employees),
    });
    setNotice(null);
    setView("form");
  };

  const selectedTasks = selectedMeeting ? meetingTasksFromRecord(selectedMeeting, employees) : [];
  const meetingsForYear = meetings.filter((meeting) => Number(String(meeting.date || "").slice(0, 4)) === selectedYear);

  const remove = async (meeting) => {
    if (!window.confirm(`Opravdu smazat zápis z porady ze dne ${meeting.date}?${meeting.driveFileId ? " PDF na Google Disku se přesune do koše." : ""}`)) return;
    setBusy(true); setNotice(null);
    try {
      await api(`/api/meetings/${meeting.id}`, { method: "DELETE" });
      setNotice({ type: "success", text: "Zápis z porady byl smazán." });
      await onRefresh();
    } catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); }
  };

  return <div className="space-y-3">
    <Notice notice={notice}/>
    {(view === "archive" || !isLeader) && <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-slate-300 bg-blue-50 p-1 shadow-sm">{MEETING_YEARS.map((year) => <button key={year} onClick={() => setSelectedYear(year)} className={`min-h-10 rounded-lg px-3 py-2 text-sm font-bold transition ${selectedYear === year ? "bg-blue-700 text-white shadow" : "text-blue-950 hover:bg-blue-100"}`}>Porady {year}</button>)}</div>}
    {view === "archive" || !isLeader ? <Card title="Porady a zápisy" subtitle={isLeader ? "Vytvořte nový zápis, nebo převeďte existující PDF, Word či fotografii do formuláře a následně do Sheetu." : "Zobrazeny jsou uložené zápisy z porad, kterých jste se účastnili nebo z nich máte přidělený úkol."} actions={isLeader ? <div className="flex flex-wrap gap-2"><input ref={importInput} className="hidden" type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp" onChange={(event) => importMeeting(event.target.files?.[0])}/><Button variant="secondary" disabled={busy} onClick={() => importInput.current?.click()}><Upload className="mr-1 inline" size={16}/>{busy ? "Rozpoznávám…" : "Nahrát zápis"}</Button><Button disabled={busy} onClick={() => { setForm(blankForm()); setExternalName(""); setView("form"); }}><Plus className="mr-1 inline" size={16}/>Vytvořit zápis</Button></div> : undefined}>
      {!meetingsForYear.length ? <Empty>Pro rok {selectedYear} zatím nebyl vytvořen žádný zápis.</Empty> : <div className="space-y-2">{meetingsForYear.toSorted((a,b) => b.date.localeCompare(a.date)).map((item) => <article key={item.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"><div><strong>{item.date} · Porada</strong><div className="text-sm text-slate-500">{(item.participantNames || []).join(", ")}</div></div><div className="flex flex-wrap items-center gap-2"><StatusBadge status={item.status}/><Button variant="secondary" className="min-h-8 px-2 py-1 text-xs" disabled={busy} onClick={() => setSelectedMeeting(item)}><Eye className="mr-1 inline" size={14}/>Zobrazit zápis</Button>{(isDirector || (item.createdBy === employee.id && item.status !== "archived")) && <Button variant="secondary" className="min-h-8 px-2 py-1 text-xs" disabled={busy} onClick={() => edit(item)}><Pencil className="mr-1 inline" size={14}/>{item.status === "archived" ? "Opravit zápis" : "Upravit a dokončit"}</Button>}{item.driveFileUrl && <a className="text-sm font-bold text-blue-700 underline" href={item.driveFileUrl} target="_blank" rel="noreferrer">Otevřít PDF</a>}{isDirector && <Button variant="danger" className="min-h-8 px-2 py-1 text-xs" disabled={busy} onClick={() => remove(item)}><Trash2 className="mr-1 inline" size={14}/>Smazat</Button>}</div></article>)}</div>}
    </Card> : <Card title={form.id ? "Upravit zápis z porady" : "Nový zápis z porady"} subtitle="Zápis patří do jednoho textového pole. Jednotlivé úkoly přiřaďte konkrétním pracovníkům v řádcích pod ním." actions={<Button variant="secondary" onClick={() => { setForm(blankForm()); setExternalName(""); setView("archive"); }}><Archive className="mr-1 inline" size={16}/>Zpět do archivu</Button>}>
      <div className="max-w-xs"><Field label="Datum"><Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}/></Field></div>
      <div className="mt-3"><div className="mb-1 text-xs font-bold text-slate-700">Účastníci</div><div className="flex flex-wrap gap-1.5">{employees.filter((item) => item.active !== false).map((item) => <label key={item.id} className={`cursor-pointer rounded-full border px-2.5 py-1.5 text-xs ${form.participantIds.includes(item.id) ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-300"}`}><input className="mr-1.5" type="checkbox" checked={form.participantIds.includes(item.id)} onChange={() => toggle(item.id)}/>{item.name}</label>)}</div></div>
      <div className="mt-3 max-w-2xl"><div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><Field label="Účastník mimo tým" hint="Napište jméno dalšího účastníka porady."><Input value={externalName} onChange={(e) => setExternalName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExternalParticipant(); } }} placeholder="Např. Petr Laštovica"/></Field><Button variant="secondary" disabled={!externalName.trim()} onClick={addExternalParticipant}><Plus className="mr-1 inline" size={15}/>Přidat účastníka</Button></div>{form.externalParticipantNames.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{form.externalParticipantNames.map((name) => <span key={name} className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-900">{name}<button type="button" className="ml-1 text-blue-700 hover:text-red-700" onClick={() => removeExternalParticipant(name)} aria-label={`Odebrat účastníka ${name}`}>×</button></span>)}</div>}</div>
      <div className="mt-3"><Field label="Zápis" hint="Můžete vložit i neuspořádané poznámky. Gemini je upraví a rozpoznané úkoly přenese do samostatných řádků."><Textarea className="min-h-48" value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} placeholder="Sem vložte průběh porady, rozhodnutí a závěry…"/></Field></div>
      <section className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-bold text-slate-900">Úkoly z porady</h3><p className="text-xs text-slate-500">Každý úkol zapište na jeden řádek, přiřaďte pracovníka a termín.</p></div><Button variant="secondary" className="min-h-8 px-2.5 py-1 text-xs" onClick={addTask}><Plus className="mr-1 inline" size={14}/>Přidat úkol</Button></div>
        <div className="space-y-2">{form.tasks.map((task, index) => <div key={task.rowId} className="grid items-end gap-2 rounded-lg border border-slate-200 bg-white p-2 md:grid-cols-[minmax(0,2fr)_minmax(170px,1fr)_160px_36px]">
          <Field label={`Úkol ${index + 1}`}><Input value={task.text} onChange={(e) => updateTask(task.rowId, { text: e.target.value })} placeholder="Stručné znění úkolu"/></Field>
          <Field label="Pracovník"><Select value={task.ownerId} onChange={(e) => updateTask(task.rowId, { ownerId: e.target.value })}><option value="">Nepřiřazeno</option>{employees.filter((item) => item.active !== false).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
          <Field label="Termín"><Input type="date" value={task.deadline} onChange={(e) => updateTask(task.rowId, { deadline: e.target.value })}/></Field>
          <Button variant="danger" className="min-h-9 px-2" onClick={() => removeTask(task.rowId)} aria-label={`Odstranit úkol ${index + 1}`}><Trash2 size={15}/></Button>
        </div>)}</div>
      </section>
      <div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" disabled={busy || !hasContent} onClick={useAi}><Sparkles className="mr-1 inline" size={16}/>Uspořádat zápis pomocí Gemini</Button>{form.originalStatus !== "archived" && <Button variant="secondary" disabled={busy || !form.date || !hasContent} onClick={() => save(false)}>{form.id ? "Uložit změny konceptu" : "Uložit koncept"}</Button>}<Button disabled={busy || !form.date || !hasContent} onClick={() => save(true)}>{form.originalStatus === "archived" ? "Uložit opravu a aktualizovat PDF" : "Dokončit, vytvořit PDF a vytisknout"}</Button></div>
    </Card>}
    {selectedMeeting && <Modal title={`Zápis z porady · ${selectedMeeting.date}`} subtitle={`Zapsal/a: ${selectedMeeting.createdByName || "—"}`} className="max-w-4xl" onClose={() => setSelectedMeeting(null)}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3"><div><div className="text-xs font-bold uppercase text-slate-500">Účastníci</div><div className="mt-1 text-sm text-slate-800">{(selectedMeeting.participantNames || []).join(", ") || "Neuvedeni"}</div></div><StatusBadge status={selectedMeeting.status}/></div>
        <section className="rounded-lg border border-slate-200 bg-white p-4"><h3 className="mb-3 font-bold text-slate-900">Zápis</h3><div className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{meetingMinutesFromRecord(selectedMeeting) || "Bez dalšího zápisu."}</div></section>
        <section className="rounded-lg border border-slate-200 bg-white p-4"><h3 className="mb-3 font-bold text-slate-900">Úkoly</h3>{!selectedTasks.length ? <div className="text-sm text-slate-500">Bez úkolů.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500"><th className="px-2 py-2">Úkol</th><th className="px-2 py-2">Pracovník</th><th className="px-2 py-2">Termín</th></tr></thead><tbody>{selectedTasks.map((task, index) => <tr key={task.id || `${task.text}-${index}`} className="border-b border-slate-100 last:border-0"><td className="px-2 py-2 font-semibold text-slate-900">{task.text}</td><td className="px-2 py-2">{employees.find((item) => item.id === task.ownerId)?.name || task.owner || "Nepřiřazeno"}</td><td className="px-2 py-2">{task.deadline || "—"}</td></tr>)}</tbody></table></div>}</section>
        <div className="flex flex-wrap justify-end gap-2">{(isDirector || (selectedMeeting.createdBy === employee.id && selectedMeeting.status !== "archived")) && <Button variant="secondary" onClick={() => { const item = selectedMeeting; setSelectedMeeting(null); edit(item); }}><Pencil className="mr-1 inline" size={16}/>{selectedMeeting.status === "archived" ? "Opravit zápis" : "Upravit a dokončit"}</Button>}<Button onClick={() => setSelectedMeeting(null)}>Zavřít</Button></div>
      </div>
    </Modal>}
  </div>;
}
