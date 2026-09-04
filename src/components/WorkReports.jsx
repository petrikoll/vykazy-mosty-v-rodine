import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Eye, Plus, Trash2 } from "lucide-react";
import { api, jsonBody, openApiFilePreview } from "../api.mjs";
import {
  HOURS_TOLERANCE,
  clampActivityRows,
  createDefaultActivities,
  distributeActivitiesByWeights,
  getActivityHoursStatus,
  sumActivityHours,
} from "../activityUtils.mjs";
import { recalculateAllReportActivities } from "../reportRecalc.mjs";
import { calculateRoleMetrics, getHolidaysCountForMonth } from "../workReportRules.mjs";
import { downloadWorkReports } from "../workReportDownload.mjs";
import { printWorkReports } from "../workReportPrint.mjs";
import { Button, Card, Field, Input, Select, StatusBadge, Textarea, useTimedNotice } from "./Common.jsx";

const formatHours = (value) => `${Number(value || 0).toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} h`;
const monthKey = (year, month) => `${year}-${String(month).padStart(2, "0")}`;
const MONTHS = ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen", "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"];

function expandAssignments(employee, positions) {
  return (employee.assignments || []).map((assignment) => {
    const position = positions.find((item) => item.id === assignment.positionId);
    return position ? {
      ...position, ...assignment, id: assignment.id, positionId: position.id, positionName: position.name,
      fte: assignment.fte ?? position.fte ?? 0,
      monthlyHours: assignment.monthlyHours ?? position.monthlyHours ?? 0,
      activities: assignment.activities || position.activities || [],
    } : null;
  }).filter((item) => item?.active !== false && item?.reportRequired);
}

