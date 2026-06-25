export const MAX_ACTIVITY_ROWS = 10;
export const HOURS_TOLERANCE = 0.001;

export const roundHours = (value) => Math.round(Number(value || 0) * 100) / 100;

export const createDefaultActivities = (role) => (role?.activities || []).map((desc) => ({ desc, hours: 0 }));

export const clampActivityRows = (activities) => (Array.isArray(activities) ? activities : []).slice(0, MAX_ACTIVITY_ROWS);

export const sumActivityHours = (activities) =>
  roundHours(clampActivityRows(activities).reduce((sum, activity) => sum + Number(activity.hours || 0), 0));

export const getHoursDiff = (actual, required) =>
  roundHours(Number(actual || 0) - Number(required || 0));

export const getActivityHoursStatus = (activities, requiredWorkedHours) => {
  const sumActivitiesHours = sumActivityHours(activities);
  const diff = getHoursDiff(sumActivitiesHours, requiredWorkedHours);

  return {
    requiredWorkedHours,
    sumActivitiesHours,
    diff,
    isBalanced: Math.abs(diff) <= HOURS_TOLERANCE,
    missingHours: diff < -HOURS_TOLERANCE ? Math.abs(diff) : 0,
    exceededHours: diff > HOURS_TOLERANCE ? diff : 0,
  };
};

export const balanceActivitiesToRequiredHours = (activities, requiredWorkedHours) => {
  const current = clampActivityRows(activities);
  if (current.length === 0) return current;

  const diffToAdd = roundHours(requiredWorkedHours - sumActivityHours(current));
  const lastIndex = current.length - 1;

  return current.map((activity, index) =>
    index === lastIndex
      ? { ...activity, hours: Math.max(0, roundHours(Number(activity.hours || 0) + diffToAdd)) }
      : { ...activity, hours: roundHours(activity.hours) }
  );
};

export const distributeActivitiesByWeights = (activities, requiredWorkedHours) => {
  const current = clampActivityRows(activities);
  if (current.length === 0) return current;

  const baseWeights = [0.52, 0.31, 0.17];
  const fallbackWeight = current.length > 0 ? 1 / current.length : 0;
  const rawWeights = current.map((_, index) => baseWeights[index] || fallbackWeight);
  const weightTotal = rawWeights.reduce((sum, weight) => sum + weight, 0) || 1;
  let allocated = 0;

  const distributed = current.map((activity, index) => {
    const isLast = index === current.length - 1;
    const hours = isLast
      ? Math.max(0, roundHours(requiredWorkedHours - allocated))
      : Math.max(0, roundHours((requiredWorkedHours * rawWeights[index]) / weightTotal));
    allocated = roundHours(allocated + hours);
    return { ...activity, hours };
  });

  return balanceActivitiesToRequiredHours(distributed, requiredWorkedHours);
};
