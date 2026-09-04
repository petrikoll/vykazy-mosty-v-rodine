import React, { useRef, useState } from "react";
import { Archive, Eye, Pencil, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { api, jsonBody } from "../api.mjs";
import { createMeetingPdf, downloadBlob } from "../meetingPdf.mjs";
import { contentFromLegacyMeeting, formatMeetingContent, parseMeetingTasks } from "../meetingUtils.mjs";
import { Button, Card, Empty, Field, Input, Modal, Notice, StatusBadge, Textarea, useTimedNotice } from "./Common.jsx";

const blank = { id: "", originalStatus: "", date: "", participantIds: [], content: "" };

export default function Meetings({ employee, employees, meetings, project, onRefresh }) {
  const isLeader = ["manager", "director"].includes(employee.appRole);
  const isDirector = employee.appRole === "director";
  const [form, setForm] = useState(blank);
  const [view, setView] = useState("archive");
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useTimedNotice();
  const importInput = useRef(null);
  const hasContent = Boolean(String(form.content || "").trim());
  const toggle = (id) => setForm((current) => ({ ...current, participantIds: current.participantIds.includes(id) ? current.participantIds.filter((item) => item !== id) : [...current.participantIds, id] }));

  const useAi = async () => {
    setBusy(true); setNotice(null);
    try {
      const result = await api("/api/ai/meeting-minutes", { method: "POST", body: jsonBody(form) });
      setForm((current) => ({
        ...current,
        content: formatMeetingContent(result.minutes || current.content, result.tasks || []),
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
      setForm({
        id: "", originalStatus: "", date: result.date || "", participantIds: result.participantIds || [],
        content: formatMeetingContent(result.minutes || "", result.tasks || []),
      });
      setView("form");
      const unmatched = (result.participantNames || []).filter((name) => !(result.matchedParticipantNames || []).some((matched) => matched.includes(name) || name.includes(matched)));
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
      const saved = await api(endpoint, { method: form.id ? "PATCH" : "POST", body: jsonBody({ ...form, tasks: parseMeetingTasks(form.content), status: withPdf ? "submitted" : "draft" }) });
      if (withPdf) {
        const blob = await createMeetingPdf(saved.meeting, project);
        const body = new FormData(); body.append("file", blob, `${saved.meeting.date}__zapis.pdf`);
        await api(`/api/meetings/${saved.meeting.id}/pdf`, { method: "POST", body });
        downloadBlob(blob, `${saved.meeting.date}__zapis_z_porady.pdf`);
      }
      setForm(blank); setView("archive"); setNotice({ type: "success", text: withPdf ? "Zápis byl dokončen, archivován a PDF staženo pro tisk." : "Koncept byl uložen. Kdykoli jej můžete znovu otevřít a dokončit." });
      await onRefresh();
    } catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); }
  };

  const edit = (meeting) => {
    setForm({
      id: meeting.id,
      originalStatus: meeting.status || "draft",
      date: meeting.date || "",
      participantIds: meeting.participantIds || [],
      content: contentFromLegacyMeeting(meeting),
    });
    setNotice(null);
    setView("form");
  };

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
    {view === "archive" || !isLeader ? <Card title="Porady a zápisy" subtitle={isLeader ? "Vytvořte nový zápis, nebo převeďte existující PDF, Word či fotografii do formuláře a následně do Sheetu." : "Zobrazeny jsou uložené zápisy z porad, kterých jste se účastnili."} actions={isLeader ? <div className="flex flex-wrap gap-2"><input ref={importInput} className="hidden" type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp" onChange={(event) => importMeeting(event.target.files?.[0])}/><Button variant="secondary" disabled={busy} onClick={() => importInput.current?.click()}><Upload className="mr-1 inline" size={16}/>{busy ? "Rozpoznávám…" : "Nahrát zápis"}</Button><Button disabled={busy} onClick={() => { setForm(blank); setView("form"); }}><Plus className="mr-1 inline" size={16}/>Vytvořit zápis</Button></div> : undefined}>
      {!meetings.length ? <Empty>Zatím nebyl vytvořen žádný zápis.</Empty> : <div className="space-y-2">{meetings.toSorted((a,b) => b.date.localeCompare(a.date)).map((item) => <article key={item.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"><div><strong>{item.date} · Porada</strong><div className="text-sm text-slate-500">{(item.participantNames || []).join(", ")}</div></div><div className="flex flex-wrap items-center gap-2"><StatusBadge status={item.status}/><Button variant="secondary" className="min-h-8 px-2 py-1 text-xs" disabled={busy} onClick={() => setSelectedMeeting(item)}><Eye className="mr-1 inline" size={14}/>Zobrazit zápis</Button>{(isDirector || (item.createdBy === employee.id && item.status !== "archived")) && <Button variant="secondary" className="min-h-8 px-2 py-1 text-xs" disabled={busy} onClick={() => edit(item)}><Pencil className="mr-1 inline" size={14}/>{item.status === "archived" ? "Opravit zápis" : "Upravit a dokončit"}</Button>}{item.driveFileUrl && <a className="text-sm font-bold text-blue-700 underline" href={item.driveFileUrl} target="_blank" rel="noreferrer">Otevřít PDF</a>}{isDirector && <Button variant="danger" className="min-h-8 px-2 py-1 text-xs" disabled={busy} onClick={() => remove(item)}><Trash2 className="mr-1 inline" size={14}/>Smazat</Button>}</div></article>)}</div>}
    </Card> : <Card title={form.id ? "Upravit zápis z porady" : "Nový zápis z porady"} subtitle="Vložte vše do jednoho pole. Gemini text uspořádá do zápisu a seznamu úkolů; výsledek před uložením zkontrolujte." actions={<Button variant="secondary" onClick={() => { setForm(blank); setView("archive"); }}><Archive className="mr-1 inline" size={16}/>Zpět do archivu</Button>}>
      <div className="max-w-xs"><Field label="Datum"><Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}/></Field></div>
      <div className="mt-3"><div className="mb-1 text-xs font-bold text-slate-700">Účastníci</div><div className="flex flex-wrap gap-1.5">{employees.filter((item) => item.active !== false).map((item) => <label key={item.id} className={`cursor-pointer rounded-full border px-2.5 py-1.5 text-xs ${form.participantIds.includes(item.id) ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-300"}`}><input className="mr-1.5" type="checkbox" checked={form.participantIds.includes(item.id)} onChange={() => toggle(item.id)}/>{item.name}</label>)}</div></div>
      <div className="mt-3"><Field label="Zápis a úkoly" hint="Můžete vložit neuspořádané poznámky. Po použití Gemini zůstanou v tomto jediném poli oddíly ZÁPIS a ÚKOLY."><Textarea className="min-h-64" value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} placeholder="Sem vložte průběh porady, rozhodnutí a úkoly…"/></Field></div>
      <div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" disabled={busy || !hasContent} onClick={useAi}><Sparkles className="mr-1 inline" size={16}/>Uspořádat zápis pomocí Gemini</Button>{form.originalStatus !== "archived" && <Button variant="secondary" disabled={busy || !form.date || !hasContent} onClick={() => save(false)}>{form.id ? "Uložit změny konceptu" : "Uložit koncept"}</Button>}<Button disabled={busy || !form.date || !hasContent} onClick={() => save(true)}>{form.originalStatus === "archived" ? "Uložit opravu a aktualizovat PDF" : "Dokončit, vytvořit PDF a vytisknout"}</Button></div>
    </Card>}
    {selectedMeeting && <Modal title={`Zápis z porady · ${selectedMeeting.date}`} subtitle={`Zapsal/a: ${selectedMeeting.createdByName || "—"}`} className="max-w-4xl" onClose={() => setSelectedMeeting(null)}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3"><div><div className="text-xs font-bold uppercase text-slate-500">Účastníci</div><div className="mt-1 text-sm text-slate-800">{(selectedMeeting.participantNames || []).join(", ") || "Neuvedeni"}</div></div><StatusBadge status={selectedMeeting.status}/></div>
        <section className="rounded-lg border border-slate-200 bg-white p-4"><h3 className="mb-3 font-bold text-slate-900">Zápis a úkoly</h3><div className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{contentFromLegacyMeeting(selectedMeeting)}</div></section>
        <div className="flex flex-wrap justify-end gap-2">{(isDirector || (selectedMeeting.createdBy === employee.id && selectedMeeting.status !== "archived")) && <Button variant="secondary" onClick={() => { const item = selectedMeeting; setSelectedMeeting(null); edit(item); }}><Pencil className="mr-1 inline" size={16}/>{selectedMeeting.status === "archived" ? "Opravit zápis" : "Upravit a dokončit"}</Button>}<Button onClick={() => setSelectedMeeting(null)}>Zavřít</Button></div>
      </div>
    </Modal>}
  </div>;
}
