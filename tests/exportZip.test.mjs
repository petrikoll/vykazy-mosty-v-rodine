import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { EMPLOYEE, PROJECTS, ROLES } from "../src/sulkovaConfig.mjs";
import { calculateRoleMetrics, getHolidaysCountForMonth } from "../src/workReportRules.mjs";
import {
  HOURS_TOLERANCE,
  balanceActivitiesToRequiredHours,
  clampActivityRows,
  distributeActivitiesByWeights,
  getActivityHoursStatus,
  roundHours,
  sumActivityHours,
} from "../src/activityUtils.mjs";
import { recalculateAllReportActivities } from "../src/reportRecalc.mjs";

const period = { month: 5, year: 2026 };
const totalFte = ROLES.reduce((sum, role) => sum + Number(role.fte || 0), 0);
const absences = {
  vacation: 0,
  sickLeave: 0,
  otherObstacles: 0,
  otherObstaclesUnit: "days",
  doctorVisitHours: 0,
  holiday: getHolidaysCountForMonth(period.month, period.year),
};
const pad = (value) => String(value).padStart(2, "0");
const templatePath = path.resolve("data", "ŠABLONA_Pracovní výkaz OPZ+.xlsx");
const fixedActivityHours = {
  "pracovni-poradce-zam": [19.5, 11.5, 7],
  "dluhovy-poradce-zam": [19.5, 11.5, 7],
  "dluhovy-poradce-mas-putovni": [39.5, 23.5, 13],
};

const assertPlainNumber = (value, expected, label) => {
  assert.equal(typeof value, "number", `${label} must be a direct number, not a formula object`);
  assert.equal(value, expected, label);
};

const assertApprox = (actual, expected, label) => {
  assert.ok(Math.abs(Number(actual || 0) - expected) <= HOURS_TOLERANCE, `${label}: expected ${expected}, got ${actual}`);
};

assert.equal(EMPLOYEE.name, "Jana Sulková, DiS.");
assert.equal(EMPLOYEE.globalFte, 1);
assert.equal(totalFte, 1, "0.25 + 0.25 + 0.5 must equal 1.0");

const buildWorkbook = async (role, activityOverrides = null) => {
  const project = PROJECTS[role.projectId];
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await fs.readFile(templatePath));
  const worksheet = workbook.worksheets[0];
  const metrics = calculateRoleMetrics({
    role,
    positionDef: { id: role.positionId, name: role.positionName },
    month: period.month,
    year: period.year,
    absences,
    totalFte,
  });
  const activities = clampActivityRows(
    activityOverrides ||
      role.activities.map((activity, index) => ({
        desc: activity,
        hours: fixedActivityHours[role.id][index],
      }))
  );
  const workedHours = sumActivityHours(activities);
  const totalOverallHours = workedHours + metrics.totalAbsenceHours;

  worksheet.getCell("C7").value = project.name;
  worksheet.getCell("C8").value = project.regNumber;
  worksheet.getCell("G8").value = EMPLOYEE.globalFte;
  worksheet.getCell("C9").value = EMPLOYEE.name;
  worksheet.getCell("G9").value = "Pracovní smlouva";
  worksheet.getCell("C10").value = role.positionName;
  worksheet.getCell("C11").value = role.budgetCode;
  worksheet.getCell("G11").value = role.fte;

  activities.forEach((activity, index) => {
    const row = 17 + index;
    worksheet.getCell(`B${row}`).value = activity.desc;
    worksheet.getCell(`G${row}`).value = activity.hours;
  });

  for (let index = activities.length; index < 10; index += 1) {
    const row = 17 + index;
    worksheet.getCell(`B${row}`).value = "";
    worksheet.getCell(`G${row}`).value = "";
  }

  worksheet.getCell("G28").value = workedHours;
  worksheet.getCell("G29").value = workedHours;
  worksheet.getCell("G32").value = metrics.absHours.vacation;
  worksheet.getCell("D32").value = metrics.absHours.vacation;
  worksheet.getCell("G34").value = metrics.absHours.sickLeave;
  worksheet.getCell("D34").value = metrics.absHours.sickLeave;
  worksheet.getCell("G36").value = metrics.absHours.otherObstacles + metrics.absHours.doctorVisit;
  worksheet.getCell("D36").value = metrics.absHours.otherObstacles + metrics.absHours.doctorVisit;
  worksheet.getCell("G38").value = metrics.absHours.holiday;
  worksheet.getCell("D38").value = metrics.absHours.holiday;
  worksheet.getCell("G40").value = metrics.maxHoursForRole;
  worksheet.getCell("G41").value = totalOverallHours;

  return { project, metrics, activities, workedHours, totalOverallHours, buffer: await workbook.xlsx.writeBuffer() };
};

