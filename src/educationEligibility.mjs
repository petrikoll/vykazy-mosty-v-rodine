import { POSITIONS } from "./projectConfig.mjs";

// Eligibility belongs to an assigned project position, not to the person's name.
const DIRECT_WORK_POSITIONS = new Set(["expert-guarantor", "social-worker", "psychologist", "mediator", "case-manager"]);
export function isEducationEligible(employee, positions = POSITIONS) {
  if (!employee || employee.active === false || employee.appRole === "project_manager") return false;
  return (employee.assignments || []).some(assignment => {
    const position = positions.find(item => item.id === assignment.positionId);
    return assignment.active !== false && position?.active !== false
      && DIRECT_WORK_POSITIONS.has(position?.id)
      && ["PS", "HPP"].includes(assignment.contractType ?? position.contractType)
      && Number(assignment.fte ?? position.fte ?? 0) > 0;
  });
}
