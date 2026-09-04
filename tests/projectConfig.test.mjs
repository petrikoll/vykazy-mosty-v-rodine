import assert from "node:assert/strict";
import { POSITIONS, PROJECT } from "../src/projectConfig.mjs";
import { calculateRoleMetrics } from "../src/workReportRules.mjs";

const byId = Object.fromEntries(POSITIONS.map((position) => [position.id, position]));

assert.equal(PROJECT.regNumber, "CZ.03.02.02/00/25_104/0006461");
assert.equal(PROJECT.durationMonths, 28);
assert.equal(POSITIONS.length, 17, "active, inactive and flat-rate project roles are registered");

assert.equal(byId["psychologist"].fte, 1);
assert.equal(byId["social-worker"].fte, 0.8);
assert.equal(byId["mediator"].fte, 0.5);
assert.equal(byId["case-manager"].fte, 0.3);
assert.equal(byId["therapist"].monthlyHours, 12);
assert.equal(byId["lawyer"].monthlyHours, 5);
assert.equal(byId["peer-consultant"].monthlyHours, 32);
assert.equal(byId["facilitator"].monthlyHours, 7.5);
assert.equal(byId["lecturer"].monthlyHours, 3);
assert.equal(byId["expert-guarantor"].accessRole, "manager");
assert.equal(byId["service-manager"].accessRole, "director");

assert.deepEqual(byId["service-manager"].allocations, {
  KA1: 0.05,
  KA2: 0.1,
  KA3: 0.03,
  KA4: 0.01,
  KA5: 0.01,
});
assert.ok(
  Math.abs(
    Object.values(byId["service-manager"].allocations).reduce((sum, value) => sum + value, 0) - 0.2
  ) < 0.000001
);

assert.equal(byId["ka-cs-coordinator"].active, false);
assert.equal(byId["psychologist-hourly"].active, false);
assert.equal(byId["evaluator"].reportRequired, false);
assert.equal(byId["supervisor"].reportRequired, false);

const hourlyMetrics = calculateRoleMetrics({
  role: byId.therapist,
  positionDef: byId.therapist,
  month: 5,
  year: 2026,
  absences: { vacation: 2, sickLeave: 1, holiday: 2 },
  totalFte: 1,
});
assert.equal(hourlyMetrics.maxHoursForRole, 12);
assert.equal(hourlyMetrics.totalAbsenceHours, 0);
assert.ok(Math.abs(hourlyMetrics.roleFte - 12 / 168) < 0.000001);

console.log("projectConfig tests passed");
