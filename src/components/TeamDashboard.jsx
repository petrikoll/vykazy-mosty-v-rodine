import React, { useMemo, useState } from "react";
import { ClipboardCheck, GraduationCap, ListChecks, RotateCcw, ShieldCheck, Users } from "lucide-react";
import { Button, Card, Field, Input, StatusBadge } from "./Common.jsx";
import { dateInRange, dateRangesOverlap, reportOverlapsRange, yearsCovered } from "../dashboardRange.mjs";

const YEARS = [2026, 2027, 2028];

function initialYear() {
  const current = new Date().getFullYear();
  return YEARS.includes(current) ? current : YEARS[0];
}

function initialRange() {
  const year = initialYear();
  return { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };
}

function formatHours(value) {
  return Number(value || 0).toLocaleString("cs-CZ", { maximumFractionDigits: 2 });
}

function formatDate(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("cs-CZ").format(new Date(year, month - 1, day));
}

function positionNames(employee, positions) {
  if (employee.appRole === "project_manager") return ["Projektový manažer"];
  return (employee.assignments || [])
    .map((assignment) => positions.find((position) => position.id === assignment.positionId)?.name)
    .filter(Boolean);
}

export default function TeamDashboard({ portal, positions, onNavigate }) {
  const [range, setRange] = useState(initialRange);
  const { dateFrom, dateTo } = range;
  const planYears = useMemo(() => yearsCovered(dateFrom, dateTo), [dateFrom, dateTo]);
  const isAdmin = ["director", "project_manager"].includes(portal.employee.appRole);
  const visibleEmployees = useMemo(() => portal.employees.filter((employee) => employee.active !== false
    && (isAdmin || employee.id === portal.employee.id || employee.appRole === "worker")), [portal.employee.id, portal.employees, isAdmin]);

  const rows = useMemo(() => visibleEmployees.map((employee) => {
    const educationRecords = portal.educationRecords.filter((record) => record.employeeId === employee.id
      && dateRangesOverlap(record.dateFrom || record.date, record.dateTo || record.dateFrom || record.date, dateFrom, dateTo));
    const supervisions = portal.supervisions.filter((record) => dateInRange(record.date, dateFrom, dateTo)
      && (record.participantIds || []).includes(employee.id));
    const reports = portal.workReports.filter((report) => report.employeeId === employee.id && reportOverlapsRange(report, dateFrom, dateTo));
    const plans = planYears.map((year) => ({
      year,
      status: portal.educationPlans.find((item) => item.employeeId === employee.id && Number(item.year) === year)?.status || "missing_plan",
    }));
    const meetingTasks = portal.meetings.filter((meeting) => meeting.status !== "draft")
      .flatMap((meeting) => (meeting.tasks || []).filter((task) => ([...(task.ownerIds || []), task.ownerId].includes(employee.id))
        && task.status !== "completed" && dateInRange(task.deadline || meeting.date, dateFrom, dateTo)));
    return {
      employee,
      positions: positionNames(employee, positions),
      educationHours: educationRecords.reduce((sum, record) => sum + Number(record.hours || 0), 0),
      supervisionHours: supervisions.reduce((sum, record) => sum + Number(record.hours || 0), 0),
      supervisionCount: supervisions.length,
      reportCount: reports.length,
      approvedReportCount: reports.filter((report) => ["approved", "ready_for_signature", "signed_archived"].includes(report.status)).length,
      returnedReportCount: reports.filter((report) => report.status === "returned").length,
      plans,
      taskCount: meetingTasks.length,
      projectManager: employee.appRole === "project_manager",
    };
  }), [dateFrom, dateTo, planYears, portal.educationPlans, portal.educationRecords, portal.meetings, portal.supervisions, portal.workReports, positions, visibleEmployees]);

  const totals = rows.reduce((result, row) => ({
    educationHours: result.educationHours + row.educationHours,
    supervisionHours: result.supervisionHours + row.supervisionHours,
    approvedReports: result.approvedReports + row.approvedReportCount,
    tasks: result.tasks + row.taskCount,
  }), { educationHours: 0, supervisionHours: 0, approvedReports: 0, tasks: 0 });

  const summary = [
    { label: "Pracovníci", value: rows.length, icon: Users, tone: "bg-blue-50 text-blue-900" },
    { label: "Vzdělávání", value: `${formatHours(totals.educationHours)} h`, icon: GraduationCap, tone: "bg-violet-50 text-violet-900" },
    { label: "Účast na supervizích", value: `${formatHours(totals.supervisionHours)} h`, icon: ShieldCheck, tone: "bg-emerald-50 text-emerald-900" },
    { label: "Schválené výkazy", value: totals.approvedReports, icon: ClipboardCheck, tone: "bg-amber-50 text-amber-900" },
    { label: "Úkoly z porad", value: totals.tasks, icon: ListChecks, tone: "bg-slate-100 text-slate-900" },
  ];

  const updateDateFrom = (value) => {
    if (!value) return;
    setRange((current) => ({ dateFrom: value, dateTo: current.dateTo < value ? value : current.dateTo }));
  };
  const updateDateTo = (value) => {
    if (!value) return;
    setRange((current) => ({ dateFrom: current.dateFrom > value ? value : current.dateFrom, dateTo: value }));
  };
  const rangeLabel = `${formatDate(dateFrom)} – ${formatDate(dateTo)}`;

  return <div className="space-y-3">
    <Card title="Dashboard týmu" subtitle="Souhrn se přepočítává podle zvoleného období; úkoly se řídí termínem splnění." actions={<div className="flex flex-wrap items-end justify-end gap-2">
      <div className="w-36"><Field label="Od"><Input type="date" min={`${YEARS[0]}-01-01`} max={`${YEARS.at(-1)}-12-31`} value={dateFrom} onChange={(event) => updateDateFrom(event.target.value)}/></Field></div>
      <div className="w-36"><Field label="Do"><Input type="date" min={`${YEARS[0]}-01-01`} max={`${YEARS.at(-1)}-12-31`} value={dateTo} onChange={(event) => updateDateTo(event.target.value)}/></Field></div>
      <Button variant="secondary" compact onClick={() => setRange(initialRange())} title="Nastavit celý aktuální rok"><RotateCcw className="mr-1 inline" size={14}/>Celý rok</Button>
    </div>}>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{summary.map(({ label, value, icon: Icon, tone }) => <div key={label} className={`flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2 ${tone}`}><Icon className="shrink-0" size={18}/><div><div className="text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</div><div className="text-lg font-extrabold">{value}</div></div></div>)}</div>
    </Card>

    <Card title={`Přehled pracovníků · ${rangeLabel}`} subtitle="Vzdělávání se započítá, pokud alespoň jeho část zasahuje do období; týmová supervize se započítá každému účastníkovi.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[840px] text-left text-sm">
          <thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500"><th className="px-2 py-2">Pracovník a pozice</th><th className="px-2 py-2 text-right">Vzdělávání</th><th className="px-2 py-2 text-right">Supervize</th><th className="px-2 py-2">Vzdělávací plán</th><th className="px-2 py-2">Výkazy práce</th><th className="px-2 py-2 text-right">Úkoly</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.employee.id} className="border-b border-slate-100 last:border-0">
            <td className="px-2 py-2.5"><strong className="text-slate-950">{row.employee.name}</strong><div className="mt-0.5 text-xs text-slate-500">{row.positions.join(" · ") || "Bez přiřazené pozice"}</div></td>
            <td className="px-2 py-2.5 text-right">{row.projectManager ? <span className="text-slate-400">—</span> : <button className="font-extrabold text-blue-800 hover:underline" onClick={() => onNavigate("education")}>{formatHours(row.educationHours)} h</button>}</td>
            <td className="px-2 py-2.5 text-right"><button className="font-extrabold text-blue-800 hover:underline" onClick={() => onNavigate("supervisions")}>{formatHours(row.supervisionHours)} h</button><div className="text-[11px] text-slate-500">{row.supervisionCount} záznamů</div></td>
            <td className="px-2 py-2.5">{row.projectManager ? <span className="text-xs font-semibold text-slate-500">Nevyžaduje se</span> : <button className="space-y-1 text-left" onClick={() => onNavigate("education")}>{row.plans.map((plan) => <span key={plan.year} className="flex items-center gap-1.5"><span className="text-[11px] font-semibold text-slate-500">{plan.year}</span><StatusBadge status={plan.status}/></span>)}</button>}</td>
            <td className="px-2 py-2.5">{row.projectManager ? <span className="text-xs font-semibold text-slate-500">Nevyžaduje se</span> : <button className="text-left hover:underline" onClick={() => onNavigate("reports")}><strong>{row.approvedReportCount} schváleno</strong><span className="text-slate-500"> / {row.reportCount} celkem</span>{row.returnedReportCount > 0 && <span className="block text-xs font-bold text-red-700">{row.returnedReportCount} vráceno</span>}</button>}</td>
            <td className="px-2 py-2.5 text-right"><button className="font-extrabold text-blue-800 hover:underline" onClick={() => onNavigate("meetings")}>{row.taskCount}</button></td>
          </tr>)}</tbody>
        </table>
      </div>
    </Card>
  </div>;
}
