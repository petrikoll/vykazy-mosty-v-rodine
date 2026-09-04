import React, { useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  GraduationCap,
  HardDrive,
  Send,
  ShieldCheck,
} from "lucide-react";
import { api, jsonBody } from "../api.mjs";
import { greetingName } from "../czechVocative.mjs";
import { Button, Textarea } from "./Common.jsx";

const MONTHS = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];

function currentProjectPeriod(project) {
  const now = new Date();
  const start = new Date(project.startDate);
  const end = new Date(project.endDate);
  const selected = now < start ? start : now > end ? end : now;
  return { month: selected.getMonth() + 1, year: selected.getFullYear() };
}

function dateLabel(value) {
  if (!value) return "bez termínu";
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("cs-CZ").format(parsed);
}

function dateTimeLabel(value) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("cs-CZ", { dateStyle: "short", timeStyle: "short" }).format(parsed);
}

function MeetingTaskRow({ task, collaborators, onNavigate, onRefresh }) {
  const [open, setOpen] = useState(false);
  const [completionText, setCompletionText] = useState("");
  const [recipientIds, setRecipientIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggleRecipient = (id) => setRecipientIds((current) => current.includes(id)
    ? current.filter((item) => item !== id)
    : [...current, id]);

  const completeTask = async () => {
    setBusy(true);
    setError("");
    try {
      await api(`/api/meetings/${task.meetingId}/tasks/${task.id}/complete`, {
        method: "PATCH",
        body: jsonBody({ completionText, recipientIds }),
      });
      setOpen(false);
      await onRefresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return <div className="border-t border-slate-100 py-2.5 first:border-t-0">
    <div className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      <div className="min-w-0">
        <strong className="block text-sm text-slate-900">{task.text}</strong>
        <span className="mt-0.5 block text-xs text-slate-500">Porada {dateLabel(task.meetingDate)} · termín {dateLabel(task.deadline)}</span>
      </div>
      <button type="button" className="justify-self-start text-xs font-bold text-blue-700 hover:underline sm:justify-self-auto" onClick={() => onNavigate("meetings")}>Zápis</button>
      <Button variant={open ? "secondary" : "primary"} className="min-h-8 justify-self-start px-2.5 py-1 text-xs sm:justify-self-auto" onClick={() => { setOpen((value) => !value); setError(""); }}>
        <ChevronDown className={`mr-1 inline transition ${open ? "rotate-180" : ""}`} size={14}/>Vyřídit
      </Button>
    </div>
    {open && <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50/70 p-2.5">
      <label className="block text-xs font-bold text-slate-700">Jak byl úkol vyřízen?
        <Textarea compact rows={2} className="mt-1 min-h-14 bg-white" value={completionText} onChange={(event) => setCompletionText(event.target.value)} placeholder="Stručně napište výsledek nebo předané řešení…"/>
      </label>
      <div className="mt-2 text-xs font-bold text-slate-700">Komu odeslat řešení</div>
      <div className="mt-1 flex flex-wrap gap-1.5">{collaborators.map((person) => <label key={person.id} className={`cursor-pointer rounded-full border px-2 py-1 text-xs ${recipientIds.includes(person.id) ? "border-blue-600 bg-blue-100 font-bold text-blue-900" : "border-slate-300 bg-white text-slate-700"}`}>
        <input className="mr-1" type="checkbox" checked={recipientIds.includes(person.id)} onChange={() => toggleRecipient(person.id)}/>{person.name}
      </label>)}</div>
      {error && <div className="mt-2 text-xs font-semibold text-red-700" role="alert">{error}</div>}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-slate-500">Datum splnění a vaše jméno se doplní automaticky.</span>
        <Button variant="success" className="min-h-8 px-2.5 py-1 text-xs" disabled={busy || !completionText.trim() || !recipientIds.length} onClick={completeTask}><Send className="mr-1 inline" size={14}/>{busy ? "Odesílám…" : "Splnit úkol a odeslat"}</Button>
      </div>
    </div>}
  </div>;
}

function ReceivedTaskResults({ results, onNavigate }) {
  if (!results.length) return null;
  return <section className="rounded-xl border border-slate-300 bg-white p-4 shadow-md shadow-slate-200/60">
    <div className="mb-2 flex items-center justify-between gap-2"><h2 className="font-bold text-slate-950">Doručená řešení úkolů</h2><button className="text-xs font-bold text-blue-700 hover:underline" onClick={() => onNavigate("meetings")}>Otevřít porady</button></div>
    <div>{results.map((task, index) => <article key={task.id || `${task.meetingId}-${index}`} className="border-t border-slate-100 py-2.5 first:border-t-0">
      <strong className="block text-sm text-slate-900">{task.text}</strong>
      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{task.completionText}</p>
      <div className="mt-1 text-xs text-slate-500">Vyřídil/a {task.completedByName || "pracovník"} · {dateTimeLabel(task.completedAt)}</div>
    </article>)}</div>
  </section>;
}

export default function PortalDashboard({ portal, positions, project, onNavigate, onRefresh }) {
  const employee = portal.employee;
  const leader = ["manager", "director", "project_manager"].includes(employee.appRole);
  const admin = ["director", "project_manager"].includes(employee.appRole);
  const period = useMemo(() => currentProjectPeriod(project), [project]);
  const periodLabel = `${MONTHS[period.month - 1]} ${period.year}`;
  const collaborators = portal.collaborators || portal.employees;
  const assignedMeetingTasks = useMemo(() => portal.meetings
    .filter((meeting) => meeting.status !== "draft")
    .flatMap((meeting) => (meeting.tasks || []).filter((task) => ([...(task.ownerIds || []), task.ownerId].includes(employee.id)) && task.status !== "completed").map((task) => ({ ...task, meetingId: meeting.id, meetingDate: meeting.date })))
    .toSorted((a, b) => (a.deadline || "9999-12-31").localeCompare(b.deadline || "9999-12-31")), [employee.id, portal.meetings]);
  const receivedTaskResults = useMemo(() => portal.meetings
    .filter((meeting) => meeting.status !== "draft")
    .flatMap((meeting) => (meeting.tasks || []).filter((task) => task.status === "completed" && (task.completionRecipientIds || []).includes(employee.id)).map((task) => ({ ...task, meetingId: meeting.id, meetingDate: meeting.date })))
    .toSorted((a, b) => (b.completedAt || "").localeCompare(a.completedAt || "")), [employee.id, portal.meetings]);

  const reviewRows = useMemo(() => {
    if (!leader || employee.appRole === "project_manager") return [];
    const reviewedRole = employee.appRole === "director" ? "manager" : "worker";
    return portal.employees
      .filter((item) => item.active !== false && item.appRole === reviewedRole)
      .flatMap((item) => (item.assignments || []).map((assignment) => {
        const position = positions.find((candidate) => candidate.id === assignment.positionId);
        if (!position || position.active === false || !position.reportRequired) return null;
        const report = portal.workReports.find((candidate) => candidate.employeeId === item.id
          && candidate.assignmentId === assignment.id && candidate.month === period.month && candidate.year === period.year);
        return { report };
      }).filter(Boolean));
  }, [employee.appRole, leader, period.month, period.year, portal.employees, portal.workReports, positions]);

  if (!leader) {
    const workerLinks = [
      { id: "reports", label: "Výkazy práce", detail: `Otevřít výkaz za ${periodLabel}`, icon: ClipboardCheck },
      { id: "education", label: "Vzdělávací plán", detail: "Zobrazit plán a záznamy vzdělávání", icon: GraduationCap },
    ];

    return <div className="mx-auto max-w-3xl space-y-5 py-2 sm:py-5">
      <h1 className="text-2xl font-bold text-slate-950">Dobrý den, {greetingName(employee.name)}</h1>
      <div className="grid gap-3 sm:grid-cols-2">{workerLinks.map(({ id, label, detail, icon: Icon }) => <button key={id} onClick={() => onNavigate(id)} className="flex min-h-24 items-center gap-4 rounded-xl border border-slate-300 bg-white p-4 text-left shadow-md shadow-slate-200/60 transition hover:border-blue-400 hover:bg-blue-50 hover:shadow-lg">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-blue-100 text-blue-800"><Icon size={22}/></span>
        <span className="min-w-0 flex-1"><strong className="block text-base text-slate-950">{label}</strong><span className="mt-1 block text-xs text-slate-500">{detail}</span></span>
        <ArrowRight className="shrink-0 text-slate-400" size={19}/>
      </button>)}</div>
      {assignedMeetingTasks.length > 0 && <section className="rounded-xl border border-slate-300 bg-white p-4 shadow-md shadow-slate-200/60"><div className="mb-1 flex items-center justify-between gap-2"><h2 className="font-bold text-slate-950">Moje úkoly z porad</h2><span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-800">{assignedMeetingTasks.length}</span></div><div>{assignedMeetingTasks.map((task, index) => <MeetingTaskRow key={task.id || `${task.meetingId}-${index}`} task={task} collaborators={collaborators} onNavigate={onNavigate} onRefresh={onRefresh}/>)}</div></section>}
      <ReceivedTaskResults results={receivedTaskResults} onNavigate={onNavigate}/>
    </div>;
  }

  const ownAssignments = (employee.assignments || []).filter((assignment) => {
    const position = positions.find((item) => item.id === assignment.positionId);
    return position && position.active !== false && position.reportRequired;
  });
  const ownReports = ownAssignments.map((assignment) => portal.workReports.find((item) => item.employeeId === employee.id
    && item.assignmentId === assignment.id && item.month === period.month && item.year === period.year));
  const ownMissing = ownReports.filter((item) => !item).length;
  const ownReturned = ownReports.filter((item) => item?.status === "returned").length;
  const waitingReview = reviewRows.filter((item) => item.report?.status === "submitted").length;
  const missingReview = reviewRows.filter((item) => !item.report).length;

  const educationPeople = portal.employees.filter((item) => item.active !== false
    && item.appRole !== "project_manager"
    && (admin || item.appRole !== "director"));
  const missingPlans = employee.appRole === "project_manager" ? 0 : educationPeople.filter((item) => !portal.educationPlans.some((plan) => plan.employeeId === item.id && plan.year === period.year)).length;
  const tasks = [];
  if (waitingReview) tasks.push({ icon: ClipboardCheck, title: `${waitingReview} ${waitingReview === 1 ? "výkaz čeká" : "výkazy čekají"} na kontrolu`, detail: `Otevřete předané výkazy za ${periodLabel}.`, target: "reports", tone: "Ke kontrole" });
  if (ownReturned) tasks.push({ icon: ClipboardCheck, title: `${ownReturned === 1 ? "Váš výkaz byl vrácen" : `${ownReturned} vaše výkazy byly vráceny`} k opravě`, detail: "Přečtěte si poznámku a upravte vykázané činnosti.", target: "reports", tone: "Opravit" });
  if (ownMissing) tasks.push({ icon: CalendarDays, title: `${ownMissing === 1 ? "Dokončit vlastní výkaz" : `Dokončit ${ownMissing} vlastní výkazy`} za ${periodLabel}`, detail: "Rozpracovaný výkaz se průběžně ukládá v tomto prohlížeči.", target: "reports", tone: "K doplnění" });
  if (missingReview) tasks.push({ icon: ClipboardCheck, title: `${missingReview} ${missingReview === 1 ? "očekávaný výkaz nebyl předán" : "očekávaných výkazů nebylo předáno"}`, detail: "V přehledu týmu uvidíte konkrétní pracovníky a pozice.", target: "reports", tone: "Čeká se" });
  if (missingPlans) tasks.push({ icon: GraduationCap, title: `${missingPlans} ${missingPlans === 1 ? "vzdělávací plán není založen" : "vzdělávací plány nejsou založeny"}`, detail: `Doplňte plánování a cíle na rok ${period.year}.`, target: "education", tone: "K doplnění" });
  if (admin && !portal.google.driveConnected) tasks.push({ icon: HardDrive, title: "Dokončit připojení archivu Google Drive", detail: "Připojení je jednorázové; potom lze ukládat podepsané výkazy.", target: "settings", tone: "Jednorázově" });

  const quickActions = [
    { id: "reports", label: "Otevřít výkazy", icon: ClipboardCheck },
    { id: "education", label: "Vzdělávací plány", icon: GraduationCap },
    { id: "supervisions", label: "Přidat supervizi", icon: ShieldCheck },
    { id: "meetings", label: "Nový zápis z porady", icon: BookOpenCheck },
  ];

  return <div className="space-y-4">
    <div>
      <h1 className="text-2xl font-bold text-slate-950">Dobrý den, {greetingName(employee.name)}</h1>
      <p className="mt-1 text-sm text-slate-500">Přehled věcí, které nyní potřebují pozornost.</p>
    </div>

    <section className="rounded-xl border border-slate-300 bg-white p-4 shadow-md shadow-slate-200/60">
      <h2 className="mb-2 text-base font-bold text-slate-950">Co je potřeba vyřídit</h2>
      {!tasks.length && !assignedMeetingTasks.length ? <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"><CheckCircle2 size={18}/>Momentálně zde není žádný nevyřízený úkol.</div> : <>
        <div>{tasks.map(({ icon: Icon, ...task }, index) => <button key={`${task.target}-${index}`} onClick={() => onNavigate(task.target)} className="grid w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 border-t border-slate-100 py-3 text-left first:border-t-0 hover:bg-slate-50 sm:px-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-700"><Icon size={17}/></span>
          <span className="min-w-0"><strong className="block text-sm text-slate-900">{task.title}</strong><span className="mt-0.5 block text-xs text-slate-500">{task.detail}</span></span>
          <span className="hidden rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800 sm:inline">{task.tone}</span>
        </button>)}</div>
        {assignedMeetingTasks.length > 0 && <div className={tasks.length ? "mt-1 border-t border-slate-200 pt-1" : ""}>{assignedMeetingTasks.map((task, index) => <MeetingTaskRow key={task.id || `${task.meetingId}-${index}`} task={task} collaborators={collaborators} onNavigate={onNavigate} onRefresh={onRefresh}/>)}</div>}
      </>}
    </section>

    <ReceivedTaskResults results={receivedTaskResults} onNavigate={onNavigate}/>

    <section>
      <h2 className="mb-2 text-base font-bold text-slate-950">Rychlé akce</h2>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">{quickActions.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => onNavigate(id)} className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-left text-sm font-bold text-slate-800 shadow-md shadow-slate-200/60 hover:border-blue-400 hover:bg-blue-50"><span className="flex items-center gap-2"><Icon className="text-blue-700" size={17}/>{label}</span><ArrowRight className="shrink-0 text-slate-400" size={16}/></button>)}</div>
    </section>
  </div>;
}
