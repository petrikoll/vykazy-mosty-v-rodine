const assert = require("node:assert/strict");
const { allowedEducationPlanStatuses, canManageEducationPlan } = require("../server/educationPolicy.cjs");

const worker = { id: "worker", appRole: "worker", active: true };
const manager = { id: "manager", appRole: "manager", active: true };
const anotherManager = { id: "manager-2", appRole: "manager", active: true };
const director = { id: "director", appRole: "director", active: true };

assert.equal(canManageEducationPlan(manager, worker), true, "expert guarantor manages worker plans");
assert.equal(canManageEducationPlan(manager, manager), true, "expert guarantor prepares their own plan");
assert.equal(canManageEducationPlan(manager, anotherManager), false, "expert guarantor cannot manage another guarantor");
assert.equal(canManageEducationPlan(director, manager), true, "service manager manages guarantor plans");
assert.equal(canManageEducationPlan(worker, worker), false, "workers have read-only access");

assert.deepEqual([...allowedEducationPlanStatuses(manager, manager)], ["draft", "submitted"], "guarantor submits their own plan");
assert.deepEqual([...allowedEducationPlanStatuses(manager, worker)], ["draft", "approved"], "guarantor approves worker plan");
assert.deepEqual([...allowedEducationPlanStatuses(director, manager)], ["draft", "approved"], "service manager approves guarantor plan");

console.log("education plan policy tests passed");
