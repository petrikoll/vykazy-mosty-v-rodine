import React, { useId, useMemo, useState } from "react";
import { useGuardedState } from "../unsavedChanges.jsx";
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
  Bell,
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

function DashboardSection({ title, count, icon: Icon, tone = "slate", actions, children }) {
  const titleId = useId();
  const tones = {
    blue: { border: "border-blue-300", header: "border-blue-200 bg-blue-50 text-blue-950", badge: "bg-blue-100 text-blue-800" },
    green: { border: "border-emerald-300", header: "border-emerald-200 bg-emerald-50 text-emerald-950", badge: "bg-emerald-100 text-emerald-800" },
    slate: { border: "border-slate-300", header: "border-slate-200 bg-slate-100 text-slate-900", badge: "bg-slate-200 text-slate-700" },
  };
  const colors = tones[tone];
  return <section aria-labelledby={titleId} className={`overflow-hidden rounded-xl border bg-white shadow-sm ${colors.border}`}>
    <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 ${colors.header}`}>
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="shrink-0" size={17} aria-hidden="true"/>
        <h2 id={titleId} className="text-base font-bold">{title}</h2>
        {count !== undefined && <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${colors.badge}`}>{count}</span>}
      </div>
      {actions}
    </div>
    <div className="space-y-1.5 p-2">{children}</div>
  </section>;
}

function MeetingTaskRow({ task, collaborators, onNavigate, onRefresh }) {
  const completionId = useId();
  const [open, setOpen] = useState(false);
  const [completionText, setCompletionText, resetCompletionText] = useGuardedState("");
  const [recipientIds, setRecipientIds, resetRecipientIds] = useGuardedState([]);
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
      resetCompletionText("");
      resetRecipientIds([]);
      setOpen(false);
      await onRefresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return <article className={`rounded-lg border px-2.5 py-2 ${open ? "border-blue-300 bg-blue-50/40" : "border-slate-200 bg-white"}`}>
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 sm:flex-nowrap">
      <div className="min-w-0">
        <strong className="block break-words text-sm leading-5 text-slate-900">{task.text}</strong>
        <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">Porada {dateLabel(task.meetingDate)} · termín {dateLabel(task.deadline)}</span>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <button type="button" className="min-h-8 rounded-md px-2 text-xs font-bold text-blue-700 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" onClick={() => onNavigate("meetings")}>Zápis</button>
        <Button compact variant={open ? "secondary" : "primary"} className="inline-flex items-center gap-1" aria-expanded={open} aria-controls={completionId} onClick={() => { setOpen((value) => !value); setError(""); }}>
          <ChevronDown className={`transition ${open ? "rotate-180" : ""}`} size={14} aria-hidden="true"/>Vyřídit
        </Button>
      </div>
    </div>
    {open && <div id={completionId} className="mt-2 border-t border-blue-200 pt-2">
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
        <Button variant="success" compact disabled={busy || !completionText.trim() || !recipientIds.length} onClick={completeTask}><Send className="mr-1 inline" size={14}/>{busy ? "Odesílám…" : "Splnit úkol a odeslat"}</Button>
      </div>
    </div>}
  </article>;
}

function PendingTasks({ tasks, collaborators, onNavigate, onRefresh }) {
  return <DashboardSection title="Úkoly k vyřízení" count={tasks.length} icon={ClipboardCheck} tone="blue">
    {tasks.length ? tasks.map((task, index) => <MeetingTaskRow key={`${task.meetingId}-${task.id || index}`} task={task} collaborators={collaborators} onNavigate={onNavigate} onRefresh={onRefresh}/>) : <p className="px-1 py-1 text-sm text-slate-500">Nemáte žádné nevyřízené úkoly z porad.</p>}
  </DashboardSection>;
}

function ReceivedTaskResults({ results, onNavigate }) {
  if (!results.length) return null;
  return <DashboardSection title="Doručená řešení úkolů" count={results.length} icon={CheckCircle2} tone="green" actions={<button type="button" className="rounded px-1 py-0.5 text-xs font-bold text-emerald-800 hover:underline" onClick={() => onNavigate("meetings")}>Otevřít porady</button>}>
    {results.map((task, index) => <details key={`${task.meetingId}-${task.id || index}`} className="group rounded-lg border border-emerald-200 bg-white">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-lg px-2.5 py-2 hover:bg-emerald-50/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <strong className="line-clamp-2 break-words text-sm leading-5 text-slate-900 group-open:line-clamp-none">{task.text}</strong>
          <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">Vyřídil/a {task.completedByName || "pracovník"} · {dateTimeLabel(task.completedAt)}</span>
          <span className="mt-0.5 block truncate text-xs text-slate-600 group-open:hidden">{task.completionText || "Bez doplňující zprávy."}</span>
        </div>
        <span className="flex min-h-8 shrink-0 items-center gap-1 text-xs font-bold text-emerald-800">Řešení<ChevronDown className="transition group-open:rotate-180" size={14} aria-hidden="true"/></span>
      </summary>
      <div className="mx-2.5 border-t border-emerald-100 py-2">
        <p className="whitespace-pre-wrap break-words text-sm leading-5 text-slate-700">{task.completionText || "Bez doplňující zprávy."}</p>
      </div>
    </details>)}
  </DashboardSection>;
}

