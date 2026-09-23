import assert from "node:assert/strict";
import fs from "node:fs";
import { isEducationEligible } from "../src/educationEligibility.mjs";
import { allowedEducationPlanStatuses } from "../server/educationPolicy.cjs";
import { leaderOnly } from "../server/auth.cjs";

const person = (positionId, overrides = {}, appRole = "worker") => ({ id: "test", appRole, active: true, assignments: [{ positionId, ...overrides }] });
for (const position of ["social-worker", "psychologist", "mediator", "case-manager", "expert-guarantor"]) {
  assert.equal(isEducationEligible(person(position)), true, position);
  assert.equal(isEducationEligible(person(position, { contractType: "DPP" })), false);
  assert.equal(isEducationEligible(person(position, { contractType: "DPČ" })), false);
  assert.equal(isEducationEligible(person(position, { active: false })), false);
  assert.equal(isEducationEligible(person(position, { fte: 0 })), false);
}
for (const position of ["service-manager", "peer-consultant", "facilitator", "lawyer", "therapist", "unknown"]) {
  assert.equal(isEducationEligible(person(position)), false, position);
}
assert.equal(isEducationEligible({ ...person("social-worker"), active: false }), false);
assert.equal(isEducationEligible(person("social-worker", {}, "project_manager")), false);
assert.equal(isEducationEligible({ ...person("peer-consultant"), assignments: [{ positionId: "peer-consultant" }, { positionId: "social-worker" }] }), true, "one eligible assignment is sufficient");
const manager = person("expert-guarantor", {}, "manager");
assert.deepEqual([...allowedEducationPlanStatuses(manager, manager)], ["draft", "submitted"], "deletion/settings access does not grant self approval");
let permitted = false;
leaderOnly({ auth: { employee: manager } }, {}, () => { permitted = true; });
assert.equal(permitted, true);
const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
for (const resource of ["employees", "work-reports", "education-records", "education-plans", "employee-evaluations", "supervisions"]) {
  assert.ok(server.includes(`app.delete("/api/${resource}/:id", requireAuth, leaderOnly,`), `${resource} deletion permits guarantor and still requires authentication`);
}
assert.ok(server.includes('app.delete("/api/meetings/:id", requireAuth, meetingManagerOnly,'), "only the guarantor or service manager may delete meetings");
assert.ok(server.includes('app.post("/api/employees", requireAuth, leaderOnly,'));
assert.ok(server.includes('app.patch("/api/employees/:id", requireAuth, leaderOnly,'));
assert.equal((server.match(/isEducationEligible\(employee\)\) \{/g) || []).length, 3, "plan, education and linking endpoints enforce eligibility");
console.log("Education eligibility and guarantor management access tests passed");
