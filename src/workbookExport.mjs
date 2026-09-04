import ExcelJS from "exceljs";
import { calculateRoleMetrics } from "./workReportRules.mjs";
import { clampActivityRows, roundHours, sumActivityHours } from "./activityUtils.mjs";

const CONTRACT_LABELS = {
  PS: "Pracovní smlouva",
  "DPČ": "Dohoda o pracovní činnosti",
  "DPP": "Dohoda o provedení práce",
};

export const pad = (value) => String(value).padStart(2, "0");

export const getReportFilename = ({ period, project, role, employee, extension = "xlsx" }) =>
  `${period.year}-${pad(period.month)}__${project.shortName}__${role.exportRoleName}__${employee.exportName}.${extension}`;

export const buildWorkbookBuffer = async ({
  templateBuffer,
  project,
  employee,
  role,
  period,
  absences,
  totalFte,
  activities,
  reportId = "",
}) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("V šabloně nebyl nalezen žádný list.");

  const normalizedActivities = clampActivityRows(activities);
  const metrics = calculateRoleMetrics({
    role,
    positionDef: role,
    month: period.month,
    year: period.year,
    absences,
    totalFte,
  });
  const workedHours = sumActivityHours(normalizedActivities);
  const totalOverallHours = roundHours(workedHours + metrics.totalAbsenceHours);
  const monthEndDateText = `${pad(new Date(period.year, period.month, 0).getDate())}.${pad(period.month)}.${period.year}`;
  const setCell = (address, value) => {
    worksheet.getCell(address).value = value;
  };

  setCell("G7", metrics.totalFundHours);
  setCell("C7", project.name);
  setCell("C8", project.regNumber);
  setCell("G8", Number(employee.globalFte || 0));
  setCell("C9", employee.name);
  setCell("G9", CONTRACT_LABELS[role.contractType] || role.contractType || "");
  setCell("C10", role.positionName || role.name);
  setCell("C11", role.budgetCode || "");
  setCell("G11", metrics.roleFte);
  setCell("C12", period.month);
  setCell("C13", period.year);
  setCell("G13", metrics.roleFte);

  for (let index = 0; index < 10; index += 1) {
    const row = 17 + index;
    const activity = normalizedActivities[index];
    setCell(`B${row}`, activity ? activity.desc : "");
    setCell(`G${row}`, activity ? Number(activity.hours || 0) : "");
  }

  setCell("G28", workedHours);
  setCell("G29", workedHours);
  setCell("G32", metrics.absHours.vacation || 0);
  setCell("D32", metrics.absHours.vacation || 0);
  setCell("G34", metrics.absHours.sickLeave || 0);
  setCell("D34", metrics.absHours.sickLeave || 0);
  setCell("G36", (metrics.absHours.otherObstacles || 0) + (metrics.absHours.doctorVisit || 0));
  setCell("D36", (metrics.absHours.otherObstacles || 0) + (metrics.absHours.doctorVisit || 0));
  setCell("G38", metrics.absHours.holiday || 0);
  setCell("D38", metrics.absHours.holiday || 0);
  setCell("G40", metrics.maxHoursForRole || 0);
  setCell("G41", totalOverallHours || 0);
  setCell("C44", monthEndDateText);
  setCell("C45", monthEndDateText);

  if (reportId) {
    const originalFooter = worksheet.headerFooter?.oddFooter || "";
    const approved = ["approved", "printed", "signed_archived"].includes(role.status);
    const approvalTimestamp = role.approvedAt || role.reviewedAt;
    const approvalDate = approvalTimestamp ? new Intl.DateTimeFormat("cs-CZ").format(new Date(approvalTimestamp)) : "";
    const approvalText = approved
      ? `Zkontrolováno a schváleno k podpisu${role.approvedByName || role.reviewedByName ? ` · ${role.approvedByName || role.reviewedByName}` : ""}${approvalDate ? ` · ${approvalDate}` : ""}\n`
      : "";
    worksheet.headerFooter = {
      ...(worksheet.headerFooter || {}),
      oddFooter: `${originalFooter}${originalFooter ? "  " : ""}&R${approvalText}ID výkazu: ${reportId}`,
    };
  }

  return {
    buffer: await workbook.xlsx.writeBuffer(),
    metrics,
    activities: normalizedActivities,
    workedHours,
    totalOverallHours,
  };
};
