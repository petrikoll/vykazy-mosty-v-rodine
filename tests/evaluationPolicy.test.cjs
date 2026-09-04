const assert = require("node:assert/strict");
const { canManageEmployeeEvaluation, canViewEmployeeEvaluation } = require("../server/evaluationPolicy.cjs");

const director = { id: "director", appRole: "director", active: true };
const manager = { id: "manager", appRole: "manager", active: true };
const anotherManager = { id: "manager-2", appRole: "manager", active: true };
const worker = { id: "worker", appRole: "worker", active: true };
const projectManager = { id: "project-manager", appRole: "project_manager", active: true };

assert.equal(canManageEmployeeEvaluation(manager, worker), true, "expert guarantor evaluates workers");
assert.equal(canManageEmployeeEvaluation(manager, manager), false, "expert guarantor cannot evaluate themself");
assert.equal(canManageEmployeeEvaluation(director, manager), true, "service manager evaluates expert guarantor");
assert.equal(canManageEmployeeEvaluation(director, worker), false, "service manager does not replace the worker evaluator");
assert.equal(canManageEmployeeEvaluation(director, director), false, "service manager does not self-evaluate");
assert.equal(canManageEmployeeEvaluation(projectManager, manager), false, "project manager cannot evaluate the expert guarantor");
assert.equal(canManageEmployeeEvaluation(projectManager, worker), false, "project manager does not replace the worker evaluator");
assert.equal(canViewEmployeeEvaluation(worker, worker), true, "worker sees their own evaluation");
assert.equal(canViewEmployeeEvaluation(manager, worker), true, "expert guarantor sees worker evaluations");
assert.equal(canViewEmployeeEvaluation(manager, anotherManager), false, "expert guarantor does not see another guarantor evaluation");
assert.equal(canViewEmployeeEvaluation(director, worker), true, "service manager sees evaluation status and detail across the team");
assert.equal(canViewEmployeeEvaluation(projectManager, manager), true, "project manager can view the guarantor evaluation");
assert.equal(canViewEmployeeEvaluation(projectManager, worker), true, "project manager can view team evaluations");
assert.equal(canViewEmployeeEvaluation(projectManager, projectManager), false, "project manager has no own evaluation");

console.log("employee evaluation policy tests passed");
