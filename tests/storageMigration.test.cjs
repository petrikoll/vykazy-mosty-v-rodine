const assert = require("node:assert/strict");
const { migrateData } = require("../server/storage.cjs");

const migrated = migrateData({
  schemaVersion: 6,
  employees: [
    { id: "petr", name: "Petr Laštovica", appRole: "project_manager", active: true, assignments: [] },
  ],
  meetings: [{
    id: "meeting",
    tasks: [
      { id: "surname", text: "Úkol podle příjmení", owner: "Laštovica", ownerId: "" },
      { id: "full-name", text: "Úkol podle celého jména", owner: "Petr Laštovica" },
      { text: "Starší úkol bez identifikátoru", owner: "Petr Laštovica" },
    ],
  }],
});

assert.equal(migrated.schemaVersion, 9, "schema is upgraded");
assert.deepEqual(migrated.methodologyAnswers, [], "legacy data receives methodology answer history");
assert.deepEqual(migrated.employees[0].assignments, [], "project manager remains without report assignments");
for (const task of migrated.meetings[0].tasks) {
  assert.equal(task.ownerId, "petr", "legacy external task is linked to the new employee account");
  assert.deepEqual(task.ownerIds, ["petr"], "legacy owner is also available in the multi-owner field");
  assert.equal(task.owner, "Petr Laštovica", "task stores the canonical employee name");
}
assert.equal(migrated.meetings[0].tasks[2].id, "TSK-meeting-3", "legacy meeting task receives a stable id");

console.log("storage migration tests passed");
