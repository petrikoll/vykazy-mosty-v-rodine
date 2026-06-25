import assert from "node:assert/strict";
import {
  calculateRoleMetrics,
  calculateTotalMetrics,
  getHolidaysCountForMonth,
  getWorkingDays,
  isPeerRole,
} from "../src/workReportRules.mjs";

const approx = (actual, expected, label) => {
  assert.ok(Math.abs(actual - expected) < 0.0001, `${label}: expected ${expected}, got ${actual}`);
};

const absences = {
  vacation: 1,
  sickLeave: 0.5,
  otherObstacles: 2,
  otherObstaclesUnit: "hours",
  doctorVisitHours: 4,
  holiday: 2,
};

assert.equal(getWorkingDays(5, 2026), 21, "May 2026 has 21 weekdays");
assert.equal(getHolidaysCountForMonth(5, 2026), 2, "May 2026 has two Czech fixed holidays on weekdays");
assert.equal(isPeerRole({ name: "Peer konzultant" }), false, "peer role branching is disabled in the Sulkova generator");

const quarterRoleMetrics = calculateRoleMetrics({
  role: { id: "role-1", positionId: "pos-1", fte: 0.25 },
  positionDef: { id: "pos-1", name: "Pracovní poradce" },
  month: 5,
  year: 2026,
  absences,
  totalFte: 1,
});

approx(quarterRoleMetrics.totalFundHours, 168, "monthly fund");
approx(quarterRoleMetrics.maxHoursForRole, 42, "0.25 role fund");
approx(quarterRoleMetrics.absHours.vacation, 2, "vacation days converted by FTE");
approx(quarterRoleMetrics.absHours.sickLeave, 1, "sick leave days converted by FTE");
approx(quarterRoleMetrics.absHours.otherObstacles, 0.5, "hour-based obstacles distributed by FTE share");
approx(quarterRoleMetrics.absHours.doctorVisit, 1, "doctor visit distributed by FTE share");
approx(quarterRoleMetrics.absHours.holiday, 4, "paid holidays converted by FTE");
approx(quarterRoleMetrics.totalAbsenceHours, 8.5, "quarter role absence total");

const halfRoleMetrics = calculateRoleMetrics({
  role: { id: "role-3", positionId: "pos-3", fte: 0.5 },
  positionDef: { id: "pos-3", name: "Dluhový poradce - putovní poradna" },
  month: 5,
  year: 2026,
  absences,
  totalFte: 1,
});

approx(halfRoleMetrics.maxHoursForRole, 84, "0.5 role fund");
approx(halfRoleMetrics.absHours.otherObstacles, 1, "half role gets half of hour-based obstacles");
approx(halfRoleMetrics.absHours.doctorVisit, 2, "half role gets half of doctor visit");

const totalMetrics = calculateTotalMetrics({
  roles: [
    { id: "role-1", positionId: "pos-1", fte: 0.25 },
    { id: "role-2", positionId: "pos-2", fte: 0.25 },
    { id: "role-3", positionId: "pos-3", fte: 0.5 },
  ],
  positions: [
    { id: "pos-1", name: "Pracovní poradce" },
    { id: "pos-2", name: "Dluhový poradce" },
    { id: "pos-3", name: "Dluhový poradce - putovní poradna" },
  ],
  month: 5,
  year: 2026,
  absences,
  activities: [
    { desc: "A", hours: 10 },
    { desc: "B", hours: 20 },
    { desc: "C", hours: 30 },
  ],
  totalFte: 1,
});

approx(totalMetrics.maxHoursForFte, 168, "0.25 + 0.25 + 0.5 = 1.0 total fund");
approx(totalMetrics.totalWorkedHours, 60, "worked hours total");
approx(totalMetrics.absHours.vacation, 8, "combined vacation");
approx(totalMetrics.absHours.sickLeave, 4, "combined sick leave");
approx(totalMetrics.absHours.otherObstacles, 2, "hour-based obstacles are not duplicated");
approx(totalMetrics.absHours.doctorVisit, 4, "doctor visit is not duplicated");
approx(totalMetrics.absHours.holiday, 16, "combined holidays");
approx(totalMetrics.totalAbsenceHours, 34, "combined absence total");
approx(totalMetrics.totalOverallHours, 94, "combined overall total");

console.log("workReportRules tests passed");
