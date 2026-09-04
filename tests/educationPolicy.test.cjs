const assert = require("node:assert/strict");
const { allowedEducationPlanStatuses, canManageEducationPlan } = require("../server/educationPolicy.cjs");

const worker = { id: "worker", appRole: "worker", active: true };
const manager = { id: "manager", appRole: "manager", active: true };
const anotherManager = { id: "manager-2", appRole: "manager", active: true };
const director = { id: "director", appRole: "director", active: true };
const projectManager = { id: "project-manager", appRole: "project_manager", active: true };

assert.equal(canManageEducationPlan(manager, worker), true, "expert guarantor manages worker plans");
assert.equal(canManageEducationPlan(manager, manager), true, "expert guarantor prepares their own plan");
assert.equal(canManageEducationPlan(manager, anotherManager), false, "expert guarantor cannot manage another guarantor");
assert.equal(canManageEducationPlan(director, manager), true, "service manager manages guarantor plans");
assert.equal(canManageEducationPlan(projectManager, worker), true, "project manager may manage worker plans");
assert.equal(canManageEducationPlan(projectManager, director), true, "project manager may manage service manager plans");
assert.equal(canManageEducationPlan(projectManager, manager), false, "project manager cannot manage the guarantor plan");
assert.equal(canManageEducationPlan(projectManager, projectManager), false, "project manager has no own education plan");
assert.equal(canManageEducationPlan(worker, worker), false, "workers have read-only access");

assert.deepEqual([...allowedEducationPlanStatuses(manager, manager)], ["draft", "submitted"], "guarantor submits their own plan");
assert.deepEqual([...allowedEducationPlanStatuses(manager, worker)], ["draft", "approved"], "guarantor approves worker plan");
assert.deepEqual([...allowedEducationPlanStatuses(director, manager)], ["draft", "approved"], "service manager approves guarantor plan");
assert.deepEqual([...allowedEducationPlanStatuses(projectManager, worker)], ["draft", "approved"], "project manager approves worker plans");
assert.deepEqual([...allowedEducationPlanStatuses(projectManager, manager)], [], "project manager cannot approve the guarantor plan");

console.log("education plan policy tests passed");
