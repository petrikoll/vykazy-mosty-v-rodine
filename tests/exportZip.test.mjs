import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { DEFAULT_ABSENCES, EMPLOYEE, PROJECT, ROLES } from "../src/projectConfig.mjs";
import { distributeActivitiesByWeights } from "../src/activityUtils.mjs";
import { buildWorkbookBuffer, getReportFilename } from "../src/workbookExport.mjs";
import { getHolidaysCountForMonth } from "../src/workReportRules.mjs";

const period = { month: 5, year: 2026 };
const totalFte = ROLES.reduce(
  (sum, role) => sum + (role.allocationType === "fte" ? Number(role.fte || 0) : 0),
  0
);
const absences = {
  ...DEFAULT_ABSENCES,
  holiday: getHolidaysCountForMonth(period.month, period.year),
};
const templateBuffer = await fs.readFile(
  path.resolve("data", "ŠABLONA_Pracovní výkaz OPZ+.xlsx")
);

assert.equal(EMPLOYEE.name, "Martina Pírková");
assert.equal(EMPLOYEE.globalFte, 1);
assert.equal(totalFte, 1);
assert.deepEqual(
  ROLES.map((role) => role.positionId),
  ["expert-guarantor", "case-manager", "mediator"]
);

const zip = new JSZip();
const generated = [];

for (const role of ROLES) {
  const targetHours = 168 * Number(role.fte || 0);
  const activities = distributeActivitiesByWeights(
    role.activities.map((desc) => ({ desc, hours: 0 })),
    targetHours
  );
  const reportId = `WR-2026-05-${role.positionId}`;
  const report = await buildWorkbookBuffer({
    templateBuffer,
    project: PROJECT,
    employee: EMPLOYEE,
    role,
    period,
    absences,
    totalFte,
    activities,
    reportId,
  });
  const filename = getReportFilename({ period, project: PROJECT, role, employee: EMPLOYEE });
  zip.file(filename, report.buffer);
  generated.push({ filename, reportId, role, ...report });
}

const expectedNames = [
  "2026-05__MOSTY_ROD__Odborny_garant__Martina_Pirkova.xlsx",
  "2026-05__MOSTY_ROD__Casemanager__Martina_Pirkova.xlsx",
  "2026-05__MOSTY_ROD__Mediator__Martina_Pirkova.xlsx",
];
assert.deepEqual(generated.map((item) => item.filename), expectedNames);

const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
const loadedZip = await JSZip.loadAsync(zipBuffer);
assert.deepEqual(Object.keys(loadedZip.files).sort(), expectedNames.toSorted());

for (const generatedReport of generated) {
  const fileBuffer = await loadedZip.file(generatedReport.filename).async("nodebuffer");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  const worksheet = workbook.worksheets[0];

  assert.equal(worksheet.getCell("C7").value, PROJECT.name);
  assert.equal(worksheet.getCell("C8").value, PROJECT.regNumber);
  assert.equal(worksheet.getCell("C9").value, EMPLOYEE.name);
  assert.equal(worksheet.getCell("C10").value, generatedReport.role.positionName);
  assert.equal(worksheet.getCell("C11").value, generatedReport.role.budgetCode);
  assert.equal(worksheet.getCell("G11").value, generatedReport.role.fte);
  assert.equal(worksheet.getCell("G28").value, generatedReport.workedHours);
  assert.equal(worksheet.getCell("G40").value, generatedReport.metrics.maxHoursForRole);
  assert.match(worksheet.headerFooter.oddFooter, new RegExp(generatedReport.reportId));
  assert.doesNotMatch(worksheet.headerFooter.oddFooter, /schváleno k podpisu/);
}

const approvedReport = await buildWorkbookBuffer({
  templateBuffer,
  project: PROJECT,
  employee: EMPLOYEE,
  role: {
    ...ROLES[0],
    status: "approved",
    approvedByName: "Vedoucí služby/programu test",
    approvedAt: "2026-06-02T08:00:00.000Z",
  },
  period,
  absences,
  totalFte,
  activities: distributeActivitiesByWeights(ROLES[0].activities.map((desc) => ({ desc, hours: 0 })), 33.6),
  reportId: "WR-APPROVED",
});
const approvedWorkbook = new ExcelJS.Workbook();
await approvedWorkbook.xlsx.load(approvedReport.buffer);
assert.match(approvedWorkbook.worksheets[0].headerFooter.oddFooter, /Zkontrolováno a schváleno k podpisu/);
assert.match(approvedWorkbook.worksheets[0].headerFooter.oddFooter, /Vedoucí služby\/programu test/);

console.log("exportZip tests passed");
