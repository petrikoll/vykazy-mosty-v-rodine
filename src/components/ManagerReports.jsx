import React, { useMemo, useState } from "react";
import { CheckCircle2, Download, Eye, RotateCcw, Trash2, X } from "lucide-react";
import { api, jsonBody, openApiFilePreview } from "../api.mjs";
import { downloadWorkReports } from "../workReportDownload.mjs";
import { printWorkReports } from "../workReportPrint.mjs";
import WorkReports from "./WorkReports.jsx";
import { Button, Card, Empty, Field, Notice, Select, StatusBadge, Textarea, useTimedNotice } from "./Common.jsx";
import SignedReportUpload from "./SignedReportUpload.jsx";

const acceptedStatuses = new Set(["submitted", "ready_for_signature", "approved", "printed", "signed_archived"]);
const MONTHS = ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen", "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"];
const formatHours = (value) => Number(value || 0).toLocaleString("cs-CZ", { maximumFractionDigits: 2 });
const formatDateTime = (value) => value
  ? new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "—";

function defaultPeriod(project) {
  const today = new Date();
  const start = new Date(project.startDate);
  const end = new Date(project.endDate);
  const selected = today < start ? start : today > end ? end : today;
  return { month: selected.getMonth() + 1, year: selected.getFullYear() };
}

