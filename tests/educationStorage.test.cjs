const assert = require("node:assert/strict");
const { migrateData } = require("../server/storage.cjs");

const legacy = {
  educationPlans: [{ id: "plan-1", employeeId: "employee-1", year: 2026, plannedActivities: [{ title: "Kurz facilitace" }, "Seminář"] }],
  employeeEvaluations: [{ id: "evaluation-1", employeeId: "employee-1", year: 2026, professionalGoals: ["Zlepšit krizovou intervenci"] }],
};
const first = migrateData(legacy);
const second = migrateData(first);

assert.equal(first.schemaVersion, 6, "push subscriptions use schema version 6");
assert.deepEqual(first.pushSubscriptions, [], "legacy data receives an empty push subscription collection");
assert.equal(first.educationPlans[0].plannedActivities[0].id, "EDA-plan-1-1", "legacy activity receives a deterministic id");
assert.equal(first.educationPlans[0].plannedActivities[1].topic, "Seminář", "legacy string activity is normalized");
assert.deepEqual(second.educationPlans[0].plannedActivities, first.educationPlans[0].plannedActivities, "activity ids stay stable on repeated reads");
assert.equal(first.employeeEvaluations[0].professionalGoals[0].text, "Zlepšit krizovou intervenci", "legacy goal text is normalized");
assert.deepEqual(second.employeeEvaluations, first.employeeEvaluations, "evaluation goal ids stay stable on repeated reads");

console.log("education storage tests passed");
