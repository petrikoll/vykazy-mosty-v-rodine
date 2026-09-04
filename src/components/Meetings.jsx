import React, { useRef, useState } from "react";
import { confirmUnsavedChanges, useGuardedState } from "../unsavedChanges.jsx";
import { Archive, Eye, Pencil, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { api, jsonBody } from "../api.mjs";
import { createMeetingPdf, downloadBlob } from "../meetingPdf.mjs";
import { findExternalTaskOwnerName, findTaskOwnerId, meetingFollowUpTasks, meetingMinutesFromRecord, meetingTaskIdentity, meetingTasksFromRecord, normalizeTaskDeadline, unresolvedMeetingTasks } from "../meetingUtils.mjs";
import { Button, Card, Empty, Field, Input, Modal, Notice, SectionTabs, StatusBadge, Textarea, useTimedNotice } from "./Common.jsx";

const emptyTask = () => ({ rowId: `row-${Date.now()}-${Math.random().toString(36).slice(2)}`, id: "", text: "", ownerIds: [], externalOwnerNames: [], ownerId: "", owner: "", deadline: "" });
const blankForm = (date = "", followUpTasks = []) => ({ id: "", originalStatus: "", date, participantIds: [], externalParticipantNames: [], content: "", tasks: [emptyTask()], followUpTasks });
const MEETING_YEARS = [2026, 2027, 2028];
const currentMeetingYear = () => MEETING_YEARS.includes(new Date().getFullYear()) ? new Date().getFullYear() : MEETING_YEARS[0];
const localToday = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

function taskRows(tasks = [], employees = [], externalParticipantNames = [], withEmptyFallback = true) {
  const rows = tasks.map((task) => {
    const legacyOwnerId = task.ownerId || findTaskOwnerId(task.owner, employees);
    const ownerIds = [...new Set([...(task.ownerIds || []), legacyOwnerId].filter(Boolean))];
    const legacyExternalOwner = ownerIds.length ? "" : findExternalTaskOwnerName(task.owner, externalParticipantNames);
    return {
      rowId: `row-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      id: task.id || "",
      text: task.text || "",
      ownerIds,
      externalOwnerNames: task.externalOwnerNames?.length ? task.externalOwnerNames : legacyExternalOwner ? [legacyExternalOwner] : [],
      ownerId: ownerIds[0] || "",
      owner: task.owner || "",
      deadline: normalizeTaskDeadline(task.deadline),
      status: task.status || "",
      completionText: task.completionText || "",
      completionRecipientIds: task.completionRecipientIds || [],
      completionRecipientNames: task.completionRecipientNames || [],
      completedAt: task.completedAt || "",
      completedBy: task.completedBy || "",
      completedByName: task.completedByName || "",
      sourceMeetingId: task.sourceMeetingId || "",
      sourceMeetingDate: task.sourceMeetingDate || "",
    };
  });
  return rows.length ? rows : withEmptyFallback ? [emptyTask()] : [];
}

function mergeRecognizedTasksWithFollowUps(recognizedTasks, followUpTasks) {
  const updatedFollowUps = [...followUpTasks];
  const newTasks = [];
  recognizedTasks.forEach((task) => {
    const identity = meetingTaskIdentity(task.text);
    const index = updatedFollowUps.findIndex((item) => meetingTaskIdentity(item.text) === identity);
    if (index < 0) {
      newTasks.push(task);
      return;
    }
    const original = updatedFollowUps[index];
    updatedFollowUps[index] = {
      ...original,
      ownerIds: task.ownerIds?.length ? task.ownerIds : original.ownerIds,
      ownerId: task.ownerIds?.length ? task.ownerIds[0] : original.ownerId,
      externalOwnerNames: task.externalOwnerNames?.length ? task.externalOwnerNames : original.externalOwnerNames,
      deadline: task.deadline || original.deadline,
    };
  });
  return { followUpTasks: updatedFollowUps, tasks: newTasks.length ? newTasks : [emptyTask()] };
}

function taskOwnerNames(task, employees) {
  return [
    ...(task.ownerIds || []).map((id) => employees.find((employee) => employee.id === id)?.name).filter(Boolean),
    ...(task.externalOwnerNames || []),
  ];
}

function TaskOwnerPicker({ task, employees, externalParticipantNames, onChange }) {
  const names = taskOwnerNames(task, employees);
  const availableExternalNames = [...new Set([...(externalParticipantNames || []), ...(task.externalOwnerNames || [])])];
  const toggleEmployee = (id) => {
    const ownerIds = (task.ownerIds || []).includes(id)
      ? task.ownerIds.filter((item) => item !== id)
      : [...(task.ownerIds || []), id];
    onChange({ ownerIds, ownerId: ownerIds[0] || "" });
  };
  const toggleExternal = (name) => {
    const externalOwnerNames = (task.externalOwnerNames || []).includes(name)
      ? task.externalOwnerNames.filter((item) => item !== name)
      : [...(task.externalOwnerNames || []), name];
    onChange({ externalOwnerNames });
  };
  return <details className="group relative">
    <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none hover:border-blue-500 focus:ring-2 focus:ring-blue-100">
      <span className={`min-w-0 truncate ${names.length ? "text-slate-900" : "text-slate-500"}`}>{names.length ? names.join(", ") : "Nepřiřazeno"}</span>
      <span className="shrink-0 text-[10px] text-slate-500 group-open:rotate-180">▼</span>
    </summary>
    <div className="absolute left-0 z-30 mt-1 max-h-64 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-slate-300 bg-white p-2 shadow-xl">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Pracovníci týmu</div>
      {employees.filter((item) => item.active !== false).map((item) => <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5 text-xs hover:bg-blue-50"><input type="checkbox" checked={(task.ownerIds || []).includes(item.id)} onChange={() => toggleEmployee(item.id)}/><span>{item.name}</span></label>)}
      {availableExternalNames.length > 0 && <><div className="mb-1 mt-2 border-t border-slate-100 pt-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Účastníci mimo tým</div>{availableExternalNames.map((name) => <label key={name} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5 text-xs hover:bg-blue-50"><input type="checkbox" checked={(task.externalOwnerNames || []).includes(name)} onChange={() => toggleExternal(name)}/><span>{name}</span></label>)}</>}
    </div>
  </details>;
}

export default function Meetings({ employee, employees, meetings, project, onRefresh }) {
  const isLeader = ["manager", "director", "project_manager"].includes(employee.appRole);
  const isAdmin = ["director", "project_manager"].includes(employee.appRole);
  const [form, setForm, resetForm] = useGuardedState(blankForm);
  const [view, setView] = useState("archive");
  const [selectedYear, setSelectedYear] = useState(currentMeetingYear);
  const [externalName, setExternalName, resetExternalName] = useGuardedState("");
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useTimedNotice();
  const importInput = useRef(null);
  const hasContent = Boolean(String(form.content || "").trim());
  const followUpsForDate = (date, excludeMeetingId = "") => taskRows(
    unresolvedMeetingTasks(meetings, employees, { beforeDate: date, excludeMeetingId }),
    employees,
    [],
    false,
  );
  const startNewMeeting = () => {
    if (!confirmUnsavedChanges()) return;
    const date = localToday();
    resetForm(blankForm(date, followUpsForDate(date)));
    resetExternalName("");
    setNotice(null);
    setView("form");
  };
  const changeMeetingDate = (date) => setForm((current) => {
    if (current.id) return { ...current, date };
    const currentByReference = new Map((current.followUpTasks || []).map((task) => [`${task.sourceMeetingId}:${task.id}`, task]));
    const followUpTasks = followUpsForDate(date).map((task) => currentByReference.get(`${task.sourceMeetingId}:${task.id}`) || task);
    return { ...current, date, followUpTasks };
  });
  const toggle = (id) => setForm((current) => ({ ...current, participantIds: current.participantIds.includes(id) ? current.participantIds.filter((item) => item !== id) : [...current.participantIds, id] }));
  const addExternalParticipant = () => {
    const name = externalName.trim();
    if (!name) return;
    setForm((current) => ({ ...current, externalParticipantNames: current.externalParticipantNames.includes(name) ? current.externalParticipantNames : [...current.externalParticipantNames, name] }));
    setExternalName("");
  };
  const removeExternalParticipant = (name) => setForm((current) => ({
    ...current,
    externalParticipantNames: current.externalParticipantNames.filter((item) => item !== name),
    tasks: current.tasks.map((task) => ({ ...task, externalOwnerNames: (task.externalOwnerNames || []).filter((item) => item !== name) })),
  }));
  const updateTask = (rowId, patch) => setForm((current) => ({ ...current, tasks: current.tasks.map((task) => task.rowId === rowId ? { ...task, ...patch } : task) }));
  const addTask = () => setForm((current) => ({ ...current, tasks: [...current.tasks, emptyTask()] }));
  const removeTask = (rowId) => setForm((current) => {
    const tasks = current.tasks.filter((task) => task.rowId !== rowId);
    return { ...current, tasks: tasks.length ? tasks : [emptyTask()] };
  });
  const tasksForSave = (tasks = form.tasks) => tasks.filter((task) => String(task.text || "").trim()).map((task) => ({
    id: task.id || undefined,
    text: task.text.trim(),
    ownerIds: task.ownerIds || [],
    externalOwnerNames: task.externalOwnerNames || [],
    ownerId: task.ownerIds?.[0] || "",
    owner: taskOwnerNames(task, employees).join(", "),
    deadline: task.deadline || "",
    ...(task.sourceMeetingId ? { sourceMeetingId: task.sourceMeetingId, sourceMeetingDate: task.sourceMeetingDate || "" } : {}),
  }));

  const useAi = async () => {
    setBusy(true); setNotice(null);
    try {
      const result = await api("/api/ai/meeting-minutes", { method: "POST", body: jsonBody(form) });
      setForm((current) => ({
        ...current,
        content: result.minutes || current.content,
        ...mergeRecognizedTasksWithFollowUps(
          taskRows(result.tasks || [], employees, current.externalParticipantNames),
          current.followUpTasks || [],
        ),
      }));
      const reviewCount = (result.reviewNotes || []).length;
      setNotice({ type: "info", text: reviewCount ? `Gemini připravila návrh. Ve formuláři zkontrolujte rozpoznané údaje (${reviewCount} upozornění).` : "Gemini připravila návrh zápisu ke kontrole." });
    } catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); }
  };

  const importMeeting = async (file) => {
    if (!file) return;
    if (!confirmUnsavedChanges()) return;
    setBusy(true); setNotice(null);
    try {
      const body = new FormData(); body.append("file", file);
      const result = await api("/api/ai/meeting-import", { method: "POST", body });
      const unmatched = (result.participantNames || []).filter((name) => !(result.matchedParticipantNames || []).some((matched) => matched.includes(name) || name.includes(matched)));
      const externalParticipantNames = result.externalParticipantNames || unmatched;
      const date = result.date || "";
      const followUpTasks = followUpsForDate(date);
      const recognized = mergeRecognizedTasksWithFollowUps(taskRows(result.tasks || [], employees, externalParticipantNames), followUpTasks);
      setForm({
        id: "", originalStatus: "", date, participantIds: result.participantIds || [],
        externalParticipantNames,
        content: result.minutes || "", tasks: recognized.tasks, followUpTasks: recognized.followUpTasks,
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
      const saved = await api(endpoint, { method: form.id ? "PATCH" : "POST", body: jsonBody({ ...form, tasks: tasksForSave(), followUpTasks: tasksForSave(form.followUpTasks || []), status: withPdf ? "submitted" : "draft" }) });
      // If subsequent PDF upload fails, retry updates THIS meeting, not a new one.
      resetForm((current) => ({ ...current, id: saved.meeting.id, originalStatus: saved.meeting.status }));
      resetExternalName("");
      if (withPdf) {
        const blob = await createMeetingPdf(saved.meeting, project);
        const body = new FormData(); body.append("file", blob, `${saved.meeting.date}__zapis.pdf`);
        await api(`/api/meetings/${saved.meeting.id}/pdf`, { method: "POST", body });
        downloadBlob(blob, `${saved.meeting.date}__zapis_z_porady.pdf`);
      }
      if (MEETING_YEARS.includes(Number(String(saved.meeting.date || "").slice(0, 4)))) setSelectedYear(Number(String(saved.meeting.date).slice(0, 4)));
      const continuityNotice = saved.mergedTaskCount ? ` ${saved.mergedTaskCount === 1 ? "Opakovaný úkol byl propojen s původním záznamem" : `${saved.mergedTaskCount} opakované úkoly byly propojeny s původními záznamy`}; nevznikla duplicita.` : "";
      resetForm(blankForm()); resetExternalName(""); setView("archive"); setNotice({ type: "success", text: `${withPdf ? "Zápis byl dokončen, archivován a PDF staženo pro tisk." : "Koncept byl uložen. Kdykoli jej můžete znovu otevřít a dokončit."}${continuityNotice}` });
      await onRefresh();
    } catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); }
  };

  const edit = (meeting) => {
    if (!confirmUnsavedChanges()) return;
    resetExternalName("");
    resetForm({
      id: meeting.id,
      originalStatus: meeting.status || "draft",
      date: meeting.date || "",
      participantIds: meeting.participantIds || [],
      externalParticipantNames: meeting.externalParticipantNames || [],
      content: meetingMinutesFromRecord(meeting),
      tasks: taskRows(meetingTasksFromRecord(meeting, employees), employees, meeting.externalParticipantNames || []),
      followUpTasks: taskRows(meetingFollowUpTasks(meeting, meetings, employees), employees, meeting.externalParticipantNames || [], false),
    });
    setNotice(null);
    setView("form");
  };

  const selectedTasks = selectedMeeting ? [...meetingFollowUpTasks(selectedMeeting, meetings, employees), ...meetingTasksFromRecord(selectedMeeting, employees)] : [];
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

  return <fieldset disabled={busy} className="min-w-0 space-y-3">
    <Notice notice={notice}/>
    {(view === "archive" || !isLeader) && <SectionTabs label="Rok porady" value={selectedYear} onChange={setSelectedYear} items={MEETING_YEARS.map((year) => ({ value: year, label: `Porady ${year}` }))}/>}
    {view === "archive" || !isLeader ? <Card title="Přehled zápisů" subtitle={isLeader ? "Zápisy a úkoly z porad. Nový zápis můžete napsat nebo nahrát ze souboru." : "Zobrazeny jsou uložené zápisy z porad, kterých jste se účastnili nebo z nich máte přidělený úkol."} actions={isLeader ? <div className="flex flex-wrap gap-2"><input ref={importInput} className="hidden" type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp" onChange={(event) => importMeeting(event.target.files?.[0])}/><Button compact variant="secondary" disabled={busy} onClick={() => importInput.current?.click()}><Upload className="mr-1 inline" size={16}/>{busy ? "Rozpoznávám…" : "Nahrát zápis"}</Button><Button compact disabled={busy} onClick={startNewMeeting}><Plus className="mr-1 inline" size={16}/>Vytvořit zápis</Button></div> : undefined}>
      {!meetingsForYear.length ? <Empty>Pro rok {selectedYear} zatím nebyl vytvořen žádný zápis.</Empty> : <div className="space-y-2">{meetingsForYear.toSorted((a,b) => b.date.localeCompare(a.date)).map((item) => <article key={item.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0 flex-1"><h3 className="text-sm font-bold">{item.date} · Porada</h3><div className="mt-0.5 text-xs text-slate-500">{(item.participantNames || []).join(", ")}</div></div><div className="flex flex-wrap items-center gap-2"><StatusBadge status={item.status}/><Button variant="secondary" className="min-h-8 px-2 py-1 text-xs" disabled={busy} onClick={() => setSelectedMeeting(item)}><Eye className="mr-1 inline" size={14}/>Zobrazit zápis</Button>{(isAdmin || (item.createdBy === employee.id && item.status !== "archived")) && <Button variant="secondary" className="min-h-8 px-2 py-1 text-xs" disabled={busy} onClick={() => edit(item)}><Pencil className="mr-1 inline" size={14}/>{item.status === "archived" ? "Opravit zápis" : "Upravit a dokončit"}</Button>}{item.driveFileUrl && <a className="text-sm font-bold text-blue-700 underline" href={item.driveFileUrl} target="_blank" rel="noreferrer">Otevřít PDF</a>}{isAdmin && <Button variant="danger" className="min-h-8 px-2 py-1 text-xs" disabled={busy} onClick={() => remove(item)}><Trash2 className="mr-1 inline" size={14}/>Smazat</Button>}</div></article>)}</div>}
    </Card> : <Card tone="blue" title={form.id ? "Upravit zápis z porady" : "Nový zápis z porady"} subtitle="Zápis patří do jednoho textového pole. Jednotlivé úkoly přiřaďte členům týmu nebo účastníkům mimo tým." actions={<Button variant="secondary" onClick={() => { if (!confirmUnsavedChanges()) return; resetForm(blankForm()); resetExternalName(""); setView("archive"); }}><Archive className="mr-1 inline" size={16}/>Zpět do archivu</Button>}>
      <div className="grid items-end gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
        <Field label="Datum"><Input type="date" value={form.date} onChange={(e) => changeMeetingDate(e.target.value)}/></Field>
        <div><div className="mb-1 text-xs font-bold leading-4 text-slate-700">Účastníci z týmu</div><div className="flex min-h-9 flex-wrap items-center gap-1">{employees.filter((item) => item.active !== false).map((item) => <label key={item.id} className={`cursor-pointer rounded-full border px-2 py-1 text-xs leading-4 ${form.participantIds.includes(item.id) ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-300 bg-white"}`}><input className="mr-1" type="checkbox" checked={form.participantIds.includes(item.id)} onChange={() => toggle(item.id)}/>{item.name}</label>)}</div></div>
      </div>
      <div className="mt-3 max-w-2xl"><div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><Field label="Účastník mimo tým" hint="Napište jméno dalšího účastníka porady."><Input value={externalName} onChange={(e) => setExternalName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExternalParticipant(); } }} placeholder="Např. Petr Laštovica"/></Field><Button variant="secondary" disabled={!externalName.trim()} onClick={addExternalParticipant}><Plus className="mr-1 inline" size={15}/>Přidat účastníka</Button></div>{form.externalParticipantNames.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{form.externalParticipantNames.map((name) => <span key={name} className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-900">{name}<button type="button" className="ml-1 text-blue-700 hover:text-red-700" onClick={() => removeExternalParticipant(name)} aria-label={`Odebrat účastníka ${name}`}>×</button></span>)}</div>}</div>
      <div className="mt-3"><Field label="Zápis" hint="Můžete vložit i neuspořádané poznámky. Gemini je upraví a rozpoznané úkoly přenese do samostatných řádků."><Textarea className="min-h-48" value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} placeholder="Sem vložte průběh porady, rozhodnutí a závěry…"/></Field></div>
      {(form.followUpTasks || []).length > 0 && <section className="mt-4 rounded-xl border border-amber-300 bg-amber-50/90 p-2.5">
        <div className="mb-2"><h3 className="font-bold text-slate-900">Nesplněné úkoly z předchozích porad</h3><p className="text-xs text-slate-600">Úkoly se pouze připomínají. Změna termínu nebo odpovědné osoby upraví původní úkol a nevytvoří jeho kopii.</p></div>
        <div className="mb-1 hidden grid-cols-[minmax(0,2.2fr)_minmax(180px,1fr)_138px] gap-1.5 px-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 md:grid"><span>Pokračující úkol</span><span>Odpovědné osoby</span><span>Termín</span></div>
        <div className="space-y-1.5">{form.followUpTasks.map((task) => <div key={`${task.sourceMeetingId}:${task.id}`} className="grid items-end gap-1.5 rounded-md border border-amber-200 bg-white p-1.5 md:grid-cols-[minmax(0,2.2fr)_minmax(180px,1fr)_138px]">
          <label className="block"><span className="mb-0.5 block text-[11px] font-semibold text-slate-600 md:sr-only">Pokračující úkol</span><Input className="min-h-8 bg-slate-50 py-1 text-xs font-semibold" value={task.text} readOnly title={`Původně zadáno na poradě ${task.sourceMeetingDate || "—"}`}/><span className="mt-0.5 block text-[10px] text-slate-500">Z porady {task.sourceMeetingDate || "—"}</span></label>
          <div className="block"><span className="mb-0.5 block text-[11px] font-semibold text-slate-600 md:sr-only">Odpovědné osoby</span><TaskOwnerPicker task={task} employees={employees} externalParticipantNames={form.externalParticipantNames} onChange={(patch) => setForm((current) => ({ ...current, followUpTasks: current.followUpTasks.map((item) => item.rowId === task.rowId ? { ...item, ...patch } : item) }))}/></div>
          <label className="block"><span className="mb-0.5 block text-[11px] font-semibold text-slate-600 md:sr-only">Nový termín</span><Input className="min-h-8 px-1.5 py-1 text-xs" type="date" value={task.deadline} onChange={(e) => setForm((current) => ({ ...current, followUpTasks: current.followUpTasks.map((item) => item.rowId === task.rowId ? { ...item, deadline: e.target.value } : item) }))}/></label>
        </div>)}</div>
      </section>}
      <section className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-2.5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-bold text-slate-900">Úkoly z porady</h3><p className="text-xs text-slate-500">Každý úkol zapište na jeden řádek, označte jednu nebo více odpovědných osob a termín.</p></div><Button variant="secondary" className="min-h-8 px-2.5 py-1 text-xs" onClick={addTask}><Plus className="mr-1 inline" size={14}/>Přidat úkol</Button></div>
        <div className="mb-1 hidden grid-cols-[minmax(0,2.2fr)_minmax(180px,1fr)_138px_32px] gap-1.5 px-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 md:grid"><span>Úkol</span><span>Odpovědné osoby</span><span>Termín</span><span/></div>
        <div className="space-y-1.5">{form.tasks.map((task, index) => <div key={task.rowId} className="grid items-end gap-1.5 rounded-md border border-slate-200 bg-white p-1.5 md:grid-cols-[minmax(0,2.2fr)_minmax(180px,1fr)_138px_32px]">
          <label className="block"><span className="mb-0.5 block text-[11px] font-semibold text-slate-600 md:sr-only">Úkol {index + 1}</span><Input className="min-h-8 py-1 text-xs" value={task.text} onChange={(e) => updateTask(task.rowId, { text: e.target.value })} placeholder={`Úkol ${index + 1}`}/></label>
          <div className="block"><span className="mb-0.5 block text-[11px] font-semibold text-slate-600 md:sr-only">Odpovědné osoby</span><TaskOwnerPicker task={task} employees={employees} externalParticipantNames={form.externalParticipantNames} onChange={(patch) => updateTask(task.rowId, patch)}/></div>
          <label className="block"><span className="mb-0.5 block text-[11px] font-semibold text-slate-600 md:sr-only">Termín</span><Input className="min-h-8 px-1.5 py-1 text-xs" type="date" value={task.deadline} onChange={(e) => updateTask(task.rowId, { deadline: e.target.value })}/></label>
          <Button variant="danger" className="min-h-8 px-1.5 py-1" onClick={() => removeTask(task.rowId)} aria-label={`Odstranit úkol ${index + 1}`}><Trash2 className="mx-auto" size={14}/></Button>
        </div>)}</div>
      </section>
      <div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" disabled={busy || !hasContent} onClick={useAi}><Sparkles className="mr-1 inline" size={16}/>Uspořádat zápis pomocí Gemini</Button>{form.originalStatus !== "archived" && <Button variant="secondary" disabled={busy || !form.date || !hasContent} onClick={() => save(false)}>{form.id ? "Uložit změny konceptu" : "Uložit koncept"}</Button>}<Button disabled={busy || !form.date || !hasContent} onClick={() => save(true)}>{form.originalStatus === "archived" ? "Uložit opravu a aktualizovat PDF" : "Dokončit, vytvořit PDF a vytisknout"}</Button></div>
    </Card>}
    {selectedMeeting && <Modal title={`Zápis z porady · ${selectedMeeting.date}`} subtitle={`Zapsal/a: ${selectedMeeting.createdByName || "—"}`} className="max-w-4xl" onClose={() => setSelectedMeeting(null)}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3"><div><div className="text-xs font-bold uppercase text-slate-500">Účastníci</div><div className="mt-1 text-sm text-slate-800">{(selectedMeeting.participantNames || []).join(", ") || "Neuvedeni"}</div></div><StatusBadge status={selectedMeeting.status}/></div>
        <section className="rounded-lg border border-slate-300 bg-white"><h3 className="rounded-t-lg border-b border-slate-200 bg-slate-100 px-3 py-2 text-sm font-bold text-slate-900">Zápis</h3><div className="whitespace-pre-wrap p-3 text-sm leading-6 text-slate-800">{meetingMinutesFromRecord(selectedMeeting) || "Bez dalšího zápisu."}</div></section>
        <section className="rounded-lg border border-slate-200 bg-white p-4"><h3 className="mb-3 font-bold text-slate-900">Úkoly</h3>{!selectedTasks.length ? <div className="text-sm text-slate-500">Bez úkolů.</div> : <div className="overflow-x-auto"><table className="record-table w-full min-w-[700px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500"><th className="px-2 py-2">Úkol</th><th className="px-2 py-2">Odpovědné osoby</th><th className="px-2 py-2">Termín</th><th className="px-2 py-2">Stav</th></tr></thead><tbody>{selectedTasks.map((task, index) => <tr key={task.id || `${task.text}-${index}`} className="border-b border-slate-100 align-top last:border-0"><td className="px-2 py-2"><strong className="text-slate-900">{task.text}</strong>{task.status === "completed" && <details className="mt-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-950"><summary className="cursor-pointer font-semibold">Zobrazit řešení úkolu</summary><div className="mt-1 whitespace-pre-wrap">{task.completionText}</div><div className="mt-1 text-[11px] text-emerald-800">Vyřídil/a {task.completedByName || "pracovník"}{task.completedAt ? ` · ${new Intl.DateTimeFormat("cs-CZ", { dateStyle: "short", timeStyle: "short" }).format(new Date(task.completedAt))}` : ""}{task.completionRecipientNames?.length ? ` · odesláno: ${task.completionRecipientNames.join(", ")}` : ""}</div></details>}</td><td className="px-2 py-2">{taskOwnerNames(task, employees).join(", ") || task.owner || "Nepřiřazeno"}</td><td className="px-2 py-2">{task.deadline || "—"}</td><td className="px-2 py-2">{task.status === "completed" ? <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-800">Splněno</span> : <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">Nevyřízeno</span>}</td></tr>)}</tbody></table></div>}</section>
        <div className="flex flex-wrap justify-end gap-2">{(isAdmin || (selectedMeeting.createdBy === employee.id && selectedMeeting.status !== "archived")) && <Button variant="secondary" onClick={() => { const item = selectedMeeting; setSelectedMeeting(null); edit(item); }}><Pencil className="mr-1 inline" size={16}/>{selectedMeeting.status === "archived" ? "Opravit zápis" : "Upravit a dokončit"}</Button>}<Button onClick={() => setSelectedMeeting(null)}>Zavřít</Button></div>
      </div>
    </Modal>}
  </fieldset>;
}
