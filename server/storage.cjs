const fs = require("node:fs/promises");
const path = require("node:path");

const DB_PATH = process.env.APP_DB_PATH
  ? path.resolve(process.env.APP_DB_PATH)
  : path.join(__dirname, "..", "data", "app-db.json");
const BACKUP_PATH = `${DB_PATH}.backup.json`;

const EMPTY_DATA = {
  schemaVersion: 6,
  employees: [],
  workReports: [],
  employeeEvaluations: [],
  educationPlans: [],
  educationRecords: [],
  supervisions: [],
  meetings: [],
  pushSubscriptions: [],
  auditLog: [],
};

let mutationQueue = Promise.resolve();

function migrateData(data) {
  const source = data && typeof data === "object" ? data : {};
  const employees = Array.isArray(source.employees) ? source.employees.map((employee) => {
    const assignments = Array.isArray(employee.assignments) ? employee.assignments : [];
    if (employee.appRole === "manager") {
      const migrated = assignments.map((assignment) => assignment.positionId === "service-manager"
        ? { ...assignment, positionId: "expert-guarantor" }
        : assignment);
      return { ...employee, assignments: migrated };
    }
    if (employee.appRole === "director" && !assignments.some((assignment) => assignment.positionId === "service-manager")) {
      return {
        ...employee,
        globalFte: Number(employee.globalFte || 0) || 0.2,
        assignments: [...assignments, { id: `ASG-${employee.id}-service-manager`, positionId: "service-manager" }],
      };
    }
    return { ...employee, assignments };
  }) : [];
  const educationPlans = Array.isArray(source.educationPlans) ? source.educationPlans.map((plan, planIndex) => ({
    ...plan,
    plannedActivities: Array.isArray(plan.plannedActivities) ? plan.plannedActivities.map((activity, activityIndex) => ({
      ...(typeof activity === "string" ? { title: activity, topic: activity } : activity),
      id: activity?.id || `EDA-${String(plan.id || `legacy-${planIndex}`).replace(/[^a-zA-Z0-9-]/g, "")}-${activityIndex + 1}`,
    })) : [],
  })) : [];
  const employeeEvaluations = Array.isArray(source.employeeEvaluations) ? source.employeeEvaluations.map((evaluation, evaluationIndex) => ({
    ...evaluation,
    professionalGoals: Array.isArray(evaluation.professionalGoals) ? evaluation.professionalGoals.map((goal, goalIndex) => ({
      ...(typeof goal === "string" ? { text: goal } : goal),
      id: goal?.id || `EVG-${String(evaluation.id || `legacy-${evaluationIndex}`).replace(/[^a-zA-Z0-9-]/g, "")}-${goalIndex + 1}`,
      text: typeof goal === "string" ? goal : goal?.text || "",
      successCriterion: typeof goal === "string" ? "" : goal?.successCriterion || "",
    })) : [],
  })) : [];
  return {
    schemaVersion: 6,
    employees,
    workReports: Array.isArray(source.workReports) ? source.workReports : [],
    employeeEvaluations,
    educationPlans,
    educationRecords: Array.isArray(source.educationRecords) ? source.educationRecords : [],
    supervisions: Array.isArray(source.supervisions) ? source.supervisions : [],
    meetings: Array.isArray(source.meetings) ? source.meetings : [],
    pushSubscriptions: Array.isArray(source.pushSubscriptions) ? source.pushSubscriptions : [],
    auditLog: Array.isArray(source.auditLog) ? source.auditLog.slice(-5000) : [],
  };
}

async function ensureDbFile() {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, JSON.stringify(EMPTY_DATA, null, 2), "utf8");
  }
}

async function readDb() {
  await ensureDbFile();
  const raw = await fs.readFile(DB_PATH, "utf8");
  return migrateData(JSON.parse(raw));
}

async function writeDb(data) {
  await ensureDbFile();
  const normalized = migrateData(data);
  try {
    await fs.copyFile(DB_PATH, BACKUP_PATH);
  } catch {
    // První zápis ještě nemá co zálohovat.
  }
  const temporaryPath = `${DB_PATH}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(normalized, null, 2), "utf8");
  await fs.rename(temporaryPath, DB_PATH);
  return normalized;
}

async function mutateDb(mutator) {
  const operation = mutationQueue.then(async () => {
    const current = await readDb();
    const result = await mutator(current);
    const nextData = result?.data || current;
    await writeDb(nextData);
    return result?.value;
  });
  mutationQueue = operation.catch(() => undefined);
  return operation;
}

module.exports = { DB_PATH, readDb, writeDb, mutateDb, migrateData };