const zip = new JSZip();
const generated = [];

for (const role of ROLES) {
  const report = await buildWorkbook(role);
  const filename = `${period.year}-${pad(period.month)}__${report.project.shortName}__${role.exportRoleName}__${EMPLOYEE.exportName}.xlsx`;
  zip.file(filename, report.buffer);
  generated.push({ role, ...report, filename });
}

const expectedNames = [
  "2026-05__CECH_ZAM__Pracovni_poradce__Jana_Sulkova.xlsx",
  "2026-05__CECH_ZAM__Dluhovy_poradce__Jana_Sulkova.xlsx",
  "2026-05__MAS_DLUHY__Dluhovy_poradce_putovni__Jana_Sulkova.xlsx",
];

assert.deepEqual(generated.map((item) => item.filename), expectedNames);

const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
const loadedZip = await JSZip.loadAsync(zipBuffer);
assert.deepEqual(Object.keys(loadedZip.files).sort(), expectedNames.toSorted());

for (const report of generated) {
  const fileBuffer = await loadedZip.file(report.filename).async("nodebuffer");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  const worksheet = workbook.worksheets[0];

  assert.equal(worksheet.getCell("C7").value, report.project.name, `${report.filename} project name`);
  assert.equal(worksheet.getCell("C8").value, report.project.regNumber, `${report.filename} registration number`);
  assert.notEqual(worksheet.getCell("E8").value, report.project.regNumber, `${report.filename} does not duplicate registration number in E8`);
  assert.equal(worksheet.getCell("C11").value, report.role.budgetCode, `${report.filename} budget code`);
  assert.equal(worksheet.getCell("G11").value, report.role.fte, `${report.filename} FTE`);
  assert.equal(worksheet.getCell("B17").value, report.role.activities[0], `${report.filename} activity text is preserved`);
  assertPlainNumber(worksheet.getCell("G28").value, report.workedHours, `${report.filename} project worked hours`);
  assertPlainNumber(worksheet.getCell("G29").value, report.workedHours, `${report.filename} employment worked hours`);
  assertPlainNumber(worksheet.getCell("G40").value, report.metrics.maxHoursForRole, `${report.filename} employment total hours`);
  assertPlainNumber(worksheet.getCell("G41").value, report.totalOverallHours, `${report.filename} project relevant hours`);
}

const manualRole = ROLES[0];
const manualActivities = [
  { desc: "Ručně upravená pracovní konzultace s účastníkem projektu.", hours: 10 },
  { desc: manualRole.activities[1], hours: 10 },
  { desc: manualRole.activities[2], hours: 10 },
  { desc: "Nově přidaná činnost pro individuální podporu účastníka.", hours: 8 },
];
const manualReport = await buildWorkbook(manualRole, manualActivities);
const manualWorkbook = new ExcelJS.Workbook();
await manualWorkbook.xlsx.load(manualReport.buffer);
const manualWorksheet = manualWorkbook.worksheets[0];

assert.equal(manualWorksheet.getCell("B17").value, manualActivities[0].desc, "manually edited activity text reaches XLSX");
assert.equal(manualWorksheet.getCell("B20").value, manualActivities[3].desc, "added activity reaches XLSX");
assertPlainNumber(manualWorksheet.getCell("G28").value, 38, "manual activities determine worked-hours summary");

