import { calculateRoleMetrics } from "./workReportRules.mjs";
import { balanceActivitiesToRequiredHours, clampActivityRows, createDefaultActivities, distributeActivitiesByWeights, roundHours } from "./activityUtils.mjs";

const normalizeActivitiesForRole = ({ role, activitiesByRole, resetToDefaultText }) => {
  if (resetToDefaultText) {
    return createDefaultActivities(role);
  }

  const existing = clampActivityRows(activitiesByRole?.[role.id] || []);
  if (existing.length === 0) {
    return createDefaultActivities(role);
  }
  return existing.map((activity) => ({
    desc: activity?.desc ?? "",
    hours: Number(activity?.hours || 0),
  }));
};

export const recalculateAllReportActivities = ({
  roles,
  period,
  absences,
  totalFte,
  activitiesByRole,
  resetToDefaultText = false,
}) => {
  const next = {};

  for (const role of roles) {
    const roleMetrics = calculateRoleMetrics({
      role,
      positionDef: { id: role.positionId, name: role.positionName },
      month: period.month,
      year: period.year,
      absences,
      totalFte,
    });
    const requiredWorkedHours = roundHours(roleMetrics.maxHoursForRole - roleMetrics.totalAbsenceHours);
    const baseActivities = normalizeActivitiesForRole({ role, activitiesByRole, resetToDefaultText });
    const distributed = distributeActivitiesByWeights(baseActivities, requiredWorkedHours);
    next[role.id] = balanceActivitiesToRequiredHours(distributed, requiredWorkedHours);
  }

  return next;
};