function ReportDetail({ report, reviewerRole, busy, canDelete, canReview, onClose, onDelete, onDownload, onPreview, onStatusChange }) {
  const [returnNote, setReturnNote] = useState("");
  const absences = report.absences || {};
  const canReturn = canReview && report.status === "submitted";

  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-3 sm:p-8" role="dialog" aria-modal="true" aria-label="Detail pracovního výkazu">
    <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
        <div>
          <div className="mb-2"><StatusBadge status={report.status}/></div>
          <h2 className="text-xl font-bold text-slate-900">{report.employeeName}</h2>
          <p className="text-sm text-slate-600">{report.positionName} · {report.month}/{report.year}</p>
        </div>
        <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Zavřít detail"><X size={22}/></button>
      </header>

      <div className="space-y-5 p-5">
        {report.managerComment && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"><strong>{report.reviewedByName ? `Poznámka · ${report.reviewedByName}:` : reviewerRole === "director" ? "Poznámka Vedoucí služby/programu:" : "Poznámka Odborného garanta:"}</strong><div className="mt-1 whitespace-pre-wrap">{report.managerComment}</div></div>}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs font-semibold uppercase text-slate-500">Odpracováno</div><div className="mt-1 text-lg font-bold">{formatHours(report.workedHours)} h</div></div>
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs font-semibold uppercase text-slate-500">Nepřítomnost</div><div className="mt-1 text-lg font-bold">{formatHours(report.absenceHours)} h</div></div>
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs font-semibold uppercase text-slate-500">Rozsah pozice</div><div className="mt-1 text-lg font-bold">{report.allocationLabel}</div></div>
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs font-semibold uppercase text-slate-500">Předáno</div><div className="mt-1 text-sm font-bold">{formatDateTime(report.submittedAt)}</div></div>
        </div>

        <section>
          <h3 className="mb-2 font-bold text-slate-900">Vykázané činnosti</h3>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">Činnost</th><th className="w-28 p-3 text-right">Hodiny</th></tr></thead>
              <tbody>{(report.activities || []).map((activity, index) => <tr key={index} className="border-t border-slate-100"><td className="whitespace-pre-wrap p-3">{activity.desc}</td><td className="p-3 text-right font-bold">{formatHours(activity.hours)}</td></tr>)}</tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-bold text-slate-900">Nepřítomnosti</h3>
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 p-3">Dovolená: <strong>{formatHours(absences.vacation)} dne</strong></div>
            <div className="rounded-lg border border-slate-200 p-3">Nemoc: <strong>{formatHours(absences.sickLeave)} dne</strong></div>
            <div className="rounded-lg border border-slate-200 p-3">Svátek: <strong>{formatHours(absences.holiday)} dne</strong></div>
            <div className="rounded-lg border border-slate-200 p-3">Jiné překážky: <strong>{formatHours(absences.otherObstacles)} {absences.otherObstaclesUnit === "hours" ? "h" : "dne"}</strong></div>
            <div className="rounded-lg border border-slate-200 p-3">Lékař: <strong>{formatHours(absences.doctorVisitHours)} h</strong></div>
          </div>
        </section>

        {canReturn && <section className="rounded-xl border border-red-200 bg-red-50 p-4">
          <Field label="Poznámka pro zpracovatele" hint="Při vrácení je poznámka povinná a zpracovatel ji uvidí přímo u výkazu.">
            <Textarea value={returnNote} onChange={(event) => setReturnNote(event.target.value)} placeholder="Popište konkrétně, co je potřeba opravit."/>
          </Field>
          <Button variant="danger" className="mt-3" disabled={busy || !returnNote.trim()} onClick={() => onStatusChange(report.id, "returned", returnNote.trim())}><RotateCcw className="mr-1 inline" size={16}/>Vrátit k přepracování</Button>
        </section>}
      </div>

      <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 p-5">
        {canDelete && <Button variant="danger" disabled={busy} onClick={() => onDelete(report)}><Trash2 className="mr-1 inline" size={16}/>Smazat výkaz</Button>}
        <Button variant="secondary" disabled={busy} onClick={() => onDownload(report)}><Download className="mr-1 inline" size={16}/>Stáhnout výkaz</Button>
        {(report.driveFileId || report.localFilePath) && <Button variant="secondary" disabled={busy} onClick={() => onPreview(report)}><Eye className="mr-1 inline" size={16}/>Náhled na Disku</Button>}
        {canReturn && <Button disabled={busy} onClick={() => onStatusChange(report.id, "approved", "")}><CheckCircle2 className="mr-1 inline" size={16}/>Schválit</Button>}
        <Button variant="secondary" onClick={onClose}>Zavřít</Button>
      </footer>
    </div>
  </div>;
}

function ReportsTable({ rows, busy, onSelect }) {
  return <div className="overflow-x-auto">
    <table className="w-full min-w-[760px] text-left text-sm">
      <thead><tr className="border-b text-slate-500"><th className="p-2">Pracovník</th><th className="p-2">Projektová pozice</th><th className="p-2">Rozsah</th><th className="p-2">Stav</th><th className="p-2">Předáno</th><th className="p-2 text-right">Akce</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.report?.id || `${row.employee.id}-${row.assignment.id}`} className="border-b border-slate-100 last:border-b-0">
        <td className="p-2 font-bold text-slate-900">{row.employee.name}</td>
        <td className="p-2">{row.position.name}</td>
        <td className="p-2 text-slate-600">{row.position.allocationType === "hours" ? `${row.assignment.monthlyHours ?? row.position.monthlyHours ?? row.report?.monthlyHours ?? 0} h/měsíc` : `${row.assignment.fte ?? row.position.fte ?? row.report?.fte ?? 0} úv.`}</td>
        <td className="p-2"><StatusBadge status={row.status}/></td>
        <td className="p-2 text-slate-600">{formatDateTime(row.report?.submittedAt)}</td>
        <td className="p-2 text-right"><Button variant="secondary" className="px-3 py-1.5" disabled={busy || !row.report} onClick={() => onSelect(row.report)}><Eye className="mr-1 inline" size={16}/>Detail</Button></td>
      </tr>)}</tbody>
    </table>
  </div>;
}