export default function WorkReports({ employee, positions, project, reports, onRefresh, selfManaged = false, topLevel = false, canDelete = false }) {
  const today = new Date();
  const start = new Date(project.startDate);
  const end = new Date(project.endDate);
  const defaultDate = today < start ? start : today > end ? end : today;
  const [period, setPeriod] = useState({ month: defaultDate.getMonth() + 1, year: defaultDate.getFullYear() });
  const draftKey = `mosty-work-report-${employee.id}-${monthKey(period.year, period.month)}`;
  const [absences, setAbsences] = useState({ vacation: 0, sickLeave: 0, otherObstacles: 0, otherObstaclesUnit: "days", doctorVisitHours: 0, holiday: 0 });
  const [activitiesByRole, setActivitiesByRole] = useState({});
  const [hydratedKey, setHydratedKey] = useState("");
  const [expanded, setExpanded] = useState([]);
  const [expandedKey, setExpandedKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useTimedNotice();
  const roles = useMemo(() => expandAssignments(employee, positions), [employee, positions]);
  const totalFte = useMemo(() => Number(employee.globalFte || 0) || roles.filter((role) => role.allocationType === "fte").reduce((sum, role) => sum + Number(role.fte || 0), 0), [employee.globalFte, roles]);
  const reportViewKey = `${draftKey}:${roles.map((role) => role.id).join(",")}`;

  useEffect(() => {
    if (expandedKey === reportViewKey) return;
    setExpanded(roles.map((role) => role.id));
    setExpandedKey(reportViewKey);
  }, [expandedKey, reportViewKey, roles]);

  useEffect(() => {
    const saved = JSON.parse(window.localStorage.getItem(draftKey) || "null");
    const reportsForPeriod = reports.filter((item) => item.month === period.month && item.year === period.year);
    const editableStatuses = topLevel ? ["returned", "draft", "ready_for_signature"] : ["returned", "draft"];
    const editableExisting = reportsForPeriod.find((item) => editableStatuses.includes(item.status));
    const loadedAbsences = editableExisting?.absences || saved?.absences || reportsForPeriod[0]?.absences || { vacation: 0, sickLeave: 0, otherObstacles: 0, otherObstaclesUnit: "days", doctorVisitHours: 0, holiday: getHolidaysCountForMonth(period.month, period.year) };
    const loadedActivities = { ...(saved?.activitiesByRole || {}) };
    for (const role of roles) {
      const existingReport = reportsForPeriod.find((item) => item.assignmentId === role.id);
      if (existingReport && editableStatuses.includes(existingReport.status)) {
        loadedActivities[role.id] = existingReport.activities || [];
      } else if (!loadedActivities[role.id]) {
          const metrics = calculateRoleMetrics({ role, positionDef: role, month: period.month, year: period.year, absences: loadedAbsences, totalFte });
          loadedActivities[role.id] = distributeActivitiesByWeights(createDefaultActivities(role), Math.max(0, metrics.maxHoursForRole - metrics.totalAbsenceHours));
      }
    }
    setAbsences(loadedAbsences);
    setActivitiesByRole(loadedActivities);
    setHydratedKey(draftKey);
  }, [draftKey, period.month, period.year, reports, roles, totalFte, topLevel]);

  useEffect(() => {
    setAbsences((previous) => ({ ...previous, holiday: getHolidaysCountForMonth(period.month, period.year) }));
  }, [period.month, period.year]);

  useEffect(() => {
    if (hydratedKey !== draftKey) return;
    const hasEditableReport = roles.some((role) => {
      const existingReport = reports.find((item) => item.assignmentId === role.id && item.month === period.month && item.year === period.year);
      return !existingReport || ["returned", "draft"].includes(existingReport.status) || (topLevel && existingReport.status === "ready_for_signature");
    });
    if (hasEditableReport) window.localStorage.setItem(draftKey, JSON.stringify({ absences, activitiesByRole }));
    else window.localStorage.removeItem(draftKey);
  }, [draftKey, hydratedKey, absences, activitiesByRole, roles, reports, period.month, period.year, topLevel]);

  const roleReports = useMemo(() => roles.map((role) => {
    const existingReport = reports.find((item) => item.assignmentId === role.id && item.month === period.month && item.year === period.year);
    const locked = Boolean(existingReport && !["returned", "draft"].includes(existingReport.status) && !(topLevel && existingReport.status === "ready_for_signature"));
    const roleAbsences = locked ? (existingReport.absences || {}) : absences;
    const metrics = calculateRoleMetrics({ role, positionDef: role, month: period.month, year: period.year, absences: roleAbsences, totalFte });
    const target = Math.max(0, metrics.maxHoursForRole - metrics.totalAbsenceHours);
    let activities = clampActivityRows(locked ? (existingReport.activities || []) : (activitiesByRole[role.id] || createDefaultActivities(role)));
    if (!locked && !activitiesByRole[role.id]) activities = distributeActivitiesByWeights(activities, target);
    const status = getActivityHoursStatus(activities, target);
    return { role, metrics, target, activities, status, existingReport, locked, reportAbsences: roleAbsences };
  }), [roles, period, absences, activitiesByRole, totalFte, reports, topLevel]);

  const editableReports = roleReports.filter((item) => !item.locked);
  const allLocked = roleReports.length > 0 && editableReports.length === 0;
  const ready = editableReports.length > 0 && editableReports.every((item) => item.status.isBalanced);

  const updateActivities = (roleId, updater) => setActivitiesByRole((previous) => {
    const role = roles.find((item) => item.id === roleId);
    const current = clampActivityRows(previous[roleId] || createDefaultActivities(role));
    return { ...previous, [roleId]: updater(current) };
  });

  const updateAbsence = (field, value) => {
    const nextAbsences = { ...absences, [field]: Number(value) };
    setAbsences(nextAbsences);
    setActivitiesByRole((current) => recalculateAllReportActivities({
      roles,
      period,
      absences: nextAbsences,
      totalFte,
      activitiesByRole: current,
    }));
  };

  const submit = async () => {
    setBusy(true); setNotice(null);
    try {
      await api("/api/work-reports/submit", { method: "POST", body: jsonBody({
        month: period.month, year: period.year, absences,
        reports: editableReports.map((report) => ({
          assignmentId: report.role.id, activities: report.activities,
          workedHours: sumActivityHours(report.activities), absenceHours: report.metrics.totalAbsenceHours,
        })),
      }) });
      window.localStorage.removeItem(draftKey);
      setExpanded([]);
      await onRefresh();
    } catch (error) { setNotice({ type: "error", text: error.message }); }
    finally { setBusy(false); }
  };

  const printCurrentReports = async () => {
    setBusy(true); setNotice(null);
    try {
      const printable = roleReports.map((report) => report.locked ? report.existingReport : {
        ...(report.existingReport || {}),
        employeeId: employee.id,
        employeeName: employee.name,
        assignmentId: report.role.id,
        positionId: report.role.positionId,
        positionName: report.role.positionName,
        budgetCode: report.role.budgetCode,
        contractType: report.role.contractType,
        allocationType: report.role.allocationType,
        allocationLabel: report.role.allocationType === "hours" ? `${report.role.monthlyHours} h/měsíc` : `${report.role.fte} úv.`,
        fte: report.role.fte,
        monthlyHours: report.role.monthlyHours,
        month: period.month,
        year: period.year,
        absences: report.reportAbsences,
        activities: report.activities,
        workedHours: report.status.sumActivitiesHours,
        absenceHours: report.metrics.totalAbsenceHours,
        status: report.existingReport?.status || "draft",
      });
      if (topLevel) {
        await printWorkReports(printable, project, [employee], positions);
        setNotice({ type: "ok", text: "Výkaz byl otevřen k přímému tisku." });
      } else {
        await downloadWorkReports(printable, [employee], positions, project);
        setNotice({ type: "ok", text: "Výkazy byly připraveny ke stažení a tisku." });
      }
    } catch (error) { setNotice({ type: "error", text: error.message }); }
    finally { setBusy(false); }
  };

  const deleteExistingReport = async (report) => {
    if (!window.confirm(`Opravdu smazat výkaz ${report.positionName} za ${MONTHS[report.month - 1]} ${report.year}?${report.driveFileId ? " Podepsané PDF na Google Disku se přesune do koše." : ""}`)) return;
    setBusy(true); setNotice(null);
    try {
      await api(`/api/work-reports/${report.id}`, { method: "DELETE" });
      window.localStorage.removeItem(draftKey);
      setNotice({ type: "success", text: "Výkaz byl smazán." });
      await onRefresh();
    } catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); }
  };

  const previewSignedReport = async (report) => {
    setBusy(true); setNotice(null);
    try {
      await openApiFilePreview(`/api/work-reports/${report.id}/signed-file`);
    } catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); }
  };

  return <div className="mx-auto max-w-5xl space-y-3">
    <Card title="1. Období a nepřítomnost" subtitle="Po změně dovolené nebo nemoci se hodiny přepočítají automaticky.">
      {notice && <div className={`mb-4 flex gap-2 rounded-lg p-3 text-sm font-semibold ${notice.type === "error" ? "bg-red-50 text-red-700" : notice.type === "warn" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{notice.type === "error" ? <AlertCircle size={18}/> : <CheckCircle2 size={18}/>} {notice.text}</div>}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Field label="Měsíc"><Select value={period.month} onChange={(event) => setPeriod((p) => ({ ...p, month: Number(event.target.value) }))}>{MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</Select></Field>
        <Field label="Rok"><Select value={period.year} onChange={(event) => setPeriod((p) => ({ ...p, year: Number(event.target.value) }))}>{Array.from({ length: new Date(project.endDate).getFullYear() - new Date(project.startDate).getFullYear() + 1 }, (_, i) => new Date(project.startDate).getFullYear() + i).map((year) => <option key={year}>{year}</option>)}</Select></Field>
        <Field label="Dovolená (dny)"><Input type="number" min="0" step="0.5" value={absences.vacation} disabled={allLocked} onChange={(event) => updateAbsence("vacation", event.target.value)}/></Field>
        <Field label="Nemoc (dny)"><Input type="number" min="0" step="0.5" value={absences.sickLeave} disabled={allLocked} onChange={(event) => updateAbsence("sickLeave", event.target.value)}/></Field>
      </div>
    </Card>

    {roleReports.map((report) => <section key={report.role.id} className="rounded-xl border border-slate-300 bg-white p-4 shadow-md shadow-slate-200/60">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="text-xs font-bold uppercase tracking-wide text-blue-700">2. Činnosti</div><h2 className="mt-0.5 text-lg font-bold text-slate-950">{report.role.positionName}</h2><p className="text-xs text-slate-500">{report.role.allocationType === "hours" ? `${report.role.monthlyHours} h/měsíc` : `${report.role.fte} úvazku`}</p></div>
        <div className="flex flex-wrap items-center gap-2">{report.existingReport && <StatusBadge status={report.existingReport.status}/>} {(report.existingReport?.driveFileId || report.existingReport?.localFilePath) && <Button variant="secondary" className="min-h-8 px-2 py-1 text-xs" disabled={busy} onClick={() => previewSignedReport(report.existingReport)}><Eye className="mr-1 inline" size={14}/>Náhled na Disku</Button>} {canDelete && report.existingReport && <Button variant="danger" className="min-h-8 px-2 py-1 text-xs" disabled={busy} onClick={() => deleteExistingReport(report.existingReport)}><Trash2 className="mr-1 inline" size={14}/>Smazat výkaz</Button>}<button className="min-h-8 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50" onClick={() => setExpanded((ids) => ids.includes(report.role.id) ? ids.filter((id) => id !== report.role.id) : [...ids, report.role.id])}>{expanded.includes(report.role.id) ? "Skrýt" : "Zobrazit"}</button></div>
      </div>
      {report.existingReport?.status === "returned" && report.existingReport.managerComment && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><strong>{report.existingReport.reviewedByRole === "director" ? "Poznámka Vedoucí služby/programu:" : "Poznámka Odborného garanta:"}</strong> {report.existingReport.managerComment}</div>}
      <div className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${report.status.isBalanced ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}><span>Zapsáno <strong>{formatHours(report.status.sumActivitiesHours)}</strong> z {formatHours(report.target)}</span><strong>{report.status.isBalanced ? "Hodiny sedí" : `Rozdíl ${formatHours(Math.abs(report.status.diff))}`}</strong></div>
      {expanded.includes(report.role.id) && <div className="mt-3">
        <div className="hidden grid-cols-[1fr_100px_36px] gap-2 px-1 pb-1 text-xs font-semibold text-slate-500 md:grid"><span>Činnost</span><span>Hodiny</span><span></span></div>
        {report.activities.map((activity, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_76px_36px] gap-2 border-t border-slate-100 py-1.5 first:border-t-0 md:grid-cols-[1fr_100px_36px]">
          <Textarea aria-label={`Činnost ${index + 1}`} compact rows="1" value={activity.desc} disabled={report.locked} onChange={(event) => updateActivities(report.role.id, (items) => items.map((item, i) => i === index ? { ...item, desc: event.target.value } : item))}/>
          <Input aria-label={`Hodiny pro činnost ${index + 1}`} type="number" min="0" step="0.01" value={activity.hours || ""} disabled={report.locked} onChange={(event) => updateActivities(report.role.id, (items) => items.map((item, i) => i === index ? { ...item, hours: Number(event.target.value) } : item))}/>
          <button aria-label="Odstranit činnost" disabled={report.locked || report.activities.length <= 1} onClick={() => updateActivities(report.role.id, (items) => items.filter((_, i) => i !== index))} className="min-h-9 rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"><Trash2 size={17}/></button>
        </div>)}
        <div className="mt-2 flex flex-wrap gap-2"><Button variant="secondary" disabled={report.locked || report.activities.length >= 10} onClick={() => updateActivities(report.role.id, (items) => [...items, { desc: "", hours: 0 }])}><Plus className="mr-1 inline" size={16}/>Přidat činnost</Button><Button variant="secondary" disabled={report.locked} onClick={() => updateActivities(report.role.id, (items) => distributeActivitiesByWeights(items, report.target))}>Přepočítat hodiny</Button></div>
      </div>}
    </section>)}

    <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div className="mb-3"><div className="text-xs font-bold uppercase tracking-wide text-blue-700">3. Dokončení</div><h2 className="mt-0.5 text-base font-bold text-slate-950">{topLevel ? "Uložit výkaz" : "Předat ke kontrole"}</h2></div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button className="w-full sm:w-auto" disabled={!ready || busy} onClick={submit}>{busy ? "Ukládám…" : topLevel ? "Uložit jako připravené k podpisu" : selfManaged ? "Předat Vedoucí služby/programu" : "Předat Odbornému garantovi ke kontrole"}</Button>
        <Button variant="secondary" disabled={busy || !roleReports.length} onClick={printCurrentReports}>{topLevel ? "Vytisknout výkaz" : "Stáhnout / vytisknout"}</Button>
      </div>
      {!roles.length && <p className="mt-3 text-sm text-red-700">Nemáte přiřazenou pozici, pro kterou se vytváří výkaz.</p>}
      {roleReports.some((item) => Math.abs(item.status.diff) > HOURS_TOLERANCE) && <p className="mt-3 text-sm text-red-700">Před předáním dorovnejte hodiny ve všech výkazech.</p>}
    </section>
  </div>;
}
