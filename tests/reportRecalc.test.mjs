import assert from "node:assert/strict";
import { sumActivityHours } from "../src/activityUtils.mjs";
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

console.log("report recalculation tests passed");
