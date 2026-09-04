import React, { useMemo } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  HardDrive,
  ShieldCheck,
} from "lucide-react";

const MONTHS = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];
const NAME_PREFIXES = new Set(["mgr.", "bc.", "ing.", "arch.", "phdr.", "mudr.", "judr.", "rndr.", "doc.", "prof.", "et"]);

function getFirstName(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.find((part) => !NAME_PREFIXES.has(part.toLocaleLowerCase("cs-CZ"))) || name;
}

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

export default function PortalDashboard({ portal, positions, project, onNavigate }) {
  const employee = portal.employee;
  const leader = ["manager", "director"].includes(employee.appRole);
  const period = useMemo(() => currentProjectPeriod(project), [project]);
  const periodLabel = `${MONTHS[period.month - 1]} ${period.year}`;
  const assignedMeetingTasks = useMemo(() => portal.meetings
    .filter((meeting) => meeting.status !== "draft")
    .flatMap((meeting) => (meeting.tasks || []).filter((task) => task.ownerId === employee.id).map((task) => ({ ...task, meetingId: meeting.id, meetingDate: meeting.date })))
    .toSorted((a, b) => (a.deadline || "9999-12-31").localeCompare(b.deadline || "9999-12-31")), [employee.id, portal.meetings]);

  const reviewRows = useMemo(() => {
    if (!leader) return [];
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
      <h1 className="text-2xl font-bold text-slate-950">Dobrý den</h1>
      <div className="grid gap-3 sm:grid-cols-2">{workerLinks.map(({ id, label, detail, icon: Icon }) => <button key={id} onClick={() => onNavigate(id)} className="flex min-h-24 items-center gap-4 rounded-xl border border-slate-300 bg-white p-4 text-left shadow-md shadow-slate-200/60 transition hover:border-blue-400 hover:bg-blue-50 hover:shadow-lg">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-blue-100 text-blue-800"><Icon size={22}/></span>
        <span className="min-w-0 flex-1"><strong className="block text-base text-slate-950">{label}</strong><span className="mt-1 block text-xs text-slate-500">{detail}</span></span>
        <ArrowRight className="shrink-0 text-slate-400" size={19}/>
      </button>)}</div>
      {assignedMeetingTasks.length > 0 && <section className="rounded-xl border border-slate-300 bg-white p-4 shadow-md shadow-slate-200/60"><div className="mb-2 flex items-center justify-between gap-2"><h2 className="font-bold text-slate-950">Moje úkoly z porad</h2><button className="text-xs font-bold text-blue-700 hover:underline" onClick={() => onNavigate("meetings")}>Otevřít porady</button></div><div>{assignedMeetingTasks.map((task, index) => <button key={task.id || `${task.meetingId}-${index}`} onClick={() => onNavigate("meetings")} className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-slate-100 py-2.5 text-left first:border-t-0 hover:bg-slate-50"><span className="text-sm font-semibold text-slate-900">{task.text}</span><span className="whitespace-nowrap text-xs font-bold text-slate-500">do {dateLabel(task.deadline)}</span></button>)}</div></section>}
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

  const educationPeople = leader
    ? portal.employees.filter((item) => item.active !== false && (employee.appRole === "director" || item.appRole !== "director"))
    : [employee];
  const missingPlans = educationPeople.filter((item) => !portal.educationPlans.some((plan) => plan.employeeId === item.id && plan.year === period.year)).length;
  const tasks = [];
  if (waitingReview) tasks.push({ icon: ClipboardCheck, title: `${waitingReview} ${waitingReview === 1 ? "výkaz čeká" : "výkazy čekají"} na kontrolu`, detail: `Otevřete předané výkazy za ${periodLabel}.`, target: "reports", tone: "Ke kontrole" });
  if (ownReturned) tasks.push({ icon: ClipboardCheck, title: `${ownReturned === 1 ? "Váš výkaz byl vrácen" : `${ownReturned} vaše výkazy byly vráceny`} k opravě`, detail: "Přečtěte si poznámku a upravte vykázané činnosti.", target: "reports", tone: "Opravit" });
  if (ownMissing) tasks.push({ icon: CalendarDays, title: `${ownMissing === 1 ? "Dokončit vlastní výkaz" : `Dokončit ${ownMissing} vlastní výkazy`} za ${periodLabel}`, detail: "Rozpracovaný výkaz se průběžně ukládá v tomto prohlížeči.", target: "reports", tone: "K doplnění" });
  if (missingReview) tasks.push({ icon: ClipboardCheck, title: `${missingReview} ${missingReview === 1 ? "očekávaný výkaz nebyl předán" : "očekávaných výkazů nebylo předáno"}`, detail: "V přehledu týmu uvidíte konkrétní pracovníky a pozice.", target: "reports", tone: "Čeká se" });
  if (missingPlans) tasks.push({ icon: GraduationCap, title: `${missingPlans} ${missingPlans === 1 ? "vzdělávací plán není založen" : "vzdělávací plány nejsou založeny"}`, detail: `Doplňte plánování a cíle na rok ${period.year}.`, target: "education", tone: "K doplnění" });
  assignedMeetingTasks.forEach((task) => tasks.push({ icon: BookOpenCheck, title: task.text, detail: `Úkol z porady ${dateLabel(task.meetingDate)} · termín ${dateLabel(task.deadline)}`, target: "meetings", tone: task.deadline ? `Do ${dateLabel(task.deadline)}` : "Bez termínu" }));
  if (employee.appRole === "director" && !portal.google.driveConnected) tasks.push({ icon: HardDrive, title: "Dokončit připojení archivu Google Drive", detail: "Připojení je jednorázové; potom lze ukládat podepsané výkazy.", target: "settings", tone: "Jednorázově" });

  const quickActions = [
    { id: "reports", label: "Otevřít výkazy", icon: ClipboardCheck },
    { id: "education", label: "Vzdělávací plány", icon: GraduationCap },
    { id: "supervisions", label: "Přidat supervizi", icon: ShieldCheck },
    { id: "meetings", label: "Nový zápis z porady", icon: BookOpenCheck },
  ];

  return <div className="space-y-4">
    <div>
      <h1 className="text-2xl font-bold text-slate-950">Dobrý den, {getFirstName(employee.name)}</h1>
      <p className="mt-1 text-sm text-slate-500">Přehled věcí, které nyní potřebují pozornost.</p>
    </div>

    <section className="rounded-xl border border-slate-300 bg-white p-4 shadow-md shadow-slate-200/60">
      <h2 className="mb-2 text-base font-bold text-slate-950">Co je potřeba vyřídit</h2>
      {!tasks.length ? <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"><CheckCircle2 size={18}/>Momentálně zde není žádný nevyřízený úkol.</div> : <div>{tasks.map(({ icon: Icon, ...task }, index) => <button key={`${task.target}-${index}`} onClick={() => onNavigate(task.target)} className="grid w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 border-t border-slate-100 py-3 text-left first:border-t-0 hover:bg-slate-50 sm:px-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-700"><Icon size={17}/></span>
        <span className="min-w-0"><strong className="block text-sm text-slate-900">{task.title}</strong><span className="mt-0.5 block text-xs text-slate-500">{task.detail}</span></span>
        <span className="hidden rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800 sm:inline">{task.tone}</span>
      </button>)}</div>}
    </section>

    <section>
      <h2 className="mb-2 text-base font-bold text-slate-950">Rychlé akce</h2>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">{quickActions.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => onNavigate(id)} className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-left text-sm font-bold text-slate-800 shadow-md shadow-slate-200/60 hover:border-blue-400 hover:bg-blue-50"><span className="flex items-center gap-2"><Icon className="text-blue-700" size={17}/>{label}</span><ArrowRight className="shrink-0 text-slate-400" size={16}/></button>)}</div>
    </section>
  </div>;
}
