import assert from "node:assert/strict";
import { getActivityHoursStatus, sumActivityHours } from "../src/activityUtils.mjs";
import { recalculateAllReportActivities } from "../src/reportRecalc.mjs";
import { calculateRoleMetrics } from "../src/workReportRules.mjs";

const role = {
  id: "assignment-1",
  positionId: "position-1",
  positionName: "Sociální pracovník",
  allocationType: "fte",
  fte: 1,
  activities: ["Práce s klienty", "Dokumentace", "Porady"],
};
const period = { month: 9, year: 2026 };
const absences = {
  vacation: 2,
  sickLeave: 0,
  otherObstacles: 0,
  otherObstaclesUnit: "days",
  doctorVisitHours: 0,
  holiday: 0,
};
const previousActivities = {
  [role.id]: role.activities.map((desc) => ({ desc, hours: 10 })),
};

const recalculated = recalculateAllReportActivities({
  roles: [role],
  period,
  absences,
  totalFte: 1,
  activitiesByRole: previousActivities,
});
const metrics = calculateRoleMetrics({ role, positionDef: role, ...period, absences, totalFte: 1 });
const expectedHours = metrics.maxHoursForRole - metrics.totalAbsenceHours;

assert.equal(sumActivityHours(recalculated[role.id]), expectedHours);
assert.deepEqual(recalculated[role.id].map((item) => item.desc), role.activities);

const hourlyRole = {
  id: "dpp-assignment", positionId: "facilitator", positionName: "Facilitátor",
  allocationType: "hours", monthlyHours: 5, activities: ["Facilitace"],
};
const hourlyActivities = [{ desc: "Facilitace", hours: 2.5 }];
const hourlyRecalculated = recalculateAllReportActivities({
  roles: [hourlyRole], period, absences, totalFte: 1,
  activitiesByRole: { [hourlyRole.id]: hourlyActivities },
});
assert.equal(sumActivityHours(hourlyRecalculated[hourlyRole.id]), 2.5, "absence changes must not fill an hourly role to its maximum");
assert.equal(getActivityHoursStatus(hourlyActivities, 5, { maxOnly: true }).isBalanced, true);
assert.equal(getActivityHoursStatus([{ desc: "Facilitace", hours: 5.01 }], 5, { maxOnly: true }).isBalanced, false);
assert.equal(getActivityHoursStatus([{ desc: "Facilitace", hours: 0 }], 5, { maxOnly: true }).isBalanced, false);

console.log("report recalculation tests passed");