export default function ManagerReports({ portal, positions, project, onRefresh }) {
  const isDirector = portal.employee.appRole === "director";
  const [view, setView] = useState("team");
  const [period, setPeriod] = useState(() => defaultPeriod(project));
  const [selectedReport, setSelectedReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useTimedNotice();

  const rows = useMemo(() => {
    const visibleEmployees = portal.employees.filter((employee) => employee.id !== portal.employee.id
      && employee.active !== false
      && (isDirector || employee.appRole === "worker"));
    const expectedRows = visibleEmployees.flatMap((employee) => (employee.assignments || []).map((assignment) => {
      const position = positions.find((item) => item.id === assignment.positionId);
      if (!position || position.active === false || !position.reportRequired) return null;
      const report = portal.workReports.find((item) => item.employeeId === employee.id
        && item.assignmentId === assignment.id && item.month === period.month && item.year === period.year);
      return { employee, assignment, position, report, status: report?.status || "missing" };
    }).filter(Boolean));

    if (!isDirector) {
      return expectedRows.sort((a, b) => a.employee.name.localeCompare(b.employee.name, "cs") || a.position.name.localeCompare(b.position.name, "cs"));
    }

    const representedReportIds = new Set(expectedRows.map((row) => row.report?.id).filter(Boolean));
    const storedRows = portal.workReports
      .filter((report) => report.employeeId !== portal.employee.id
        && report.month === period.month
        && report.year === period.year
        && !representedReportIds.has(report.id))
      .map((report) => {
        const employee = portal.employees.find((item) => item.id === report.employeeId) || {
          id: report.employeeId,
          name: report.employeeName,
          appRole: "worker",
        };
        const position = positions.find((item) => item.id === report.positionId) || {
          id: report.positionId,
          name: report.positionName,
          allocationType: report.allocationType,
          monthlyHours: report.monthlyHours,
          fte: report.fte,
        };
        return {
          employee,
          assignment: {
            id: report.assignmentId || report.id,
            monthlyHours: report.monthlyHours,
            fte: report.fte,
          },
          position,
          report,
          status: report.status,
        };
      });

    return [...expectedRows, ...storedRows]
      .sort((a, b) => a.employee.name.localeCompare(b.employee.name, "cs") || a.position.name.localeCompare(b.position.name, "cs"));
  }, [portal.employee.id, portal.employees, portal.workReports, positions, period, isDirector]);

  const receivedCount = rows.filter((row) => acceptedStatuses.has(row.status)).length;
  const approvedReports = rows
    .filter((row) => row.report && ["approved", "printed", "signed_archived"].includes(row.status))
    .map((row) => row.report);
  const canReviewReport = (report) => {
    const owner = portal.employees.find((employee) => employee.id === report?.employeeId);
    return Boolean(report && (isDirector ? owner?.appRole === "manager" : owner?.appRole === "worker"));
  };
  const pendingRows = rows.filter((row) => row.report?.status === "submitted" && canReviewReport(row.report));
  const pendingReportIds = new Set(pendingRows.map((row) => row.report.id));
  const otherRows = rows.filter((row) => !row.report || !pendingReportIds.has(row.report.id));

  const changeStatus = async (id, status, comment) => {
    setBusy(true); setMessage("");
    try {
      const result = await api(`/api/work-reports/${id}/status`, { method: "PATCH", body: jsonBody({ status, comment }) });
      setSelectedReport(result.report);
      await onRefresh();
      if (status === "returned") setSelectedReport(null);
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  };

  const download = async (report) => {
    setBusy(true); setMessage("");
    try {
      await downloadWorkReports([report], portal.employees, positions, project);
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  };

  const printApproved = async () => {
    setBusy(true); setMessage("");
    try {
      await printWorkReports(approvedReports, project, portal.employees, positions);
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  };

  const previewSignedReport = async (report) => {
    setBusy(true); setMessage("");
    try {
      await openApiFilePreview(`/api/work-reports/${report.id}/signed-file`);
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  };

  const deleteReport = async (report) => {
    if (!window.confirm(`Opravdu smazat výkaz ${report.employeeName} · ${report.positionName} za ${MONTHS[report.month - 1]} ${report.year}?${report.driveFileId ? " Podepsané PDF na Google Disku se přesune do koše." : ""}`)) return;
    setBusy(true); setMessage(""); setNotice(null);
    try {
      await api(`/api/work-reports/${report.id}`, { method: "DELETE" });
      setSelectedReport(null);
      setNotice({ type: "success", text: "Výkaz byl smazán." });
      await onRefresh();
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  };

  const viewSwitch = <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-300 bg-blue-50 p-1 shadow-md shadow-slate-200/60">
    <button onClick={() => setView("team")} className={`min-h-9 rounded-md px-3 py-1.5 text-sm font-bold ${view === "team" ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{isDirector ? "Výkazy týmu" : "Přehled týmu"}</button>
    <button onClick={() => setView("own")} className={`min-h-9 rounded-md px-3 py-1.5 text-sm font-bold ${view === "own" ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}>Můj výkaz</button>
  </div>;

  if (view === "own") {
    return <div className="space-y-3">
      {viewSwitch}
      <WorkReports
        employee={portal.employee}
        positions={positions}
        project={project}
        reports={portal.workReports.filter((item) => item.employeeId === portal.employee.id)}
        onRefresh={onRefresh}
        selfManaged={!isDirector}
        topLevel={isDirector}
        canDelete={isDirector}
      />
    </div>;
  }

  return <div className="space-y-3">
    {viewSwitch}
    <Notice notice={notice}/>
    {message && <div className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{message}</div>}
    <Card title={isDirector ? "Výkazy týmu" : "Kontrola měsíčních výkazů"} subtitle={`${receivedCount} z ${rows.length} očekávaných výkazů je předáno nebo zpracováno.`}>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:max-w-xl">
        <Field label="Měsíc"><Select value={period.month} onChange={(event) => setPeriod((current) => ({ ...current, month: Number(event.target.value) }))}>{MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</Select></Field>
        <Field label="Rok"><Select value={period.year} onChange={(event) => setPeriod((current) => ({ ...current, year: Number(event.target.value) }))}>{Array.from({ length: new Date(project.endDate).getFullYear() - new Date(project.startDate).getFullYear() + 1 }, (_, index) => new Date(project.startDate).getFullYear() + index).map((year) => <option key={year}>{year}</option>)}</Select></Field>
      </div>
      {!rows.length ? <Empty>{isDirector ? "Pro tento měsíc nejsou žádné týmové výkazy." : "Nejsou založeni žádní pracovníci s pozicí, pro kterou se vytváří měsíční výkaz."}</Empty> : isDirector ? <div className="space-y-5">
        {pendingRows.length > 0 && <section className="overflow-hidden rounded-xl border border-amber-300 bg-amber-50/60">
          <div className="border-b border-amber-200 px-3 py-2">
            <h3 className="font-bold text-slate-900">Čeká na vaše schválení ({pendingRows.length})</h3>
          </div>
          <div className="bg-white px-2"><ReportsTable rows={pendingRows} busy={busy} onSelect={setSelectedReport}/></div>
        </section>}
        <section>
          <h3 className="mb-2 font-bold text-slate-900">Ostatní výkazy v měsíci ({otherRows.length})</h3>
          {otherRows.length ? <ReportsTable rows={otherRows} busy={busy} onSelect={setSelectedReport}/> : <Empty>Všechny výkazy nyní čekají na vaše schválení.</Empty>}
        </section>
      </div> : <ReportsTable rows={rows} busy={busy} onSelect={setSelectedReport}/>}
      <div className="mt-4 flex justify-end"><Button disabled={busy || !approvedReports.length} onClick={printApproved}><Download className="mr-1 inline" size={16}/>Tisk schválených ({approvedReports.length})</Button></div>
    </Card>

    <SignedReportUpload
      onRefresh={onRefresh}
      canOpenDrive={isDirector}
      driveFolderUrl={portal.google.driveFolderUrl}
      title="Hromadné nahrání podepsaných výkazů"
      subtitle={isDirector
        ? "Vedoucí služby/programu může nahrát společný PDF, několik samostatných PDF nebo ZIP. Nabídnou se schválené výkazy Odborného garanta i její vlastní výkaz připravený k podpisu."
        : "Odborný garant může nahrát společný PDF, několik samostatných PDF nebo ZIP. Nabídnou se schválené výkazy pracovníků a vlastní schválený výkaz."}
    />
    {selectedReport && <ReportDetail report={selectedReport} reviewerRole={portal.employee.appRole} busy={busy} canDelete={isDirector} canReview={canReviewReport(selectedReport)} onClose={() => setSelectedReport(null)} onDelete={deleteReport} onDownload={download} onPreview={previewSignedReport} onStatusChange={changeStatus}/>}
  </div>;
}
