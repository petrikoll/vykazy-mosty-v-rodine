export const getWorkingDays = (month, year) => {
  let days = 0;
  const date = new Date(year, month - 1, 1);
  while (date.getMonth() === month - 1) {
    if (date.getDay() !== 0 && date.getDay() !== 6) days += 1;
    date.setDate(date.getDate() + 1);
  }
  return days;
};

export const getHolidaysCountForMonth = (month, year) => {
  const fixedHolidays = ["1-1", "5-1", "5-8", "7-5", "7-6", "9-28", "10-28", "11-17", "12-24", "12-25", "12-26"];
  const easterHolidays = { 2026: ["4-3", "4-6"], 2027: ["3-26", "3-29"], 2028: ["4-14", "4-17"] };
  let count = 0;

  fixedHolidays.forEach((dateStr) => {
    const [holidayMonth, day] = dateStr.split("-");
    const date = new Date(year, month - 1, Number(day));
    if (Number(holidayMonth) === month && date.getDay() !== 0 && date.getDay() !== 6) count += 1;
  });

  easterHolidays[year]?.forEach((dateStr) => {
    const [holidayMonth, day] = dateStr.split("-");
    const date = new Date(year, month - 1, Number(day));
    if (Number(holidayMonth) === month && date.getDay() !== 0 && date.getDay() !== 6) count += 1;
  });

  return count;
};

export const isPeerRole = () => false;

export const calculateRoleMetrics = ({ role, positionDef, month, year, absences, totalFte }) => {
  const workingDays = getWorkingDays(month, year);
  const totalFundHours = workingDays * 8;
  const roleFte = Number(role?.fte || 0);
  const roleIsPeer = isPeerRole(positionDef);
  const maxHoursForRole = totalFundHours * roleFte;
  const fteShare = Number(totalFte || 0) > 0 ? roleFte / Number(totalFte || 0) : 0;
  const absHours = {
    vacation: Number(absences.vacation || 0) * 8 * roleFte,
    sickLeave: Number(absences.sickLeave || 0) * 8 * roleFte,
    otherObstacles:
      absences.otherObstaclesUnit === "hours"
        ? Number(absences.otherObstacles || 0) * fteShare
        : Number(absences.otherObstacles || 0) * 8 * roleFte,
    doctorVisit: Number(absences.doctorVisitHours || 0) * fteShare,
    holiday: Number(absences.holiday || 0) * 8 * roleFte,
  };
  const totalAbsenceHours = absHours.vacation + absHours.sickLeave + absHours.otherObstacles + absHours.doctorVisit + absHours.holiday;
  return { workingDays, totalFundHours, roleFte, roleIsPeer, maxHoursForRole, absHours, totalAbsenceHours };
};

export const calculateTotalMetrics = ({ roles, positions, month, year, absences, activities, totalFte }) => {
  const workingDays = getWorkingDays(month, year);
  const totalFundHours = workingDays * 8;
  const totalWorkedHours = activities.reduce((sum, activity) => sum + Number(activity.hours || 0), 0);
  let maxHoursForFte = 0;
  let absHours = { vacation: 0, sickLeave: 0, otherObstacles: 0, doctorVisit: 0, holiday: 0 };
  const effectiveTotalFte = Number(totalFte || 0) || roles.reduce((sum, role) => sum + Number(role?.fte || 0), 0);

  for (const role of roles) {
    const positionDef = positions.find((position) => position.id === role.positionId);
    const roleMetrics = calculateRoleMetrics({ role, positionDef, month, year, absences, totalFte: effectiveTotalFte });
    maxHoursForFte += roleMetrics.maxHoursForRole;
    absHours = {
      vacation: absHours.vacation + roleMetrics.absHours.vacation,
      sickLeave: absHours.sickLeave + roleMetrics.absHours.sickLeave,
      otherObstacles: absHours.otherObstacles + roleMetrics.absHours.otherObstacles,
      doctorVisit: absHours.doctorVisit + roleMetrics.absHours.doctorVisit,
      holiday: absHours.holiday + roleMetrics.absHours.holiday,
    };
  }

  const totalAbsenceHours = absHours.vacation + absHours.sickLeave + absHours.otherObstacles + absHours.doctorVisit + absHours.holiday;
  return {
    workingDays,
    totalFundHours,
    maxHoursForFte,
    totalWorkedHours,
    totalAbsenceHours,
    totalOverallHours: totalWorkedHours + totalAbsenceHours,
    absHours,
  };
};