function OtherReminders({ reminders = [], links, onNavigate }) {
  return <DashboardSection title="Ostatní připomenutí" icon={Bell}>
    {reminders.length > 0 && <div className="grid gap-1.5 md:grid-cols-2">{reminders.map(({ icon: Icon, ...reminder }, index) => <button type="button" key={`${reminder.target}-${index}`} onClick={() => onNavigate(reminder.target)} className="flex min-w-0 items-start gap-2 rounded-lg border border-slate-200 px-2.5 py-2 text-left hover:border-blue-300 hover:bg-blue-50/50">
      <Icon className="mt-0.5 shrink-0 text-slate-500" size={16} aria-hidden="true"/>
      <span className="min-w-0 flex-1"><strong className="block break-words text-sm leading-5 text-slate-900">{reminder.title}</strong><span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{reminder.detail}</span></span>
      <span className="mt-0.5 hidden shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 sm:inline">{reminder.tone}</span>
    </button>)}</div>}
    <div className={`grid grid-cols-2 gap-1.5 ${links.length > 2 ? "xl:grid-cols-4" : ""} ${reminders.length ? "border-t border-slate-200 pt-2" : ""}`}>{links.map(({ id, label, icon: Icon }) => <button type="button" key={id} onClick={() => onNavigate(id)} className="flex min-h-9 min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-left text-xs font-bold text-slate-700 hover:border-blue-300 hover:bg-blue-50">
      <span className="flex items-center gap-2"><Icon className="shrink-0 text-blue-700" size={15} aria-hidden="true"/>{label}</span><ArrowRight className="shrink-0 text-slate-400" size={14} aria-hidden="true"/>
    </button>)}</div>
  </DashboardSection>;
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
      { id: "reports", label: "Výkazy práce", icon: ClipboardCheck },
      { id: "education", label: "Vzdělávací plán", icon: GraduationCap },
    ];

    return <div className="mx-auto max-w-5xl space-y-3">
      <h1 className="text-2xl font-bold text-slate-950">Dobrý den, {greetingName(employee.name)}</h1>
      <PendingTasks tasks={assignedMeetingTasks} collaborators={collaborators} onNavigate={onNavigate} onRefresh={onRefresh}/>
      <ReceivedTaskResults results={receivedTaskResults} onNavigate={onNavigate}/>
      <OtherReminders links={workerLinks} onNavigate={onNavigate}/>
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
  const reminders = [];
  if (waitingReview) reminders.push({ icon: ClipboardCheck, title: `${waitingReview} ${waitingReview === 1 ? "výkaz čeká" : "výkazy čekají"} na kontrolu`, detail: `Otevřete předané výkazy za ${periodLabel}.`, target: "reports", tone: "Ke kontrole" });
  if (ownReturned) reminders.push({ icon: ClipboardCheck, title: `${ownReturned === 1 ? "Váš výkaz byl vrácen" : `${ownReturned} vaše výkazy byly vráceny`} k opravě`, detail: "Přečtěte si poznámku a upravte vykázané činnosti.", target: "reports", tone: "Opravit" });
  if (ownMissing) reminders.push({ icon: CalendarDays, title: `${ownMissing === 1 ? "Dokončit vlastní výkaz" : `Dokončit ${ownMissing} vlastní výkazy`} za ${periodLabel}`, detail: "Rozpracovaný výkaz se průběžně ukládá v tomto prohlížeči.", target: "reports", tone: "K doplnění" });
  if (missingReview) reminders.push({ icon: ClipboardCheck, title: `${missingReview} ${missingReview === 1 ? "očekávaný výkaz nebyl předán" : "očekávaných výkazů nebylo předáno"}`, detail: "V přehledu týmu uvidíte konkrétní pracovníky a pozice.", target: "reports", tone: "Čeká se" });
  if (missingPlans) reminders.push({ icon: GraduationCap, title: `${missingPlans} ${missingPlans === 1 ? "vzdělávací plán není založen" : "vzdělávací plány nejsou založeny"}`, detail: `Doplňte plánování a cíle na rok ${period.year}.`, target: "education", tone: "K doplnění" });
  if (admin && !portal.google.driveConnected) reminders.push({ icon: HardDrive, title: "Dokončit připojení archivu Google Drive", detail: "Připojení je jednorázové; potom lze ukládat podepsané výkazy.", target: "settings", tone: "Jednorázově" });

  const quickActions = [
    { id: "reports", label: "Otevřít výkazy", icon: ClipboardCheck },
    { id: "education", label: "Vzdělávací plány", icon: GraduationCap },
    { id: "supervisions", label: "Přidat supervizi", icon: ShieldCheck },
    { id: "meetings", label: "Nový zápis z porady", icon: BookOpenCheck },
  ];

  return <div className="mx-auto max-w-6xl space-y-3">
    <div>
      <h1 className="text-2xl font-bold text-slate-950">Dobrý den, {greetingName(employee.name)}</h1>
      <p className="mt-1 text-sm text-slate-500">Přehled věcí, které nyní potřebují pozornost.</p>
    </div>

    <PendingTasks tasks={assignedMeetingTasks} collaborators={collaborators} onNavigate={onNavigate} onRefresh={onRefresh}/>
    <ReceivedTaskResults results={receivedTaskResults} onNavigate={onNavigate}/>
    <OtherReminders reminders={reminders} links={quickActions} onNavigate={onNavigate}/>
  </div>;
}