const tooManyActivities = Array.from({ length: 12 }, (_, index) => ({
  desc: `Test activity ${index + 1}`,
  hours: index + 1,
}));
const cappedReport = await buildWorkbook(manualRole, tooManyActivities);
const cappedWorkbook = new ExcelJS.Workbook();
await cappedWorkbook.xlsx.load(cappedReport.buffer);
const cappedWorksheet = cappedWorkbook.worksheets[0];

assert.equal(cappedWorksheet.getCell("B26").value, "Test activity 10", "export writes the tenth activity");
assert.notEqual(cappedWorksheet.getCell("B26").value, "Test activity 11", "export does not write more than 10 activities");
assert.equal(cappedReport.activities.length, 10, "activity list is capped at 10 rows before export");

const missingStatus = getActivityHoursStatus([{ desc: "A", hours: 7 }], 10);
assert.equal(missingStatus.sumActivitiesHours, 7, "activity status sums hours");
assert.equal(missingStatus.requiredWorkedHours, 10, "activity status keeps required hours");
assert.equal(missingStatus.missingHours, 3, "activity status reports missing hours");
assert.equal(missingStatus.exceededHours, 0, "activity status does not report excess when missing");

const exceededStatus = getActivityHoursStatus([{ desc: "A", hours: 12.5 }], 10);
assert.equal(exceededStatus.missingHours, 0, "activity status does not report missing when exceeded");
assert.equal(exceededStatus.exceededHours, 2.5, "activity status reports exceeded hours");

const marchPeriod = { month: 3, year: 2026 };
const marchAbsences = {
  vacation: 1,
  sickLeave: 0,
  otherObstacles: 0,
  otherObstaclesUnit: "hours",
  doctorVisitHours: 3,
  holiday: getHolidaysCountForMonth(marchPeriod.month, marchPeriod.year),
};
const marchHoursByRole = {
  "pracovni-poradce-zam": [21.45, 12.79, 7.01],
  "dluhovy-poradce-zam": [21.45, 12.79, 7.01],
  "dluhovy-poradce-mas-putovni": [42.9, 25.58, 14.02],
};

const buildMarchWorkbook = async (role) => {
  const project = PROJECTS[role.projectId];
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await fs.readFile(templatePath));
  const worksheet = workbook.worksheets[0];
  const metrics = calculateRoleMetrics({
    role,
    positionDef: { id: role.positionId, name: role.positionName },
    month: marchPeriod.month,
    year: marchPeriod.year,
    absences: marchAbsences,
    totalFte,
  });
  const activities = role.activities.map((activity, index) => ({
    desc: activity,
    hours: marchHoursByRole[role.id][index],
  }));
  const workedHours = sumActivityHours(activities);
  const totalOverallHours = roundHours(workedHours + metrics.totalAbsenceHours);

  worksheet.getCell("C7").value = project.name;
  worksheet.getCell("C8").value = project.regNumber;
  worksheet.getCell("G8").value = EMPLOYEE.globalFte;
  worksheet.getCell("C9").value = EMPLOYEE.name;
  worksheet.getCell("C10").value = role.positionName;
  worksheet.getCell("C11").value = role.budgetCode;
  worksheet.getCell("G11").value = role.fte;

  activities.forEach((activity, index) => {
    const row = 17 + index;
    worksheet.getCell(`B${row}`).value = activity.desc;
    worksheet.getCell(`G${row}`).value = activity.hours;
  });

  worksheet.getCell("G28").value = workedHours;
  worksheet.getCell("G29").value = workedHours;
  worksheet.getCell("G32").value = metrics.absHours.vacation;
  worksheet.getCell("G34").value = metrics.absHours.sickLeave;
  worksheet.getCell("G36").value = metrics.absHours.otherObstacles + metrics.absHours.doctorVisit;
  worksheet.getCell("G38").value = metrics.absHours.holiday;
  worksheet.getCell("G40").value = metrics.maxHoursForRole;
  worksheet.getCell("G41").value = totalOverallHours;

  return { role, metrics, buffer: await workbook.xlsx.writeBuffer() };
};

