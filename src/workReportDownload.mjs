import JSZip from "jszip";
import { buildWorkbookBuffer, getReportFilename } from "./workbookExport.mjs";

const TEMPLATE_FILE_URL = new URL("../data/ŠABLONA_Pracovní výkaz OPZ+.xlsx", import.meta.url).href;
const monthKey = (year, month) => `${year}-${String(month).padStart(2, "0")}`;

function assignedProjectFte(employee, positions) {
  return (employee.assignments || []).reduce((sum, assignment) => {
    const position = positions.find((item) => item.id === assignment.positionId);
    if (!position || position.active === false || !position.reportRequired || position.allocationType !== "fte") return sum;
    return sum + Number(assignment.fte ?? position.fte ?? 0);
  }, 0);
}

export async function downloadWorkReports(reports, employees, positions, project) {
  if (!reports.length) throw new Error("Nejsou vybrány žádné výkazy.");
  const templateResponse = await fetch(TEMPLATE_FILE_URL);
  if (!templateResponse.ok) throw new Error("Nelze načíst šablonu výkazu.");
  const templateBuffer = await templateResponse.arrayBuffer();
  const zip = new JSZip();
  for (const report of reports) {
    const employee = employees.find((item) => item.id === report.employeeId) || {
      id: report.employeeId, name: report.employeeName, exportName: report.employeeName.replace(/\s+/g, "_"), globalFte: 1, assignments: [],
    };
    const position = positions.find((item) => item.id === report.positionId) || {};
    const role = { ...position, ...report, id: report.assignmentId, positionName: report.positionName };
    const totalFte = Number(employee.globalFte || 0) || assignedProjectFte(employee, positions);
    const built = await buildWorkbookBuffer({
      templateBuffer, project, employee, role,
      period: { month: report.month, year: report.year },
      absences: report.absences || {}, totalFte, activities: report.activities || [], reportId: report.id,
    });
    const filename = getReportFilename({
      period: { month: report.month, year: report.year }, project, role,
      employee: { ...employee, exportName: employee.exportName || employee.name.replace(/\s+/g, "_") },
    });
    zip.file(filename, built.buffer);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = reports.length === 1
    ? getReportFilename({
        period: { month: reports[0].month, year: reports[0].year }, project,
        role: { exportRoleName: "vykaz" }, employee: { exportName: reports[0].employeeName.replace(/\s+/g, "_") }, extension: "zip",
      })
    : `${monthKey(reports[0].year, reports[0].month)}__vykazy_ke_kontrole.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
