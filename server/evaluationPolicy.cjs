function canManageEmployeeEvaluation(actor, target) {
  if (!actor || !target || target.active === false || target.appRole === "director") return false;
  if (actor.appRole === "director") return target.appRole === "manager";
  if (actor.appRole === "manager") return target.appRole === "worker";
  return false;
}

function canViewEmployeeEvaluation(actor, target) {
  if (!actor || !target) return false;
  if (actor.id === target.id) return true;
  if (actor.appRole === "director") return target.appRole !== "director";
  return actor.appRole === "manager" && target.appRole === "worker";
}

module.exports = { canManageEmployeeEvaluation, canViewEmployeeEvaluation };