for (const role of ROLES) {
  const report = await buildMarchWorkbook(role);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(report.buffer);
  const worksheet = workbook.worksheets[0];
  const activitySum = sumActivityHours(Array.from({ length: 10 }, (_, index) => ({ hours: worksheet.getCell(`G${17 + index}`).value || 0 })));
  const absenceSum = [32, 34, 36, 38].reduce((sum, row) => sum + Number(worksheet.getCell(`G${row}`).value || 0), 0);
  const expectedFund = report.metrics.totalFundHours * report.metrics.roleFte;

  assertApprox(activitySum + absenceSum, worksheet.getCell("G40").value, `${role.id} March activities plus absences equal G40`);
  assertApprox(worksheet.getCell("G40").value, expectedFund, `${role.id} March G40 equals monthly fund times FTE`);

  if (role.projectId === "cech-zamestnanost") {
    assertApprox(activitySum, 41.25, `${role.id} March CECH activity sum`);
    assertApprox(worksheet.getCell("G41").value, 44, `${role.id} March CECH relevant hours`);
  } else {
    assertApprox(activitySum, 82.5, `${role.id} March MAS activity sum`);
    assertApprox(worksheet.getCell("G41").value, 88, `${role.id} March MAS relevant hours`);
  }
}

const buildReportsForScenario = ({ month, year, scenarioAbsences }) =>
  ROLES.map((role) => {
    const metrics = calculateRoleMetrics({
      role,
      positionDef: { id: role.positionId, name: role.positionName },
      month,
      year,
      absences: scenarioAbsences,
      totalFte,
    });
    const requiredWorkedHours = roundHours(metrics.maxHoursForRole - metrics.totalAbsenceHours);
    return {
      role,
      metrics,
      requiredWorkedHours,
      activities: role.activities.map((desc) => ({ desc, hours: 0 })),
    };
  });

const assertScenarioBalances = (label, reports) => {
  for (const report of reports) {
    const activitySum = sumActivityHours(report.activities);
    assertApprox(activitySum, report.requiredWorkedHours, `${label} ${report.role.id} activity sum equals required worked hours`);
    assertApprox(activitySum + report.metrics.totalAbsenceHours, report.metrics.maxHoursForRole, `${label} ${report.role.id} activity plus absence equals role fund`);
  }
};

const marchReportsAfterGlobalDistribution = buildReportsForScenario({
  month: 3,
  year: 2026,
  scenarioAbsences: marchAbsences,
}).map((report) => ({
  ...report,
  activities: distributeActivitiesByWeights(report.activities, report.requiredWorkedHours),
}));
assertScenarioBalances("March global distribution", marchReportsAfterGlobalDistribution);
assertApprox(sumActivityHours(marchReportsAfterGlobalDistribution[0].activities), 41.25, "March global distribution CECH first role");
assertApprox(sumActivityHours(marchReportsAfterGlobalDistribution[1].activities), 41.25, "March global distribution CECH second role");
assertApprox(sumActivityHours(marchReportsAfterGlobalDistribution[2].activities), 82.5, "March global distribution MAS role");

const noAbsenceReports = buildReportsForScenario({
  month: 4,
  year: 2026,
  scenarioAbsences: {
    vacation: 0,
    sickLeave: 0,
    otherObstacles: 0,
    otherObstaclesUnit: "days",
    doctorVisitHours: 0,
    holiday: getHolidaysCountForMonth(4, 2026),
  },
}).map((report) => ({
  ...report,
  activities: distributeActivitiesByWeights(report.activities, report.requiredWorkedHours),
}));
assertScenarioBalances("No manual absence month", noAbsenceReports);

const holidayMonthReports = buildReportsForScenario({
  month: 5,
  year: 2026,
  scenarioAbsences: absences,
}).map((report) => ({
  ...report,
  activities: distributeActivitiesByWeights(report.activities, report.requiredWorkedHours),
}));
assertScenarioBalances("Holiday month", holidayMonthReports);

const manuallyOffReports = buildReportsForScenario({
  month: 3,
  year: 2026,
  scenarioAbsences: marchAbsences,
}).map((report) => ({
  ...report,
  activities: balanceActivitiesToRequiredHours(
    report.activities.map((activity, index) => ({ ...activity, hours: index === 0 ? 1 : 0 })),
    report.requiredWorkedHours
  ),
}));
assertScenarioBalances("Balance all reports", manuallyOffReports);

