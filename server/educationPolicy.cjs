function canManageEducationPlan(actor, target) {
  if (!actor || !target || target.active === false) return false;
  if (actor.appRole === "director") return target.appRole !== "project_manager";
  if (actor.appRole === "project_manager") {
    return !["manager", "project_manager"].includes(target.appRole);
  }
  if (actor.appRole !== "manager") return false;
  return target.appRole === "worker" || target.id === actor.id;
}

function allowedEducationPlanStatuses(actor, target) {
  if (!canManageEducationPlan(actor, target)) return new Set();
  if (actor.appRole === "manager" && target.id === actor.id) {
    return new Set(["draft", "submitted"]);
  }
  return new Set(["draft", "approved"]);
}

module.exports = { allowedEducationPlanStatuses, canManageEducationPlan };