const baseActivities = Object.fromEntries(
  ROLES.map((role) => [
    role.id,
    role.activities.map((desc) => ({ desc: `${desc} (upravený text)`, hours: 0 })),
  ])
);

const april2027Absences = {
  vacation: 4,
  sickLeave: 0,
  otherObstacles: 0,
  otherObstaclesUnit: "hours",
  doctorVisitHours: 27,
  holiday: 0,
};

const april2027 = recalculateAllReportActivities({
  roles: ROLES,
  period: { month: 4, year: 2027 },
  absences: april2027Absences,
  totalFte,
  activitiesByRole: baseActivities,
  resetToDefaultText: false,
});

assertApprox(sumActivityHours(april2027["pracovni-poradce-zam"]), 29.25, "April 2027 CECH worker hours");
assertApprox(sumActivityHours(april2027["dluhovy-poradce-zam"]), 29.25, "April 2027 CECH debt advisor hours");
assertApprox(sumActivityHours(april2027["dluhovy-poradce-mas-putovni"]), 58.5, "April 2027 MAS hours");
assert.equal(april2027["pracovni-poradce-zam"][0].desc.includes("upravený text"), true, "Automatic recalculation preserves edited text");

const october2027Absences = {
  vacation: 4,
  sickLeave: 0,
  otherObstacles: 0,
  otherObstaclesUnit: "hours",
  doctorVisitHours: 19,
  holiday: 1,
};

const october2027 = recalculateAllReportActivities({
  roles: ROLES,
  period: { month: 10, year: 2027 },
  absences: october2027Absences,
  totalFte,
  activitiesByRole: april2027,
  resetToDefaultText: false,
});

assertApprox(sumActivityHours(october2027["pracovni-poradce-zam"]), 27.25, "October 2027 CECH worker hours");
assertApprox(sumActivityHours(october2027["dluhovy-poradce-zam"]), 27.25, "October 2027 CECH debt advisor hours");
assertApprox(sumActivityHours(october2027["dluhovy-poradce-mas-putovni"]), 54.5, "October 2027 MAS hours");
assert.notEqual(sumActivityHours(october2027["pracovni-poradce-zam"]), sumActivityHours(april2027["pracovni-poradce-zam"]), "Switching April -> October does not keep stale hours");

const resetAllApril = recalculateAllReportActivities({
  roles: ROLES,
  period: { month: 4, year: 2027 },
  absences: april2027Absences,
  totalFte,
  activitiesByRole: {},
  resetToDefaultText: true,
});

assert.equal(resetAllApril["pracovni-poradce-zam"][0].desc, ROLES[0].activities[0], "Reset all restores default CECH worker text");
assert.equal(resetAllApril["dluhovy-poradce-zam"][0].desc, ROLES[1].activities[0], "Reset all restores default CECH debt advisor text");
assert.equal(resetAllApril["dluhovy-poradce-mas-putovni"][0].desc, ROLES[2].activities[0], "Reset all restores default MAS text");
assertApprox(sumActivityHours(resetAllApril["pracovni-poradce-zam"]), 29.25, "Reset all recalculates CECH worker hours");
assertApprox(sumActivityHours(resetAllApril["dluhovy-poradce-zam"]), 29.25, "Reset all recalculates CECH debt advisor hours");
assertApprox(sumActivityHours(resetAllApril["dluhovy-poradce-mas-putovni"]), 58.5, "Reset all recalculates MAS hours");

const aprilTotalWorked = roundHours(
  sumActivityHours(resetAllApril["pracovni-poradce-zam"]) +
    sumActivityHours(resetAllApril["dluhovy-poradce-zam"]) +
    sumActivityHours(resetAllApril["dluhovy-poradce-mas-putovni"])
);
assertApprox(aprilTotalWorked, 117, "April 2027 total worked hours after reset-all");

console.log("export ZIP tests passed");
