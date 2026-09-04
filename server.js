require("dotenv").config();

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const express = require("express");
const multer = require("multer");
const webPush = require("web-push");

const { DB_PATH, mutateDb, readDb, refreshDb, configurePrimaryStore } = require("./server/storage.cjs");
const {
  authMiddleware,
  bearerToken,
  createSession,
  deleteSession,
  hashPin,
  isAdminRole,
  isLeaderRole,
  directorOnly,
  leaderOnly,
  publicEmployee,
  verifyPin,
} = require("./server/auth.cjs");
const googleWorkspace = require("./server/googleWorkspace.cjs");
if (process.env.GOOGLE_SHEETS_PRIMARY === "true") {
  configurePrimaryStore({ load: googleWorkspace.loadDatabaseSnapshot, commit: googleWorkspace.commitDatabaseChanges });
}
const { allowedEducationPlanStatuses, canManageEducationPlan } = require("./server/educationPolicy.cjs");
const { canManageEmployeeEvaluation, canViewEmployeeEvaluation } = require("./server/evaluationPolicy.cjs");
const { fileHash, findDuplicateByFileHash } = require("./server/fileDeduplication.cjs");
const { createMethodologyAnswer } = require("./server/methodologyPolicy.cjs");
const {
  analyzeBundles,
  mergeMappedCandidates,
  removeImport,
} = require("./server/signedReportImport.cjs");

const app = express();
const PORT = Number(process.env.PORT || 3001);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
});
const signedReportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 50 },
});
const requireAuth = authMiddleware(readDb);
let configPromise = null;
let rulesPromise = null;
let timeRangePromise = null;
const loginAttempts = new Map();
let pushConfigured = false;
let pushPublicKey = "";

function deriveVapidKeys(secret) {
  const order = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
  const seed = crypto.createHash("sha256").update(`mosty-v-rodine:web-push:${secret}`).digest("hex");
  const scalar = (BigInt(`0x${seed}`) % (order - 1n)) + 1n;
  const privateKey = Buffer.from(scalar.toString(16).padStart(64, "0"), "hex");
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.setPrivateKey(privateKey);
  return {
    publicKey: ecdh.getPublicKey().toString("base64url"),
    privateKey: privateKey.toString("base64url"),
  };
}

try {
  const derivedKeySecret = process.env.APP_SETUP_TOKEN
    || process.env.GOOGLE_SERVICE_ACCOUNT_BASE64
    || process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const keys = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
    ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
    : derivedKeySecret
      ? deriveVapidKeys(derivedKeySecret)
      : null;
  if (keys) {
    webPush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:emceckovm@gmail.com",
      keys.publicKey,
      keys.privateKey,
    );
    pushPublicKey = keys.publicKey;
    pushConfigured = true;
  }
} catch (error) {
  console.error("Web push configuration is invalid:", error.message);
}

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "8mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  next();
});

const now = () => new Date().toISOString();
const makeId = (prefix) => `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
const normalizeText = (value, maxLength = 10000) => String(value || "").trim().slice(0, maxLength);
const nonnegativeNumber = (value, fallback = 0) => {
  const parsed = value === undefined || value === null || value === "" ? Number(fallback) : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Číselná hodnota musí být nezáporná a konečná.");
  return parsed;
};
const safeName = (value) => normalizeText(value, 150).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_") || "soubor";
const slugify = (value) =>
  normalizeText(value, 100)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const exportName = (value) =>
  normalizeText(value, 100)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

function normalizeMeetingTasks(db, tasks, externalParticipantNames = [], existingTasks = []) {
  if (!Array.isArray(tasks)) return [];
  return tasks.slice(0, 100).map((task) => {
    const text = normalizeText(task?.text, 1000);
    if (!text) return null;
    const requestedOwnerIds = [...new Set([
      ...(Array.isArray(task?.ownerIds) ? task.ownerIds : []),
      task?.ownerId,
    ].map((id) => normalizeText(id, 100)).filter(Boolean))];
    let owners = db.employees.filter((employee) => employee.active !== false && requestedOwnerIds.includes(employee.id));
    if (requestedOwnerIds.length && owners.length !== requestedOwnerIds.length) throw new Error(`Úkol „${text}“ obsahuje neplatnou odpovědnou osobu.`);
    if (!owners.length && task?.owner) {
      const requestedName = slugify(task.owner).replace(/^(mgr|bc|ing|arch|phdr|mudr|judr|rndr|doc|prof)-/, "");
      const matches = db.employees.filter((employee) => {
        const employeeName = slugify(employee.name).replace(/^(mgr|bc|ing|arch|phdr|mudr|judr|rndr|doc|prof)-/, "");
        return employee.active !== false && (employeeName === requestedName || employeeName.endsWith(`-${requestedName}`) || requestedName.endsWith(`-${employeeName}`));
      });
      if (matches.length === 1) owners = matches;
    }
    const requestedExternalOwners = Array.isArray(task?.externalOwnerNames)
      ? task.externalOwnerNames.map((name) => normalizeText(name, 120)).filter(Boolean)
      : [];
    let externalOwners = externalParticipantNames.filter((name) => requestedExternalOwners.some((requested) => slugify(requested) === slugify(name)));
    if (requestedExternalOwners.length && externalOwners.length !== [...new Set(requestedExternalOwners.map(slugify))].length) {
      throw new Error(`Úkol „${text}“ obsahuje osobu, která není mezi účastníky porady.`);
    }
    if (!owners.length && !externalOwners.length && task?.owner) {
      const requestedName = slugify(task.owner).replace(/^(mgr|bc|ing|arch|phdr|mudr|judr|rndr|doc|prof)-/, "");
      const matches = externalParticipantNames.filter((name) => {
        const externalName = slugify(name).replace(/^(mgr|bc|ing|arch|phdr|mudr|judr|rndr|doc|prof)-/, "");
        return externalName === requestedName || externalName.endsWith(`-${requestedName}`) || requestedName.endsWith(`-${externalName}`);
      });
      if (matches.length === 1) externalOwners = matches;
    }
    const deadline = normalizeText(task?.deadline, 20);
    if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) throw new Error(`Termín úkolu „${text}“ nemá platný formát.`);
    const id = normalizeText(task?.id, 100) || makeId("TSK");
    const existing = existingTasks.find((item) => item.id === id);
    return {
      id,
      text,
      ownerIds: owners.map((owner) => owner.id),
      ownerNames: owners.map((owner) => owner.name),
      externalOwnerNames: externalOwners,
      ownerId: owners[0]?.id || "",
      owner: [...owners.map((owner) => owner.name), ...externalOwners].join(", "),
      deadline,
      ...(existing?.status === "completed" ? {
        status: "completed",
        completionText: existing.completionText || "",
        completionRecipientIds: existing.completionRecipientIds || [],
        completionRecipientNames: existing.completionRecipientNames || [],
        completedAt: existing.completedAt || "",
        completedBy: existing.completedBy || "",
        completedByName: existing.completedByName || "",
      } : {}),
    };
  }).filter(Boolean);
}

function meetingTaskIdentity(value) {
  return normalizeText(value, 1000)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function meetingTaskEntries(db, { beforeDate = "", excludeMeetingId = "", includeCompleted = false } = {}) {
  return db.meetings
    .filter((meeting) => meeting.id !== excludeMeetingId && meeting.status !== "draft" && (!beforeDate || !meeting.date || meeting.date <= beforeDate))
    .toSorted((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .flatMap((meeting) => (meeting.tasks || []).map((task) => ({ meeting, task })))
    .filter(({ task }) => includeCompleted || task.status !== "completed");
}

function findMeetingTaskEntry(db, task, { beforeDate = "", excludeMeetingId = "", sourceMeetingId = "", includeCompleted = false } = {}) {
  const entries = meetingTaskEntries(db, { beforeDate, excludeMeetingId, includeCompleted });
  const taskId = normalizeText(task?.id, 100);
  if (sourceMeetingId && taskId) {
    const exactReference = entries.find((entry) => entry.meeting.id === sourceMeetingId && entry.task.id === taskId);
    if (exactReference) return exactReference;
  }
  if (taskId) {
    const exactId = entries.find((entry) => entry.task.id === taskId);
    if (exactId) return exactId;
  }
  const identity = meetingTaskIdentity(task?.text);
  return identity ? entries.find((entry) => meetingTaskIdentity(entry.task.text) === identity) || null : null;
}

function mergeMeetingTaskInputs(original, update, { explicit = false } = {}) {
  const ownerIds = explicit
    ? [...new Set([...(update?.ownerIds || []), update?.ownerId].filter(Boolean))]
    : [...new Set([...(original?.ownerIds || []), original?.ownerId, ...(update?.ownerIds || []), update?.ownerId].filter(Boolean))];
  const externalOwnerNames = explicit
    ? [...new Set(update?.externalOwnerNames || [])]
    : [...new Set([...(original?.externalOwnerNames || []), ...(update?.externalOwnerNames || [])])];
  return {
    ...original,
    ...update,
    id: original?.id || update?.id,
    text: normalizeText(update?.text, 1000) || original?.text || "",
    ownerIds,
    ownerId: ownerIds[0] || "",
    externalOwnerNames,
    deadline: normalizeText(update?.deadline, 20) || original?.deadline || "",
  };
}

function deduplicateMeetingTaskInputs(tasks = []) {
  const unique = [];
  const byIdentity = new Map();
  let mergedCount = 0;
  tasks.forEach((task) => {
    const identity = meetingTaskIdentity(task?.text);
    if (!identity) return;
    if (!byIdentity.has(identity)) {
      byIdentity.set(identity, unique.length);
      unique.push(task);
      return;
    }
    const index = byIdentity.get(identity);
    unique[index] = mergeMeetingTaskInputs(unique[index], task);
    mergedCount += 1;
  });
  return { tasks: unique, mergedCount };
}

function resolveMeetingFollowUpTasks(db, meeting) {
  return (meeting.followUpTaskRefs || []).map((reference) => {
    const sourceMeeting = db.meetings.find((item) => item.id === reference.meetingId);
    const task = (sourceMeeting?.tasks || []).find((item) => item.id === reference.taskId);
    return task ? { ...task, sourceMeetingId: sourceMeeting.id, sourceMeetingDate: sourceMeeting.date || reference.sourceMeetingDate || "" } : null;
  }).filter(Boolean);
}

function applyMeetingTaskContinuity(db, { currentMeeting = null, date = "", tasks = [], followUpTasks = [], externalParticipantNames = [] } = {}) {
  const currentTasks = currentMeeting?.tasks || [];
  const currentTaskIds = new Set(currentTasks.map((task) => task.id).filter(Boolean));
  const references = new Map();
  const affectedMeetings = new Map();
  let mergedCount = 0;
  const rememberReference = (entry) => {
    references.set(`${entry.meeting.id}:${entry.task.id}`, {
      meetingId: entry.meeting.id,
      taskId: entry.task.id,
      sourceMeetingDate: entry.meeting.date || "",
    });
  };
  const updateReferencedTask = (entry, rawTask, explicit) => {
    const merged = mergeMeetingTaskInputs(entry.task, rawTask, { explicit });
    const allowedExternalOwners = [...new Set([...externalParticipantNames, ...(entry.task.externalOwnerNames || [])])];
    const normalized = normalizeMeetingTasks(db, [merged], allowedExternalOwners, [entry.task])[0];
    if (!normalized) return;
    const taskState = (task) => JSON.stringify({
      text: task.text || "",
      ownerIds: [...(task.ownerIds || [])].sort(),
      externalOwnerNames: [...(task.externalOwnerNames || [])].sort(),
      deadline: task.deadline || "",
    });
    if (taskState(entry.task) === taskState(normalized)) return;
    Object.assign(entry.task, normalized);
    entry.meeting.updatedAt = now();
    affectedMeetings.set(entry.meeting.id, entry.meeting);
  };

  (Array.isArray(followUpTasks) ? followUpTasks : []).forEach((task) => {
    const entry = findMeetingTaskEntry(db, task, {
      beforeDate: date,
      excludeMeetingId: currentMeeting?.id || "",
      sourceMeetingId: normalizeText(task?.sourceMeetingId, 100),
      includeCompleted: true,
    });
    if (!entry) return;
    rememberReference(entry);
    if (entry.task.status !== "completed") updateReferencedTask(entry, task, true);
  });

  const currentInputs = [];
  (Array.isArray(tasks) ? tasks : []).forEach((task) => {
    if (!meetingTaskIdentity(task?.text)) return;
    if (task?.id && currentTaskIds.has(task.id)) {
      currentInputs.push(task);
      return;
    }
    const existing = findMeetingTaskEntry(db, task, {
      beforeDate: date,
      excludeMeetingId: currentMeeting?.id || "",
    });
    if (!existing) {
      currentInputs.push(task);
      return;
    }
    rememberReference(existing);
    updateReferencedTask(existing, task, false);
    mergedCount += 1;
  });

  const deduplicated = deduplicateMeetingTaskInputs(currentInputs);
  mergedCount += deduplicated.mergedCount;
  return {
    tasks: normalizeMeetingTasks(db, deduplicated.tasks, externalParticipantNames, currentTasks),
    followUpTaskRefs: [...references.values()],
    affectedMeetings: [...affectedMeetings.values()],
    mergedCount,
  };
}

function meetingTaskOwnerIds(task) {
  return [...new Set([
    ...(Array.isArray(task?.ownerIds) ? task.ownerIds : []),
    task?.ownerId,
  ].filter(Boolean))];
}

function normalizeExternalParticipants(names, teamParticipants = []) {
  if (!Array.isArray(names)) return [];
  const teamNames = new Set(teamParticipants.map((participant) => slugify(participant.name)));
  const unique = new Map();
  names.slice(0, 30).forEach((value) => {
    const name = normalizeText(value, 150);
    const key = slugify(name);
    if (name && key && !teamNames.has(key) && !unique.has(key)) unique.set(key, name);
  });
  return [...unique.values()];
}

function safeSecretEqual(actual, expected) {
  const actualBuffer = Buffer.from(String(actual || ""));
  const expectedBuffer = Buffer.from(String(expected || ""));
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

async function getConfig() {
  if (!configPromise) configPromise = import("./src/projectConfig.mjs");
  return configPromise;
}

async function getRules() {
  if (!rulesPromise) rulesPromise = import("./src/workReportRules.mjs");
  return rulesPromise;
}

async function getTimeRange() {
  if (!timeRangePromise) timeRangePromise = import("./src/timeRange.mjs");
  return timeRangePromise;
}

function loginAttemptKey(req) {
  return `${req.ip || req.socket.remoteAddress || "unknown"}:${normalizeText(req.body?.employeeId, 100)}`;
}

function isLoginBlocked(key) {
  const state = loginAttempts.get(key);
  if (!state) return false;
  if (state.resetAt <= Date.now()) {
    loginAttempts.delete(key);
    return false;
  }
  return state.count >= 8;
}

function registerFailedLogin(key) {
  const current = loginAttempts.get(key);
  const resetAt = current?.resetAt > Date.now() ? current.resetAt : Date.now() + 15 * 60 * 1000;
  loginAttempts.set(key, { count: (current?.resetAt > Date.now() ? current.count : 0) + 1, resetAt });
}

function addAudit(db, employee, action, entityType, entityId, details = {}) {
  db.auditLog.push({
    id: makeId("AUD"),
    at: now(),
    employeeId: employee?.id || "system",
    employeeName: employee?.name || "Systém",
    action,
    entityType,
    entityId,
    details,
  });
  db.auditLog = db.auditLog.slice(-5000);
}

async function sendPushToEmployees(employeeIds, notification) {
  const recipients = [...new Set((employeeIds || []).filter(Boolean))];
  if (!pushConfigured || !recipients.length) return { sent: 0, failed: 0, configured: pushConfigured };
  const db = await readDb();
  const subscriptions = db.pushSubscriptions.filter((item) => recipients.includes(item.employeeId));
  const expiredIds = [];
  let sent = 0;
  let failed = 0;
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webPush.sendNotification(
        { endpoint: subscription.endpoint, keys: subscription.keys },
        JSON.stringify({ icon: "/pwa-icon-192.png", badge: "/pwa-icon-192.png", ...notification }),
      );
      sent += 1;
    } catch (error) {
      failed += 1;
      if ([404, 410].includes(error.statusCode)) expiredIds.push(subscription.id);
      else console.error(`Push notification failed for ${subscription.employeeId}:`, error.message);
    }
  }));
  if (expiredIds.length) {
    await mutateDb(async (current) => {
      current.pushSubscriptions = current.pushSubscriptions.filter((item) => !expiredIds.includes(item.id));
      return { data: current };
    });
    await Promise.all(expiredIds.map((id) => deleteRecordSafe("pushSubscription", id)));
  }
  return { sent, failed, configured: true };
}

async function syncRecordSafe(type, record) {
  // Primary-mode mutations already committed their complete batch in mutateDb.
  if (process.env.GOOGLE_SHEETS_PRIMARY === "true") return { synced: true, atomic: true };
  try {
    return await googleWorkspace.syncRecord(type, record);
  } catch (error) {
    console.error(`Google sync failed for ${type} ${record.id}:`, error);
    if (process.env.GOOGLE_SHEETS_PRIMARY === "true") throw error;
    return { synced: false, reason: "error", error: error.message };
  }
}

let primaryDatabaseRefresh = null;
let primaryDatabaseRefreshedAt = 0;

async function readPrimaryDatabase({ force = false } = {}) {
  if (process.env.GOOGLE_SHEETS_PRIMARY !== "true") return readDb();
  if (!force && Date.now() - primaryDatabaseRefreshedAt < 5000) return readDb();
  if (!primaryDatabaseRefresh) {
    primaryDatabaseRefresh = (async () => {
      await refreshDb();
      primaryDatabaseRefreshedAt = Date.now();
      return readDb();
    })().finally(() => {
      primaryDatabaseRefresh = null;
    });
  }
  return primaryDatabaseRefresh;
}

async function deleteRecordSafe(type, recordId) {
  if (process.env.GOOGLE_SHEETS_PRIMARY === "true") return { synced: true, atomic: true };
  try {
    return await googleWorkspace.deleteRecord(type, recordId);
  } catch (error) {
    console.error(`Google row delete failed for ${type} ${recordId}:`, error);
    if (process.env.GOOGLE_SHEETS_PRIMARY === "true") throw error;
    return { synced: false, reason: "error", error: error.message };
  }
}

async function trashFileSafe(fileId) {
  if (!fileId) return { trashed: false, reason: "missing-id" };
  try {
    return await googleWorkspace.trashFile(fileId);
  } catch (error) {
    console.error(`Google Drive trash failed for ${fileId}:`, error);
    return { trashed: false, reason: "error", error: error.message };
  }
}

function deleteSimpleRecordHandler({ collection, type, label }) {
  return async (req, res) => {
    try {
      const deleted = await mutateDb(async (db) => {
        const index = db[collection].findIndex((item) => item.id === req.params.id);
        if (index < 0) {
          const missing = new Error(`${label} nebyl nalezen.`);
          missing.status = 404;
          throw missing;
        }
        const [item] = db[collection].splice(index, 1);
        addAudit(db, req.auth.employee, "delete", type, item.id, { label });
        return { data: db, value: item };
      });
      const [sheet, drive] = await Promise.all([
        deleteRecordSafe(type, deleted.id),
        trashFileSafe(deleted.driveFileId),
      ]);
      res.json({ deleted: true, id: deleted.id, sheet, drive });
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  };
}

function publicGoogleStatus(employee = null) {
  const status = googleWorkspace.getStatus();
  return {
    configured: status.configured,
    credentialsConfigured: status.credentialsConfigured,
    sheetsConfigured: status.sheetsConfigured,
    driveConfigured: status.driveConfigured,
    driveOAuthConfigured: status.driveOAuthConfigured,
    driveConnected: status.driveConnected,
    driveMode: status.driveMode,
    driveAccountEmail: status.driveAccountEmail,
    driveAllowedEmail: status.driveAllowedEmail,
    driveFolderUrl: isAdminRole(employee?.appRole) ? status.driveFolderUrl : "",
    spreadsheetId: status.spreadsheetId,
    error: status.error || "",
  };
}

function reportReviewerOnly(req, res, next) {
  if (!["manager", "director"].includes(req.auth?.employee?.appRole)) {
    return res.status(403).json({ error: "Tato akce je dostupná pouze Odbornému garantovi nebo Vedoucí služby/programu." });
  }
  return next();
}

function signedReportUploaderOnly(req, res, next) {
  if (!isLeaderRole(req.auth?.employee?.appRole)) {
    return res.status(403).json({ error: "Podepsané výkazy může nahrávat Odborný garant, Vedoucí služby/programu nebo Projektový manažer." });
  }
  return next();
}

function canReviewReport(db, reviewer, report) {
  const owner = db.employees.find((item) => item.id === report?.employeeId);
  return Boolean(owner && (
    (reviewer.appRole === "manager" && owner.appRole === "worker")
    || (reviewer.appRole === "director" && owner.appRole === "manager")
  ));
}

function reviewableReports(db, reviewer) {
  return db.workReports.filter((report) => canReviewReport(db, reviewer, report));
}

function signedUploadReports(db, uploader) {
  if (!isLeaderRole(uploader.appRole)) return [];
  return db.workReports.filter((report) => {
    if (uploader.appRole === "project_manager") {
      const owner = db.employees.find((employee) => employee.id === report.employeeId);
      return owner?.appRole === "manager" && ["approved", "printed"].includes(report.status);
    }
    if (report.employeeId === uploader.id) {
      const ownStatuses = uploader.appRole === "director"
        ? ["ready_for_signature", "approved", "printed"]
        : ["approved", "printed"];
      return ownStatuses.includes(report.status);
    }
    return canReviewReport(db, uploader, report) && ["approved", "printed"].includes(report.status);
  });
}

function assertAssignmentsAvailable(db, assignments, positions, excludedEmployeeId = "") {
  const positionIds = assignments.map((assignment) => assignment.positionId);
  const duplicateId = positionIds.find((positionId, index) => positionIds.indexOf(positionId) !== index);
  if (duplicateId) {
    const position = positions.find((item) => item.id === duplicateId);
    throw new Error(`Pozice „${position?.name || duplicateId}“ byla vybrána vícekrát.`);
  }
  for (const positionId of positionIds) {
    const owner = db.employees.find((employee) => employee.id !== excludedEmployeeId
      && employee.active !== false
      && (employee.assignments || []).some((assignment) => assignment.positionId === positionId));
    if (owner) {
      const position = positions.find((item) => item.id === positionId);
      const conflict = new Error(`Pozice „${position?.name || positionId}“ je již přiřazena pracovníkovi ${owner.name}.`);
      conflict.status = 409;
      throw conflict;
    }
  }
}

function visiblePortalData(db, employee) {
  const manager = employee.appRole === "manager";
  const admin = isAdminRole(employee.appRole);
  const leader = manager || admin;
  const isParticipant = (record) => (record.participantIds || []).includes(employee.id);
  const hasAssignedTask = (record) => (record.tasks || []).some((task) => meetingTaskOwnerIds(task).includes(employee.id));
  const hasReceivedTaskResult = (record) => (record.tasks || []).some((task) => (task.completionRecipientIds || []).includes(employee.id));
  const managerVisibleReports = db.workReports.filter((item) => item.employeeId === employee.id || canReviewReport(db, employee, item));
  return {
    employees: (leader ? db.employees : [employee]).map(publicEmployee),
    collaborators: db.employees.filter((item) => item.active !== false).map((item) => ({ id: item.id, name: item.name, appRole: item.appRole })),
    workReports: manager ? managerVisibleReports : admin
      ? db.workReports
      : db.workReports.filter((item) => item.employeeId === employee.id),
    employeeEvaluations: db.employeeEvaluations.filter((item) => {
      const target = db.employees.find((candidate) => candidate.id === item.employeeId);
      if (!canViewEmployeeEvaluation(employee, target)) return false;
      return target?.id !== employee.id || item.status === "closed";
    }),
    educationPlans: db.educationPlans.filter((item) => leader || item.employeeId === employee.id),
    educationRecords: db.educationRecords.filter((item) => leader || item.employeeId === employee.id),
    supervisions: db.supervisions.filter((item) => leader || isParticipant(item)),
    meetings: db.meetings.filter((item) => leader || isParticipant(item) || hasAssignedTask(item) || hasReceivedTaskResult(item) || item.createdBy === employee.id),
    methodologyAnswers: db.methodologyAnswers.filter((item) => item.employeeId === employee.id),
  };
}

async function callGemini({ promptText, systemInstruction, responseSchema, model: requestedModel, inlineData }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Chybí GEMINI_API_KEY na serveru.");
  const model = requestedModel || process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const parts = [{ text: promptText }];
  if (inlineData) parts.push({ inlineData });
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: { responseMimeType: "application/json", responseSchema },
      }),
    }
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error?.message || `Gemini API vrátilo HTTP ${response.status}.`);
  }
  const payload = await response.json();
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini nevrátilo použitelnou odpověď.");
  return JSON.parse(text);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, google: publicGoogleStatus(), time: now() });
});

app.get("/api/google-drive/callback", async (req, res) => {
  const target = new URL(googleWorkspace.driveAppUrl());
  try {
    if (req.query.error) throw new Error("Připojení Google Drive bylo zrušeno.");
    await googleWorkspace.completeDriveAuthorization(req.query.code, req.query.state);
    target.searchParams.set("googleDrive", "connected");
  } catch (error) {
    console.error("Google Drive OAuth callback failed:", error);
    target.searchParams.set("googleDrive", "error");
    target.searchParams.set("reason", error.message);
  }
  res.redirect(target.toString());
});

app.post("/api/google-drive/connect", requireAuth, directorOnly, (req, res) => {
  try {
    const authorizationUrl = googleWorkspace.getDriveAuthorizationUrl(req.auth.employee.id);
    res.json({ authorizationUrl });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete("/api/google-drive/connect", requireAuth, directorOnly, async (req, res) => {
  try {
    await googleWorkspace.disconnectDrive();
    res.json({ ok: true, google: publicGoogleStatus(req.auth.employee) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/config", async (_req, res) => {
  try {
    const config = await getConfig();
    res.json({ project: config.PROJECT, keyActivities: config.KEY_ACTIVITIES, positions: config.POSITIONS });
  } catch (error) {
    res.status(500).json({ error: "Nelze načíst projektovou konfiguraci.", details: error.message });
  }
});

app.get("/api/setup/status", async (_req, res) => {
  try {
    const db = await readDb();
    res.json({
      needsSetup: !db.employees.some((item) => item.appRole === "manager"),
      setupCodeRequired: Boolean(process.env.APP_SETUP_TOKEN),
      google: publicGoogleStatus(),
    });
  } catch (error) {
    res.status(500).json({ error: "Nelze zjistit stav aplikace.", details: error.message });
  }
});

app.post("/api/setup/bootstrap", async (req, res) => {
  try {
    const name = normalizeText(req.body?.name, 120);
    if (process.env.APP_SETUP_TOKEN && !safeSecretEqual(req.body?.setupCode, process.env.APP_SETUP_TOKEN)) {
      return res.status(403).json({ error: "Nesprávný instalační kód." });
    }
    if (!name) return res.status(400).json({ error: "Zadejte jméno Odborného garanta." });
    const employee = await mutateDb(async (db) => {
      if (db.employees.some((item) => item.appRole === "manager")) {
        const conflict = new Error("Počáteční nastavení už proběhlo.");
        conflict.status = 409;
        throw conflict;
      }
      const item = {
        id: `${slugify(name) || "vedouci"}-${crypto.randomBytes(3).toString("hex")}`,
        name,
        exportName: exportName(name),
        appRole: "manager",
        globalFte: nonnegativeNumber(req.body?.globalFte, 0.2),
        assignments: [{ id: makeId("ASG"), positionId: "expert-guarantor" }],
        pinHash: hashPin("1111"),
        pinMustChange: true,
        active: true,
        createdAt: now(),
        updatedAt: now(),
      };
      db.employees.push(item);
      addAudit(db, item, "bootstrap", "employee", item.id);
      return { data: db, value: item };
    });
    const token = createSession(employee.id);
    const sync = await syncRecordSafe("employee", employee);
    res.status(201).json({ token, employee: publicEmployee(employee), sync });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.get("/api/auth/options", async (_req, res) => {
  try {
    const db = await readPrimaryDatabase();
    res.json(db.employees.filter((item) => item.active !== false).map((item) => ({ id: item.id, name: item.name, appRole: item.appRole })));
  } catch (error) {
    res.status(500).json({ error: "Nelze načíst uživatele.", details: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const attemptKey = loginAttemptKey(req);
    if (isLoginBlocked(attemptKey)) {
      return res.status(429).json({ error: "Příliš mnoho neúspěšných pokusů. Přihlášení zkuste za 15 minut." });
    }
    const db = await readPrimaryDatabase();
    const employee = db.employees.find((item) => item.id === req.body?.employeeId && item.active !== false);
    if (!employee || !verifyPin(String(req.body?.pin || ""), employee.pinHash)) {
      registerFailedLogin(attemptKey);
      return res.status(401).json({ error: "Nesprávný uživatel nebo PIN." });
    }
    loginAttempts.delete(attemptKey);
    const token = createSession(employee.id);
    const sync = await syncRecordSafe("employee", employee);
    res.json({ token, employee: publicEmployee(employee), sync });
  } catch (error) {
    res.status(500).json({ error: "Přihlášení selhalo.", details: error.message });
  }
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
  deleteSession(bearerToken(req));
  res.json({ ok: true });
});

app.post("/api/auth/change-pin", requireAuth, async (req, res) => {
  try {
    const currentPin = String(req.body?.currentPin || "");
    const newPin = String(req.body?.newPin || "");
    if (currentPin === newPin) {
      return res.status(400).json({ error: "Nový PIN musí být jiný než současný." });
    }
    const employee = await mutateDb(async (db) => {
      const index = db.employees.findIndex((item) => item.id === req.auth.employee.id && item.active !== false);
      if (index < 0) {
        const missing = new Error("Pracovník nebyl nalezen.");
        missing.status = 404;
        throw missing;
      }
      const current = db.employees[index];
      if (!verifyPin(currentPin, current.pinHash)) {
        const invalid = new Error("Současný PIN není správný.");
        invalid.status = 401;
        throw invalid;
      }
      const timestamp = now();
      const next = {
        ...current,
        pinHash: hashPin(newPin),
        pinMustChange: false,
        pinChangedAt: timestamp,
        updatedAt: timestamp,
      };
      db.employees[index] = next;
      addAudit(db, next, "change_pin", "employee", next.id);
      return { data: db, value: next };
    });
    const sync = await syncRecordSafe("employee", employee);
    res.json({ ok: true, employee: publicEmployee(employee), sync });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.get("/api/portal", requireAuth, async (req, res) => {
  try {
    const db = await readPrimaryDatabase();
    res.json({ employee: publicEmployee(req.auth.employee), ...visiblePortalData(db, req.auth.employee), google: publicGoogleStatus(req.auth.employee) });
  } catch (error) {
    res.status(500).json({ error: "Nelze načíst portál.", details: error.message });
  }
});

app.post("/api/methodology-answers", requireAuth, async (req, res) => {
  try {
    const answer = await mutateDb(async (db) => {
      const record = createMethodologyAnswer({ employee: req.auth.employee, body: req.body, makeId, now });
      db.methodologyAnswers.push(record);
      addAudit(db, req.auth.employee, "answer", "methodologyAnswer", record.id, {
        questionId: record.questionId,
        correct: record.correct,
        seriesId: record.seriesId,
      });
      return { data: db, value: record };
    });
    const sync = await syncRecordSafe("methodologyAnswer", answer);
    res.status(201).json({ answer, sync });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.get("/api/push/config", requireAuth, (_req, res) => {
  res.json({ configured: pushConfigured, publicKey: pushConfigured ? pushPublicKey : "" });
});

app.post("/api/push/subscriptions", requireAuth, async (req, res) => {
  try {
    if (!pushConfigured) return res.status(503).json({ error: "Upozornění zatím nejsou na serveru nakonfigurovaná." });
    const endpoint = normalizeText(req.body?.endpoint, 2000);
    const p256dh = normalizeText(req.body?.keys?.p256dh, 1000);
    const auth = normalizeText(req.body?.keys?.auth, 1000);
    if (!endpoint.startsWith("https://") || !p256dh || !auth) return res.status(400).json({ error: "Prohlížeč neposlal platné přihlášení k upozorněním." });
    const subscription = await mutateDb(async (db) => {
      const existing = db.pushSubscriptions.find((item) => item.employeeId === req.auth.employee.id && item.endpoint === endpoint);
      const timestamp = now();
      const next = {
        ...(existing || {}),
        id: existing?.id || makeId("PSH"),
        employeeId: req.auth.employee.id,
        employeeName: req.auth.employee.name,
        endpoint,
        keys: { p256dh, auth },
        createdAt: existing?.createdAt || timestamp,
        updatedAt: timestamp,
      };
      if (existing) Object.assign(existing, next); else db.pushSubscriptions.push(next);
      addAudit(db, req.auth.employee, "subscribe", "pushSubscription", next.id);
      return { data: db, value: next };
    });
    const sync = await syncRecordSafe("pushSubscription", subscription);
    res.status(201).json({ subscribed: true, sync });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.delete("/api/push/subscriptions", requireAuth, async (req, res) => {
  try {
    const endpoint = normalizeText(req.body?.endpoint, 2000);
    const deleted = await mutateDb(async (db) => {
      const matches = db.pushSubscriptions.filter((item) => item.employeeId === req.auth.employee.id && (!endpoint || item.endpoint === endpoint));
      db.pushSubscriptions = db.pushSubscriptions.filter((item) => !matches.some((match) => match.id === item.id));
      return { data: db, value: matches };
    });
    await Promise.all(deleted.map((item) => deleteRecordSafe("pushSubscription", item.id)));
    res.json({ subscribed: false, deleted: deleted.length });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

const pushTestScheduler = require("./server/pushTest.cjs").createPushTestScheduler(employeeId => sendPushToEmployees([employeeId], {
  title: "Mosty v rodině · zkouška",
  body: "Pokud toto vidíte při zavřeném okně portálu, upozornění na tomto zařízení funguje.",
  url: "/", tag: "push-closed-app-test",
}));

app.get("/api/push/test", requireAuth, (req, res) => {
  res.json({ test: pushTestScheduler.status(req.auth.employee.id) });
});

app.post("/api/push/test", requireAuth, async (req, res) => {
  try {
    if (!pushConfigured) return res.status(503).json({ error: "Upozornění nejsou na serveru nakonfigurovaná." });
    if (req.body?.delayed === true) {
      const db = await readDb();
      if (!db.pushSubscriptions.some(item => item.employeeId === req.auth.employee.id)) {
        return res.status(400).json({ error: "Nejprve zapněte upozornění na tomto zařízení." });
      }
      return res.status(202).json({ test: pushTestScheduler.start(req.auth.employee.id) });
    }
    const result = await sendPushToEmployees([req.auth.employee.id], {
      title: "Mosty v rodině",
      body: "Zkušební upozornění. Doručení při zavřeném okně ověřte samostatnou zkouškou.",
      url: "/",
      tag: "push-test",
    });
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: "Zkušební upozornění se nepodařilo odeslat.", details: error.message });
  }
});

app.post("/api/employees", requireAuth, directorOnly, async (req, res) => {
  try {
    const config = await getConfig();
    const name = normalizeText(req.body?.name, 120);
    if (!name) return res.status(400).json({ error: "Jméno pracovníka je povinné." });
    const appRole = ["manager", "project_manager"].includes(req.body?.appRole) ? req.body.appRole : "worker";
    const requestedAssignments = Array.isArray(req.body?.assignments) ? req.body.assignments : [];
    if (appRole === "project_manager" && requestedAssignments.length) {
      return res.status(400).json({ error: "Projektový manažer nemá vlastní pracovní výkaz ani vykazovanou pozici." });
    }
    if (requestedAssignments.some((assignment) => assignment.positionId === "service-manager")) {
      return res.status(400).json({ error: "Pozice Vedoucí služby/programu patří pouze jejímu vlastnímu účtu." });
    }
    if (appRole === "worker" && requestedAssignments.some((assignment) => assignment.positionId === "expert-guarantor")) {
      return res.status(400).json({ error: "Pozice Odborný garant vyžaduje odpovídající typ účtu." });
    }
    const normalizedAssignments = appRole === "manager" && !requestedAssignments.some((assignment) => assignment.positionId === "expert-guarantor")
      ? [{ positionId: "expert-guarantor" }, ...requestedAssignments]
      : requestedAssignments;
    const assignments = normalizedAssignments.map((assignment) => {
      const position = config.POSITIONS.find((item) => item.id === assignment.positionId && item.active !== false && item.reportRequired);
      if (!position) throw new Error(`Neplatná pozice nebo pozice bez pracovního výkazu: ${assignment.positionId}`);
      return {
        id: assignment.id || makeId("ASG"),
        positionId: position.id,
        ...(assignment.fte !== undefined ? { fte: nonnegativeNumber(assignment.fte) } : {}),
        ...(assignment.monthlyHours !== undefined ? { monthlyHours: nonnegativeNumber(assignment.monthlyHours) } : {}),
      };
    });
    const employee = await mutateDb(async (db) => {
      assertAssignmentsAvailable(db, normalizedAssignments, config.POSITIONS);
      const item = {
        id: `${slugify(name) || "pracovnik"}-${crypto.randomBytes(3).toString("hex")}`,
        name,
        exportName: exportName(name),
        appRole,
        globalFte: nonnegativeNumber(req.body?.globalFte, 1),
        assignments,
        pinHash: hashPin("1111"),
        pinMustChange: true,
        active: true,
        createdAt: now(),
        updatedAt: now(),
      };
      db.employees.push(item);
      addAudit(db, req.auth.employee, "create", "employee", item.id);
      return { data: db, value: item };
    });
    const sync = await syncRecordSafe("employee", employee);
    const currentDb = await readDb();
    const linkedMeetings = currentDb.meetings.filter((meeting) => (meeting.tasks || []).some((task) => meetingTaskOwnerIds(task).includes(employee.id)));
    const taskSync = await Promise.all(linkedMeetings.map((meeting) => syncRecordSafe("meeting", meeting)));
    res.status(201).json({ ...publicEmployee(employee), sync, taskSync });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.patch("/api/employees/:id", requireAuth, directorOnly, async (req, res) => {
  try {
    const config = await getConfig();
    const employee = await mutateDb(async (db) => {
      const index = db.employees.findIndex((item) => item.id === req.params.id);
      if (index < 0) throw new Error("Pracovník nebyl nalezen.");
      const current = db.employees[index];
      if (current.appRole === "director") {
        const protectedAccount = new Error("Projektovou pozici Vedoucí služby/programu nelze v tomto přehledu měnit.");
        protectedAccount.status = 403;
        throw protectedAccount;
      }
      const requestedName = req.body.name === undefined ? current.name : normalizeText(req.body.name, 120);
      if (!requestedName) throw new Error("Jméno pracovníka je povinné.");
      const next = {
        ...current,
        name: requestedName,
        exportName: req.body.name === undefined ? current.exportName : exportName(requestedName),
        globalFte: req.body.globalFte === undefined ? current.globalFte : nonnegativeNumber(req.body.globalFte),
        active: req.body.active === undefined ? current.active : Boolean(req.body.active),
        updatedAt: now(),
      };
      if (Array.isArray(req.body.assignments)) {
        if (current.appRole === "project_manager" && req.body.assignments.length) {
          throw new Error("Projektový manažer nemá vlastní pracovní výkaz ani vykazovanou pozici.");
        }
        if (req.body.assignments.some((assignment) => assignment.positionId === "service-manager")) {
          throw new Error("Pozice Vedoucí služby/programu patří pouze jejímu vlastnímu účtu.");
        }
        if (current.appRole === "worker" && req.body.assignments.some((assignment) => assignment.positionId === "expert-guarantor")) {
          throw new Error("Pozice Odborný garant vyžaduje odpovídající typ účtu.");
        }
        const requestedAssignments = current.appRole === "manager" && !req.body.assignments.some((assignment) => assignment.positionId === "expert-guarantor")
          ? [{ positionId: "expert-guarantor" }, ...req.body.assignments]
          : req.body.assignments;
        assertAssignmentsAvailable(db, requestedAssignments, config.POSITIONS, current.id);
        next.assignments = requestedAssignments.map((assignment) => {
          const position = config.POSITIONS.find((item) => item.id === assignment.positionId && item.active !== false && item.reportRequired);
          if (!position) throw new Error(`Neplatná pozice nebo pozice bez pracovního výkazu: ${assignment.positionId}`);
          return {
            ...assignment,
            id: assignment.id || makeId("ASG"),
            ...(assignment.fte !== undefined ? { fte: nonnegativeNumber(assignment.fte) } : {}),
            ...(assignment.monthlyHours !== undefined ? { monthlyHours: nonnegativeNumber(assignment.monthlyHours) } : {}),
          };
        });
      }
      if (req.body.pin) {
        next.pinHash = hashPin(String(req.body.pin));
        next.pinMustChange = true;
      }
      db.employees[index] = next;
      addAudit(db, req.auth.employee, "update", "employee", next.id);
      return { data: db, value: next };
    });
    const sync = await syncRecordSafe("employee", employee);
    res.json({ ...publicEmployee(employee), sync });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.delete("/api/employees/:id", requireAuth, directorOnly, async (req, res) => {
  try {
    const result = await mutateDb(async (db) => {
      const index = db.employees.findIndex((item) => item.id === req.params.id);
      if (index < 0) throw new Error("Pracovník nebyl nalezen.");
      const current = db.employees[index];
      if (current.appRole === "director" || current.id === req.auth.employee.id) {
        const protectedAccount = new Error("Účet Vedoucí služby/programu nelze odstranit.");
        protectedAccount.status = 403;
        throw protectedAccount;
      }
      const next = { ...current, active: false, updatedAt: now() };
      const hasRecords = db.workReports.some((item) => item.employeeId === current.id)
        || db.employeeEvaluations.some((item) => item.employeeId === current.id)
        || db.educationPlans.some((item) => item.employeeId === current.id)
        || db.educationRecords.some((item) => item.employeeId === current.id)
        || db.supervisions.some((item) => item.createdBy === current.id || (item.participantIds || []).includes(current.id))
        || db.meetings.some((item) => item.createdBy === current.id
          || (item.participantIds || []).includes(current.id)
          || (item.tasks || []).some((task) => meetingTaskOwnerIds(task).includes(current.id)));
      if (hasRecords) db.employees[index] = next;
      else db.employees.splice(index, 1);
      addAudit(db, req.auth.employee, "delete", "employee", next.id);
      return { data: db, value: { employee: next, archived: hasRecords } };
    });
    const sync = await syncRecordSafe("employee", result.employee);
    res.json({ ok: true, archived: result.archived, employee: publicEmployee(result.employee), sync });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.post("/api/work-reports/submit", requireAuth, async (req, res) => {
  try {
    const config = await getConfig();
    const rules = await getRules();
    const month = Number(req.body?.month);
    const year = Number(req.body?.year);
    const entries = Array.isArray(req.body?.reports) ? req.body.reports : [];
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
      return res.status(400).json({ error: "Neplatné vykazované období." });
    }
    if (!entries.length) return res.status(400).json({ error: "Nebyly předány žádné výkazy." });
    const start = new Date(config.PROJECT.startDate);
    const end = new Date(config.PROJECT.endDate);
    const periodIndex = year * 12 + month;
    if (periodIndex < start.getFullYear() * 12 + start.getMonth() + 1 || periodIndex > end.getFullYear() * 12 + end.getMonth() + 1) {
      return res.status(400).json({ error: "Vykazované období je mimo dobu realizace projektu." });
    }
    const absenceInput = req.body?.absences || {};
    const absences = {
      vacation: Number(absenceInput.vacation || 0),
      sickLeave: Number(absenceInput.sickLeave || 0),
      otherObstacles: Number(absenceInput.otherObstacles || 0),
      otherObstaclesUnit: absenceInput.otherObstaclesUnit === "hours" ? "hours" : "days",
      doctorVisitHours: Number(absenceInput.doctorVisitHours || 0),
      holiday: rules.getHolidaysCountForMonth(month, year),
    };
    if (Object.entries(absences).some(([key, value]) => key !== "otherObstaclesUnit" && (!Number.isFinite(value) || value < 0))) {
      return res.status(400).json({ error: "Nepřítomnosti musí být nezáporná čísla." });
    }
    const workingDays = rules.getWorkingDays(month, year);
    const absenceDays = absences.vacation + absences.sickLeave + absences.holiday
      + (absences.otherObstaclesUnit === "days" ? absences.otherObstacles : 0);
    if (absenceDays > workingDays + 0.001) {
      return res.status(400).json({ error: "Součet dnů nepřítomnosti překračuje počet pracovních dnů v měsíci." });
    }
    const submissionId = makeId("SUB");
    const saved = await mutateDb(async (db) => {
      const employee = db.employees.find((item) => item.id === req.auth.employee.id);
      const allowedAssignments = new Map((employee.assignments || []).map((item) => [item.id, item]));
      const assignedFte = (employee.assignments || []).reduce((sum, item) => {
        const definition = config.POSITIONS.find((position) => position.id === item.positionId);
        return definition?.active !== false && definition?.reportRequired && definition?.allocationType === "fte"
          ? sum + Number(item.fte ?? definition.fte ?? 0)
          : sum;
      }, 0);
      const totalFte = Number(employee.globalFte || 0) || assignedFte;
      const records = entries.map((entry) => {
        const assignment = allowedAssignments.get(entry.assignmentId);
        if (!assignment) throw new Error("Výkaz obsahuje pozici, která pracovníkovi není přiřazena.");
        const position = config.POSITIONS.find((item) => item.id === assignment.positionId && item.reportRequired);
        if (!position) throw new Error("Pro tuto pozici se měsíční výkaz nevytváří.");
        const existing = db.workReports.find((item) =>
          item.employeeId === employee.id && item.assignmentId === assignment.id && item.month === month && item.year === year
        );
        const editableStatuses = employee.appRole === "director"
          ? ["returned", "draft", "ready_for_signature"]
          : ["returned", "draft"];
        if (existing && !editableStatuses.includes(existing.status)) {
          throw new Error(`Výkaz ${position.name} za toto období už byl předán.`);
        }
        const activities = Array.isArray(entry.activities)
          ? entry.activities.slice(0, 10).map((activity) => ({
              desc: normalizeText(activity?.desc, 2000),
              hours: Number(activity?.hours || 0),
            }))
          : [];
        if (!activities.length || activities.some((activity) => !activity.desc || !Number.isFinite(activity.hours) || activity.hours < 0)) {
          throw new Error(`Výkaz ${position.name} musí obsahovat platné činnosti a nezáporné hodiny.`);
        }
        const role = {
          ...position,
          ...assignment,
          fte: Number(assignment.fte ?? position.fte ?? 0),
          monthlyHours: Number(assignment.monthlyHours ?? position.monthlyHours ?? 0),
        };
        const metrics = rules.calculateRoleMetrics({ role, positionDef: position, month, year, absences, totalFte });
        if (metrics.totalAbsenceHours > metrics.maxHoursForRole + 0.011) {
          throw new Error(`Nepřítomnost ve výkazu ${position.name} překračuje měsíční fond pozice.`);
        }
        const requiredWorkedHours = Math.max(0, metrics.maxHoursForRole - metrics.totalAbsenceHours);
        const workedHours = Math.round(activities.reduce((sum, activity) => sum + activity.hours, 0) * 100) / 100;
        if (Math.abs(workedHours - requiredWorkedHours) > 0.011) {
          throw new Error(`Hodiny ve výkazu ${position.name} nesedí. Požadováno ${requiredWorkedHours.toFixed(2)} h, vyplněno ${workedHours.toFixed(2)} h.`);
        }
        const timestamp = now();
        const record = {
          ...(existing || {}),
          id: existing?.id || makeId("WR"),
          submissionId,
          employeeId: employee.id,
          employeeName: employee.name,
          assignmentId: assignment.id,
          positionId: position.id,
          positionName: position.name,
          budgetCode: position.budgetCode,
          contractType: position.contractType,
          allocationType: position.allocationType,
          allocationLabel: position.allocationType === "hours"
            ? `${assignment.monthlyHours ?? position.monthlyHours} h/měsíc`
            : `${assignment.fte ?? position.fte} úv.`,
          fte: Number(assignment.fte ?? position.fte ?? 0),
          monthlyHours: Number(assignment.monthlyHours ?? position.monthlyHours ?? 0),
          month,
          year,
          absences,
          activities,
          workedHours,
          absenceHours: metrics.totalAbsenceHours,
          status: employee.appRole === "director" ? "ready_for_signature" : "submitted",
          managerComment: "",
          submittedAt: timestamp,
          updatedAt: timestamp,
        };
        if (existing) Object.assign(existing, record);
        else db.workReports.push(record);
        addAudit(db, employee, "submit", "workReport", record.id);
        return record;
      });
      return { data: db, value: records };
    });
    const sync = await Promise.all(saved.map((record) => syncRecordSafe("workReport", record)));
    res.status(201).json({ submissionId, reports: saved, sync });
    if (req.auth.employee.appRole !== "director") {
      void readDb().then((db) => {
        const reviewerRole = req.auth.employee.appRole === "manager" ? "director" : "manager";
        const reviewerIds = db.employees.filter((item) => item.active !== false && item.appRole === reviewerRole).map((item) => item.id);
        return sendPushToEmployees(reviewerIds, {
          title: "Výkaz ke kontrole",
          body: `${req.auth.employee.name} předal/a ${saved.length === 1 ? "pracovní výkaz" : `${saved.length} pracovní výkazy`} za ${month}/${year}.`,
          url: "/?open=reports",
          tag: `report-submission-${submissionId}`,
        });
      }).catch((error) => console.error("Report submission notification failed:", error.message));
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.patch("/api/work-reports/:id/status", requireAuth, reportReviewerOnly, async (req, res) => {
  const allowed = new Set(["submitted", "returned", "approved", "printed"]);
  const status = String(req.body?.status || "");
  const comment = normalizeText(req.body?.comment, 2000);
  if (!allowed.has(status)) return res.status(400).json({ error: "Neplatný stav výkazu." });
  if (status === "returned" && !comment) return res.status(400).json({ error: "Při vrácení výkazu je poznámka pro pracovníka povinná." });
  try {
    const report = await mutateDb(async (db) => {
      const item = db.workReports.find((record) => record.id === req.params.id);
      if (!item) throw new Error("Výkaz nebyl nalezen.");
      if (!canReviewReport(db, req.auth.employee, item)) {
        const forbidden = new Error("Tento výkaz nemáte oprávnění kontrolovat.");
        forbidden.status = 403;
        throw forbidden;
      }
      item.status = status;
      item.managerComment = comment;
      item.reviewedBy = req.auth.employee.id;
      item.reviewedByName = req.auth.employee.name;
      item.reviewedByRole = req.auth.employee.appRole;
      item.reviewedAt = now();
      if (status === "approved") {
        item.approvedAt = item.reviewedAt;
        item.approvedBy = req.auth.employee.id;
        item.approvedByName = req.auth.employee.name;
        item.approvedByRole = req.auth.employee.appRole;
      }
      item.updatedAt = now();
      addAudit(db, req.auth.employee, "status", "workReport", item.id, { status });
      return { data: db, value: item };
    });
    const sync = await syncRecordSafe("workReport", report);
    res.json({ report, sync });
    if (["returned", "approved"].includes(status)) {
      void sendPushToEmployees([report.employeeId], {
        title: status === "returned" ? "Výkaz vrácen k úpravě" : "Výkaz schválen",
        body: status === "returned"
          ? `${report.positionName} za ${report.month}/${report.year}: ${comment}`
          : `${report.positionName} za ${report.month}/${report.year} byl schválen k podpisu.`,
        url: "/?open=reports",
        tag: `report-status-${report.id}-${status}`,
      }).catch((error) => console.error("Report status notification failed:", error.message));
    }
  } catch (error) {
    res.status(error.status || 404).json({ error: error.message });
  }
});

app.delete("/api/work-reports/:id", requireAuth, directorOnly, deleteSimpleRecordHandler({
  collection: "workReports", type: "workReport", label: "Výkaz",
}));

app.get("/api/work-reports/:id/signed-file", requireAuth, async (req, res) => {
  try {
    const db = await readDb();
    const report = db.workReports.find((item) => item.id === req.params.id);
    if (!report) return res.status(404).json({ error: "Výkaz nebyl nalezen." });
    const canPreview = report.employeeId === req.auth.employee.id
      || isAdminRole(req.auth.employee.appRole)
      || canReviewReport(db, req.auth.employee, report);
    if (!canPreview) return res.status(403).json({ error: "Tento podepsaný výkaz nemáte oprávnění zobrazit." });

    let buffer;
    if (report.driveFileId) {
      buffer = await googleWorkspace.downloadFile(report.driveFileId);
    } else if (report.localFilePath) {
      const dataRoot = path.resolve(path.dirname(DB_PATH));
      const filePath = path.resolve(report.localFilePath);
      if (filePath !== dataRoot && !filePath.startsWith(`${dataRoot}${path.sep}`)) {
        return res.status(403).json({ error: "Uložený soubor je mimo datovou složku aplikace." });
      }
      buffer = await fs.readFile(filePath);
    } else {
      return res.status(404).json({ error: "K tomuto výkazu zatím není uložené podepsané PDF." });
    }

    const fileName = exportName(`Vykaz_${report.employeeName}_${report.positionName}_${report.year}_${report.month}`) || "Pracovni_vykaz";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}.pdf"`);
    res.setHeader("Content-Length", String(buffer.length));
    return res.send(buffer);
  } catch (error) {
    return res.status(502).json({ error: "Náhled podepsaného výkazu se nepodařilo načíst.", details: error.message });
  }
});

app.put("/api/employee-evaluations/:year", requireAuth, leaderOnly, async (req, res) => {
  try {
    const year = Number(req.params.year);
    if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new Error("Neplatný rok hodnocení.");
    const targetEmployeeId = req.body.employeeId;
    const evaluation = await mutateDb(async (db) => {
      const target = db.employees.find((item) => item.id === targetEmployeeId);
      if (!target) throw new Error("Pracovník nebyl nalezen.");
      if (!canManageEmployeeEvaluation(req.auth.employee, target)) {
        const denied = new Error("Tohoto pracovníka nemáte oprávnění hodnotit.");
        denied.status = 403;
        throw denied;
      }
      let item = db.employeeEvaluations.find((record) => record.employeeId === target.id && record.year === year);
      const linkedPlan = db.educationPlans.find((plan) => plan.employeeId === target.id && plan.year === year);
      if (item?.status === "closed" && linkedPlan?.status === "approved" && !isAdminRole(req.auth.employee.appRole)) {
        const locked = new Error("Hodnocení je uzamčené schváleným vzdělávacím plánem. Odemknout je může Vedoucí služby/programu.");
        locked.status = 409;
        throw locked;
      }
      const status = req.body.status === "closed" ? "closed" : "draft";
      const professionalGoals = Array.isArray(req.body.professionalGoals)
        ? req.body.professionalGoals.slice(0, 3).map((goal) => ({
            id: normalizeText(goal?.id, 150) || makeId("EVG"),
            text: normalizeText(goal?.text, 1000),
            successCriterion: normalizeText(goal?.successCriterion, 1000),
          })).filter((goal) => goal.text || goal.successCriterion)
        : [];
      const timestamp = now();
      const next = {
        ...(item || {}),
        id: item?.id || makeId("EVE"), employeeId: target.id, employeeName: target.name, year,
        evaluationDate: normalizeText(req.body.evaluationDate, 20),
        previousGoalsEvaluation: normalizeText(req.body.previousGoalsEvaluation, 10000),
        strengths: normalizeText(req.body.strengths, 10000),
        developmentNeeds: normalizeText(req.body.developmentNeeds, 10000),
        professionalGoals,
        evaluatorId: req.auth.employee.id,
        evaluatorName: req.auth.employee.name,
        evaluatorRole: req.auth.employee.appRole,
        status,
        closedAt: status === "closed" ? (item?.closedAt || timestamp) : "",
        educationPlanId: linkedPlan?.id || item?.educationPlanId || "",
        createdAt: item?.createdAt || timestamp,
        updatedAt: timestamp,
      };
      if (status === "closed") {
        if (!next.evaluationDate || !next.strengths || !next.developmentNeeds || !next.professionalGoals.length) {
          throw new Error("Před uzavřením vyplňte datum, silné stránky, rozvojové potřeby a alespoň jeden profesní cíl.");
        }
        if (next.professionalGoals.some((goal) => !goal.text || !goal.successCriterion)) {
          throw new Error("U každého profesního cíle vyplňte také způsob, jak poznáte jeho splnění.");
        }
      }
      if (item) Object.assign(item, next); else { item = next; db.employeeEvaluations.push(item); }
      addAudit(db, req.auth.employee, "upsert", "employeeEvaluation", item.id, { status: item.status });
      return { data: db, value: item };
    });
    const sync = await syncRecordSafe("employeeEvaluation", evaluation);
    res.json({ evaluation, sync });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.delete("/api/employee-evaluations/:id", requireAuth, directorOnly, async (req, res) => {
  try {
    const result = await mutateDb(async (db) => {
      const index = db.employeeEvaluations.findIndex((item) => item.id === req.params.id);
      if (index < 0) {
        const missing = new Error("Hodnocení nebylo nalezeno.");
        missing.status = 404;
        throw missing;
      }
      const [evaluation] = db.employeeEvaluations.splice(index, 1);
      const linkedPlans = db.educationPlans.filter((plan) => plan.employeeEvaluationId === evaluation.id);
      for (const plan of linkedPlans) {
        plan.employeeEvaluationId = "";
        plan.updatedAt = now();
      }
      addAudit(db, req.auth.employee, "delete", "employeeEvaluation", evaluation.id);
      return { data: db, value: { evaluation, linkedPlans } };
    });
    const [sheet, planSync] = await Promise.all([
      deleteRecordSafe("employeeEvaluation", result.evaluation.id),
      Promise.all(result.linkedPlans.map((plan) => syncRecordSafe("educationPlan", plan))),
    ]);
    res.json({ deleted: true, id: result.evaluation.id, sheet, planSync });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.put("/api/education-plans/:year", requireAuth, leaderOnly, async (req, res) => {
  try {
    const year = Number(req.params.year);
    if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new Error("Neplatný rok plánu.");
    const targetEmployeeId = req.body.employeeId || req.auth.employee.id;
    const config = await getConfig();
    const result = await mutateDb(async (db) => {
      const employee = db.employees.find((item) => item.id === targetEmployeeId);
      if (!employee) throw new Error("Pracovník nebyl nalezen.");
      if (!canManageEducationPlan(req.auth.employee, employee)) {
        const denied = new Error("Tento vzdělávací plán nemůžete upravovat.");
        denied.status = 403;
        throw denied;
      }
      let item = db.educationPlans.find((record) => record.employeeId === employee.id && record.year === year);
      const employeeEvaluation = db.employeeEvaluations.find((record) => record.employeeId === employee.id && record.year === year && record.status === "closed");
      const timestamp = now();
      const requestedStatus = String(req.body.status || "draft");
      const allowedStatuses = allowedEducationPlanStatuses(req.auth.employee, employee);
      if (!allowedStatuses.has(requestedStatus)) {
        const denied = new Error(employee.id === req.auth.employee.id && employee.appRole === "manager"
          ? "Vlastní plán Odborného garanta schvaluje Vedoucí služby/programu."
          : "Pro tento účet není požadovaný stav plánu povolen.");
        denied.status = 403;
        throw denied;
      }
      const positionNames = (employee.assignments || [])
        .map((assignment) => config.POSITIONS.find((position) => position.id === assignment.positionId)?.name)
        .filter(Boolean);
      const supervisor = employee.appRole === "worker"
        ? db.employees.find((candidate) => candidate.active !== false && candidate.appRole === "manager")
        : employee.appRole === "manager"
          ? db.employees.find((candidate) => candidate.active !== false && candidate.appRole === "director")
          : null;
      const allowedNeedSources = new Set([
        "job_requirements", "client_needs", "legislation_methodology", "employee_evaluation",
        "supervisor_recommendation", "own_interest", "other",
      ]);
      const allowedFormats = new Set(["course", "seminar", "conference", "e_learning", "internship", "other"]);
      const allowedActivityStatuses = new Set(["planned", "completed"]);
      const next = {
        ...(item || {}),
        id: item?.id || makeId("EDP"), employeeId: employee.id, employeeName: employee.name, year,
        employeeEvaluationId: employeeEvaluation?.id || item?.employeeEvaluationId || "",
        positionNames, serviceName: config.PROJECT.name,
        supervisorId: supervisor?.id || "", supervisorName: supervisor?.name || "",
        planDate: normalizeText(req.body.planDate, 20),
        goals: normalizeText(req.body.goals, 10000), needs: normalizeText(req.body.needs, 10000),
        needSources: Array.isArray(req.body.needSources)
          ? [...new Set(req.body.needSources.map((source) => String(source)).filter((source) => allowedNeedSources.has(source)))]
          : [],
        otherNeedSource: normalizeText(req.body.otherNeedSource, 500),
        plannedActivities: Array.isArray(req.body.plannedActivities)
          ? req.body.plannedActivities.slice(0, 50).map((activity) => ({
              id: normalizeText(activity?.id, 150) || makeId("EDA"),
              topic: normalizeText(typeof activity === "string" ? activity : activity?.topic || activity?.title, 500),
              title: normalizeText(typeof activity === "string" ? activity : activity?.topic || activity?.title, 500),
              accreditationNumber: normalizeText(activity?.accreditationNumber, 300),
              format: allowedFormats.has(activity?.format) ? activity.format : "course",
              plannedDate: normalizeText(activity?.plannedDate, 30),
              hours: nonnegativeNumber(activity?.hours, 0),
              estimatedCost: nonnegativeNumber(activity?.estimatedCost, 0),
              status: allowedActivityStatuses.has(activity?.status) ? activity.status : "planned",
            })).filter((activity) => activity.topic)
          : [],
        professionalDevelopment: "",
        evaluation: normalizeText(req.body.evaluation, 10000),
        evaluationNotCompleted: normalizeText(req.body.evaluationNotCompleted, 10000),
        nextYearUpdate: normalizeText(req.body.nextYearUpdate, 10000),
        evaluationDate: normalizeText(req.body.evaluationDate, 20),
        status: requestedStatus,
        updatedAt: timestamp, createdAt: item?.createdAt || timestamp,
      };
      const activityIds = next.plannedActivities.map((activity) => activity.id);
      if (new Set(activityIds).size !== activityIds.length) throw new Error("Položky vzdělávacího plánu nejsou jednoznačné. Obnovte stránku a zkuste to znovu.");
      const removedLinkedActivity = db.educationRecords.find((record) => record.employeeId === employee.id && record.plannedActivityId && !activityIds.includes(record.plannedActivityId));
      if (removedLinkedActivity) throw new Error(`Položku plánu nelze odstranit, protože je propojena se vzděláváním „${removedLinkedActivity.title}“. Nejprve záznam odpojte.`);
      for (const activity of next.plannedActivities) {
        if (db.educationRecords.some((record) => record.plannedActivityId === activity.id)) activity.status = "completed";
      }
      if (requestedStatus !== "draft") {
        if (employee.appRole !== "director" && !employeeEvaluation) {
          throw new Error("Před schválením nebo předáním plánu nejprve uzavřete hodnocení zaměstnance za stejný rok.");
        }
        if (!next.planDate || !next.goals || !next.needSources.length || !next.plannedActivities.length) {
          throw new Error("Před schválením nebo předáním vyplňte datum sestavení, rozvojové potřeby, jejich zdroj a alespoň jednu plánovanou aktivitu.");
        }
        if (next.plannedActivities.some((activity) => !activity.plannedDate || activity.hours <= 0)) {
          throw new Error("U každé plánované aktivity vyplňte předpokládané čtvrtletí a rozsah hodin.");
        }
      }
      if (requestedStatus === "approved") {
        next.approvedAt = timestamp;
        next.approvedBy = req.auth.employee.id;
        next.approvedByName = req.auth.employee.name;
        next.approvedByRole = req.auth.employee.appRole;
      } else {
        next.approvedAt = "";
        next.approvedBy = "";
        next.approvedByName = "";
        next.approvedByRole = "";
      }
      if (requestedStatus === "submitted") {
        next.submittedAt = timestamp;
        next.submittedBy = req.auth.employee.id;
      } else if (requestedStatus === "draft") {
        next.submittedAt = "";
        next.submittedBy = "";
      }
      if (item) Object.assign(item, next); else { item = next; db.educationPlans.push(item); }
      if (employeeEvaluation) {
        employeeEvaluation.educationPlanId = item.id;
        employeeEvaluation.updatedAt = timestamp;
      }
      addAudit(db, req.auth.employee, "upsert", "educationPlan", item.id, { status: item.status });
      return { data: db, value: { plan: item, employeeEvaluation } };
    });
    const [sync, evaluationSync] = await Promise.all([
      syncRecordSafe("educationPlan", result.plan),
      result.employeeEvaluation ? syncRecordSafe("employeeEvaluation", result.employeeEvaluation) : Promise.resolve(null),
    ]);
    res.json({ plan: result.plan, sync, evaluationSync });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.delete("/api/education-plans/:id", requireAuth, directorOnly, async (req, res) => {
  try {
    const result = await mutateDb(async (db) => {
      const index = db.educationPlans.findIndex((item) => item.id === req.params.id);
      if (index < 0) {
        const missing = new Error("Vzdělávací plán nebyl nalezen.");
        missing.status = 404;
        throw missing;
      }
      const [plan] = db.educationPlans.splice(index, 1);
      const unlinkedRecords = db.educationRecords.filter((record) => record.educationPlanId === plan.id);
      for (const record of unlinkedRecords) {
        record.educationPlanId = "";
        record.plannedActivityId = "";
        record.plannedActivityTitle = "";
        record.updatedAt = now();
      }
      addAudit(db, req.auth.employee, "delete", "educationPlan", plan.id, { unlinkedEducationRecords: unlinkedRecords.length });
      return { data: db, value: { plan, unlinkedRecords } };
    });
    const [sheet, recordSync] = await Promise.all([
      deleteRecordSafe("educationPlan", result.plan.id),
      Promise.all(result.unlinkedRecords.map((record) => syncRecordSafe("educationRecord", record))),
    ]);
    res.json({ deleted: true, id: result.plan.id, unlinkedEducationRecords: result.unlinkedRecords.length, sheet, recordSync });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.post("/api/education-records", requireAuth, leaderOnly, upload.single("certificate"), async (req, res) => {
  try {
    const { calculateInclusiveEducationHours } = await getTimeRange();
    const leader = isLeaderRole(req.auth.employee.appRole);
    const targetEmployeeId = leader && req.body.employeeId ? req.body.employeeId : req.auth.employee.id;
    let certificate = null;
    if (req.file) {
      if (req.file.size > 15 * 1024 * 1024) throw new Error("Osvědčení může mít nejvýše 15 MB.");
      const extension = path.extname(req.file.originalname).toLowerCase();
      const allowedTypes = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
      };
      if (!allowedTypes[extension]) throw new Error("Osvědčení nahrajte jako PDF, JPG nebo PNG.");
      certificate = {
        buffer: req.file.buffer,
        extension,
        mimeType: allowedTypes[extension],
        originalName: normalizeText(req.file.originalname, 300),
        hash: fileHash(req.file.buffer),
      };
    }
    const result = await mutateDb(async (db) => {
      const employee = db.employees.find((item) => item.id === targetEmployeeId);
      if (!employee) throw new Error("Pracovník nebyl nalezen.");
      if (!canManageEducationPlan(req.auth.employee, employee)) {
        const denied = new Error("Vzdělávání tohoto pracovníka nemůžete upravovat.");
        denied.status = 403;
        throw denied;
      }
      const dateFrom = normalizeText(req.body.dateFrom, 20);
      const dateTo = normalizeText(req.body.dateTo, 20);
      const timeFrom = normalizeText(req.body.timeFrom, 10);
      const timeTo = normalizeText(req.body.timeTo, 10);
      const hours = calculateInclusiveEducationHours({ dateFrom, dateTo, timeFrom, timeTo });
      const plannedActivityId = normalizeText(req.body.plannedActivityId, 150);
      const educationPlan = plannedActivityId
        ? db.educationPlans.find((plan) => plan.employeeId === employee.id && plan.year === Number(dateFrom.slice(0, 4)) && (plan.plannedActivities || []).some((activity) => activity.id === plannedActivityId))
        : null;
      const plannedActivity = educationPlan?.plannedActivities.find((activity) => activity.id === plannedActivityId);
      if (plannedActivityId && !plannedActivity) throw new Error("Vybraná položka vzdělávacího plánu nebyla nalezena pro daného pracovníka a rok.");
      const title = normalizeText(req.body.title, 300);
      if (!dateFrom || !dateTo || !timeFrom || !timeTo || !title || hours <= 0) {
        throw new Error("Vyplňte datum od–do, čas od–do a název vzdělávání. Čas konce musí být později než začátek.");
      }
      if (certificate) {
        const duplicate = findDuplicateByFileHash(db.educationRecords, certificate.hash);
        if (duplicate) {
          const conflict = new Error(`Toto osvědčení už bylo nahráno u vzdělávání „${duplicate.title}“ pracovníka ${duplicate.employeeName}.`);
          conflict.status = 409;
          throw conflict;
        }
      }
      let uploaded = { uploaded: false, reason: "no-file" };
      let localFilePath = "";
      if (certificate) {
        const driveName = `${dateFrom}__${safeName(employee.name)}__${safeName(title)}__osvedceni${certificate.extension}`;
        uploaded = await googleWorkspace.uploadFile({
          name: driveName,
          mimeType: certificate.mimeType,
          buffer: certificate.buffer,
          pathSegments: [String(dateFrom.slice(0, 4)), "Vzdelavani", employee.name],
        });
        if (!uploaded.uploaded) {
          const directory = path.join(path.dirname(DB_PATH), "education-certificates", String(dateFrom.slice(0, 4)));
          await fs.mkdir(directory, { recursive: true });
          localFilePath = path.join(directory, `${makeId("CERT")}${certificate.extension}`);
          await fs.writeFile(localFilePath, certificate.buffer);
        }
      }
      const item = {
        id: makeId("EDU"), employeeId: employee.id, employeeName: employee.name,
        date: dateFrom, dateFrom, dateTo, timeFrom, timeTo, title,
        provider: normalizeText(req.body.provider, 300), format: req.body.format === "Online" ? "Online" : "Prezenční",
        hours, accreditation: normalizeText(req.body.accreditation, 200),
        certificateFileName: certificate?.originalName || "",
        certificateMimeType: certificate?.mimeType || "",
        fileHash: certificate?.hash || "",
        driveFileId: uploaded.id || "",
        driveFileUrl: uploaded.webViewLink || "",
        localFilePath,
        createdAt: now(),
        educationPlanId: educationPlan?.id || "", plannedActivityId: plannedActivity?.id || "",
        plannedActivityTitle: plannedActivity?.topic || plannedActivity?.title || "",
      };
      db.educationRecords.push(item);
      if (plannedActivity) {
        plannedActivity.status = "completed";
        educationPlan.updatedAt = now();
      }
      addAudit(db, req.auth.employee, "create", "educationRecord", item.id);
      return { data: db, value: { record: item, plan: educationPlan } };
    });
    const sync = await syncRecordSafe("educationRecord", result.record);
    const planSync = result.plan ? await syncRecordSafe("educationPlan", result.plan) : null;
    res.status(201).json({ record: result.record, sync, planSync });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.get("/api/education-records/:id/certificate", requireAuth, async (req, res) => {
  try {
    const db = await readDb();
    const record = db.educationRecords.find((item) => item.id === req.params.id);
    if (!record) return res.status(404).json({ error: "Záznam vzdělávání nebyl nalezen." });
    const employee = db.employees.find((item) => item.id === record.employeeId);
    const canPreview = record.employeeId === req.auth.employee.id
      || isAdminRole(req.auth.employee.appRole)
      || canManageEducationPlan(req.auth.employee, employee);
    if (!canPreview) return res.status(403).json({ error: "Toto osvědčení nemáte oprávnění zobrazit." });

    let buffer;
    if (record.driveFileId) {
      buffer = await googleWorkspace.downloadFile(record.driveFileId);
    } else if (record.localFilePath) {
      const dataRoot = path.resolve(path.dirname(DB_PATH));
      const filePath = path.resolve(record.localFilePath);
      if (filePath !== dataRoot && !filePath.startsWith(`${dataRoot}${path.sep}`)) {
        return res.status(403).json({ error: "Uložený soubor je mimo datovou složku aplikace." });
      }
      buffer = await fs.readFile(filePath);
    } else {
      return res.status(404).json({ error: "K tomuto vzdělávání není nahrané osvědčení." });
    }

    const fallbackExtension = record.certificateMimeType === "application/pdf" ? ".pdf" : record.certificateMimeType === "image/png" ? ".png" : ".jpg";
    const fileName = exportName(path.parse(record.certificateFileName || "osvedceni").name) || "osvedceni";
    res.setHeader("Content-Type", record.certificateMimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}${path.extname(record.certificateFileName || "") || fallbackExtension}"`);
    res.setHeader("Content-Length", String(buffer.length));
    return res.send(buffer);
  } catch (error) {
    return res.status(502).json({ error: "Osvědčení se nepodařilo načíst.", details: error.message });
  }
});

app.patch("/api/education-records/:id/link", requireAuth, leaderOnly, async (req, res) => {
  try {
    const plannedActivityId = normalizeText(req.body.plannedActivityId, 150);
    const result = await mutateDb(async (db) => {
      const record = db.educationRecords.find((item) => item.id === req.params.id);
      if (!record) {
        const missing = new Error("Záznam vzdělávání nebyl nalezen.");
        missing.status = 404;
        throw missing;
      }
      const employee = db.employees.find((item) => item.id === record.employeeId);
      if (!canManageEducationPlan(req.auth.employee, employee)) {
        const denied = new Error("Vzdělávání tohoto pracovníka nemůžete upravovat.");
        denied.status = 403;
        throw denied;
      }
      const year = Number(String(record.dateFrom || record.date || "").slice(0, 4));
      const oldPlan = db.educationPlans.find((plan) => plan.id === record.educationPlanId);
      const oldActivityId = record.plannedActivityId || "";
      const nextPlan = plannedActivityId
        ? db.educationPlans.find((plan) => plan.employeeId === record.employeeId && plan.year === year && (plan.plannedActivities || []).some((activity) => activity.id === plannedActivityId))
        : null;
      const nextActivity = nextPlan?.plannedActivities.find((activity) => activity.id === plannedActivityId);
      if (plannedActivityId && !nextActivity) throw new Error("Vybraná položka plánu nepatří tomuto pracovníkovi nebo roku vzdělávání.");
      record.educationPlanId = nextPlan?.id || "";
      record.plannedActivityId = nextActivity?.id || "";
      record.plannedActivityTitle = nextActivity?.topic || nextActivity?.title || "";
      record.updatedAt = now();
      const touchedPlans = [...new Set([oldPlan, nextPlan].filter(Boolean))];
      for (const plan of touchedPlans) {
        for (const activity of plan.plannedActivities || []) {
          if (![oldActivityId, plannedActivityId].includes(activity.id)) continue;
          activity.status = db.educationRecords.some((item) => item.plannedActivityId === activity.id) ? "completed" : "planned";
        }
        plan.updatedAt = now();
      }
      addAudit(db, req.auth.employee, "link", "educationRecord", record.id, { plannedActivityId });
      return { data: db, value: { record, plans: touchedPlans } };
    });
    const sync = await syncRecordSafe("educationRecord", result.record);
    const planSync = await Promise.all(result.plans.map((plan) => syncRecordSafe("educationPlan", plan)));
    res.json({ record: result.record, sync, planSync });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.delete("/api/education-records/:id", requireAuth, directorOnly, async (req, res) => {
  try {
    const result = await mutateDb(async (db) => {
      const index = db.educationRecords.findIndex((item) => item.id === req.params.id);
      if (index < 0) {
        const missing = new Error("Záznam vzdělávání nebyl nalezen.");
        missing.status = 404;
        throw missing;
      }
      const [record] = db.educationRecords.splice(index, 1);
      const plan = record.educationPlanId
        ? db.educationPlans.find((item) => item.id === record.educationPlanId)
        : null;
      if (plan && record.plannedActivityId) {
        const activity = (plan.plannedActivities || []).find((item) => item.id === record.plannedActivityId);
        if (activity) {
          activity.status = db.educationRecords.some((item) => item.plannedActivityId === activity.id) ? "completed" : "planned";
          plan.updatedAt = now();
        }
      }
      addAudit(db, req.auth.employee, "delete", "educationRecord", record.id, { educationPlanId: record.educationPlanId || "" });
      return { data: db, value: { record, plan } };
    });
    const [sheet, drive, planSync] = await Promise.all([
      deleteRecordSafe("educationRecord", result.record.id),
      trashFileSafe(result.record.driveFileId),
      result.plan ? syncRecordSafe("educationPlan", result.plan) : Promise.resolve(null),
    ]);
    res.json({ deleted: true, id: result.record.id, sheet, drive, planSync });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.post("/api/supervisions", requireAuth, leaderOnly, async (req, res) => {
  try {
    const { calculateTimeRangeHours } = await getTimeRange();
    const record = await mutateDb(async (db) => {
      const requestedIds = Array.isArray(req.body.participantIds) ? req.body.participantIds : [];
      const participantIds = isLeaderRole(req.auth.employee.appRole) ? requestedIds : [req.auth.employee.id];
      const participants = db.employees.filter((item) => participantIds.includes(item.id));
      const timeFrom = normalizeText(req.body.timeFrom, 10);
      const timeTo = normalizeText(req.body.timeTo, 10);
      const hours = calculateTimeRangeHours(timeFrom, timeTo);
      const item = {
        id: makeId("SUP"), date: normalizeText(req.body.date, 20),
        type: ["individual", "team"].includes(req.body.type) ? req.body.type : "team",
        supervisor: normalizeText(req.body.supervisor, 200), timeFrom, timeTo, hours,
        participantIds: participants.map((item) => item.id), participantNames: participants.map((item) => item.name),
        createdBy: req.auth.employee.id, createdByName: req.auth.employee.name, createdAt: now(),
      };
      if (!item.date || !item.supervisor || !item.timeFrom || !item.timeTo || item.hours <= 0 || !item.participantIds.length) {
        throw new Error("Vyplňte datum, čas od–do, supervizora a účastníky. Čas konce musí být později než začátek.");
      }
      db.supervisions.push(item);
      addAudit(db, req.auth.employee, "create", "supervision", item.id);
      return { data: db, value: item };
    });
    const sync = await syncRecordSafe("supervision", record);
    res.status(201).json({ record, sync });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.delete("/api/supervisions/:id", requireAuth, directorOnly, deleteSimpleRecordHandler({
  collection: "supervisions", type: "supervision", label: "Záznam supervize",
}));

app.post("/api/meetings", requireAuth, leaderOnly, async (req, res) => {
  try {
    const result = await mutateDb(async (db) => {
      const participants = db.employees.filter((item) => (req.body.participantIds || []).includes(item.id));
      const externalParticipantNames = normalizeExternalParticipants(req.body.externalParticipantNames, participants);
      const date = normalizeText(req.body.date, 20);
      const taskResult = applyMeetingTaskContinuity(db, {
        date,
        tasks: req.body.tasks,
        followUpTasks: req.body.followUpTasks,
        externalParticipantNames,
      });
      const item = {
        id: makeId("MTG"), date, title: "Porada",
        location: "", participantIds: participants.map((item) => item.id),
        externalParticipantNames,
        participantNames: [...participants.map((item) => item.name), ...externalParticipantNames], agenda: "",
        notes: normalizeText(req.body.content || req.body.notes, 40000), decisions: "",
        tasks: taskResult.tasks,
        followUpTaskRefs: taskResult.followUpTaskRefs,
        status: req.body.status === "submitted" ? "submitted" : "draft",
        createdBy: req.auth.employee.id, createdByName: req.auth.employee.name,
        createdAt: now(), updatedAt: now(),
      };
      if (!item.date || !item.notes) throw new Error("Datum a zápis z porady jsou povinné.");
      db.meetings.push(item);
      addAudit(db, req.auth.employee, "create", "meeting", item.id);
      return { data: db, value: {
        meeting: { ...item, followUpTasks: resolveMeetingFollowUpTasks(db, item) },
        affectedMeetings: taskResult.affectedMeetings,
        mergedTaskCount: taskResult.mergedCount,
      } };
    });
    const sync = await syncRecordSafe("meeting", result.meeting);
    const followUpSync = await Promise.all(result.affectedMeetings.map((meeting) => syncRecordSafe("meeting", meeting)));
    res.status(201).json({ meeting: result.meeting, mergedTaskCount: result.mergedTaskCount, sync, followUpSync });
    if (result.meeting.status !== "draft") {
      const ownerIds = [...new Set((result.meeting.tasks || []).flatMap(meetingTaskOwnerIds))];
      void sendPushToEmployees(ownerIds, {
        title: "Nový úkol z porady",
        body: `V zápisu z ${result.meeting.date} máte přiřazený nový úkol.`,
        url: "/?open=meetings",
        tag: `meeting-task-${result.meeting.id}`,
      }).catch((error) => console.error("Meeting task notification failed:", error.message));
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.patch("/api/meetings/:id", requireAuth, leaderOnly, async (req, res) => {
  try {
    const result = await mutateDb(async (db) => {
      const item = db.meetings.find((entry) => entry.id === req.params.id);
      if (!item) {
        const missing = new Error("Porada nebyla nalezena.");
        missing.status = 404;
        throw missing;
      }
      if (item.status === "archived" && !isAdminRole(req.auth.employee.appRole)) {
        const archived = new Error("Hotový zápis smí zpětně upravit pouze Vedoucí služby/programu.");
        archived.status = 403;
        throw archived;
      }
      if (!isAdminRole(req.auth.employee.appRole) && item.createdBy !== req.auth.employee.id) {
        const forbidden = new Error("Tento koncept může upravit pouze jeho autor nebo Vedoucí služby/programu.");
        forbidden.status = 403;
        throw forbidden;
      }

      const participants = db.employees.filter((employee) => (req.body.participantIds || []).includes(employee.id));
      const externalParticipantNames = normalizeExternalParticipants(req.body.externalParticipantNames, participants);
      const date = normalizeText(req.body.date, 20);
      const notes = normalizeText(req.body.content || req.body.notes, 40000);
      if (!date || !notes) throw new Error("Datum a zápis z porady jsou povinné.");
      const taskResult = applyMeetingTaskContinuity(db, {
        currentMeeting: item,
        date,
        tasks: req.body.tasks,
        followUpTasks: Array.isArray(req.body.followUpTasks) ? req.body.followUpTasks : resolveMeetingFollowUpTasks(db, item),
        externalParticipantNames,
      });

      item.date = date;
      item.participantIds = participants.map((employee) => employee.id);
      item.externalParticipantNames = externalParticipantNames;
      item.participantNames = [...participants.map((employee) => employee.name), ...externalParticipantNames];
      item.notes = notes;
      item.tasks = taskResult.tasks;
      item.followUpTaskRefs = taskResult.followUpTaskRefs;
      item.status = req.body.status === "submitted" ? "submitted" : "draft";
      item.updatedAt = now();
      addAudit(db, req.auth.employee, "update", "meeting", item.id);
      return { data: db, value: {
        meeting: { ...item, followUpTasks: resolveMeetingFollowUpTasks(db, item) },
        affectedMeetings: taskResult.affectedMeetings,
        mergedTaskCount: taskResult.mergedCount,
      } };
    });
    const sync = await syncRecordSafe("meeting", result.meeting);
    const followUpSync = await Promise.all(result.affectedMeetings.map((meeting) => syncRecordSafe("meeting", meeting)));
    res.json({ meeting: result.meeting, mergedTaskCount: result.mergedTaskCount, sync, followUpSync });
    if (result.meeting.status !== "draft") {
      const ownerIds = [...new Set((result.meeting.tasks || []).flatMap(meetingTaskOwnerIds))];
      void sendPushToEmployees(ownerIds, {
        title: "Úkoly z porady byly aktualizovány",
        body: `Zkontrolujte své úkoly ze zápisu z ${result.meeting.date}.`,
        url: "/?open=meetings",
        tag: `meeting-task-${result.meeting.id}`,
      }).catch((error) => console.error("Meeting task notification failed:", error.message));
    }
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.patch("/api/meetings/:meetingId/tasks/:taskId/complete", requireAuth, async (req, res) => {
  try {
    const completionText = normalizeText(req.body?.completionText, 5000);
    const requestedRecipientIds = Array.isArray(req.body?.recipientIds)
      ? [...new Set(req.body.recipientIds.map((id) => normalizeText(id, 100)).filter(Boolean))]
      : [];
    if (!completionText) return res.status(400).json({ error: "Napište stručné řešení úkolu." });
    if (!requestedRecipientIds.length) return res.status(400).json({ error: "Vyberte alespoň jednoho příjemce řešení." });

    const result = await mutateDb(async (db) => {
      const meeting = db.meetings.find((item) => item.id === req.params.meetingId);
      if (!meeting) {
        const missing = new Error("Porada nebyla nalezena.");
        missing.status = 404;
        throw missing;
      }
      if (meeting.status === "draft") {
        const invalidState = new Error("Úkol lze splnit až po dokončení zápisu z porady.");
        invalidState.status = 409;
        throw invalidState;
      }
      const task = (meeting.tasks || []).find((item) => item.id === req.params.taskId);
      if (!task) {
        const missing = new Error("Úkol nebyl nalezen.");
        missing.status = 404;
        throw missing;
      }
      if (!meetingTaskOwnerIds(task).includes(req.auth.employee.id) && !isAdminRole(req.auth.employee.appRole)) {
        const forbidden = new Error("Tento úkol může splnit pouze odpovědná osoba.");
        forbidden.status = 403;
        throw forbidden;
      }
      if (task.status === "completed") {
        const conflict = new Error("Úkol už byl označen jako splněný.");
        conflict.status = 409;
        throw conflict;
      }
      const recipients = db.employees.filter((employee) => employee.active !== false && requestedRecipientIds.includes(employee.id));
      if (recipients.length !== requestedRecipientIds.length) throw new Error("Některého z vybraných příjemců se nepodařilo najít.");
      const timestamp = now();
      Object.assign(task, {
        status: "completed",
        completionText,
        completionRecipientIds: recipients.map((employee) => employee.id),
        completionRecipientNames: recipients.map((employee) => employee.name),
        completedAt: timestamp,
        completedBy: req.auth.employee.id,
        completedByName: req.auth.employee.name,
      });
      meeting.updatedAt = timestamp;
      addAudit(db, req.auth.employee, "complete_task", "meeting", meeting.id, { taskId: task.id, recipientIds: task.completionRecipientIds });
      return { data: db, value: { meeting, task } };
    });
    const sync = await syncRecordSafe("meeting", result.meeting);
    res.json({ task: result.task, meeting: result.meeting, sync });
    void sendPushToEmployees(result.task.completionRecipientIds, {
      title: "Úkol z porady byl splněn",
      body: `${result.task.completedByName} odeslal/a řešení úkolu: ${result.task.text}`,
      url: "/?open=meetings",
      tag: `meeting-task-completed-${result.task.id}`,
    }).catch((error) => console.error("Meeting task completion notification failed:", error.message));
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.delete("/api/meetings/:id", requireAuth, directorOnly, deleteSimpleRecordHandler({
  collection: "meetings", type: "meeting", label: "Zápis z porady",
}));

app.post("/api/ai/meeting-minutes", requireAuth, leaderOnly, async (req, res) => {
  try {
    const result = await callGemini({
      promptText: `Datum porady: ${normalizeText(req.body.date, 30)}\nNeuspořádaný text porady:\n${normalizeText(req.body.content || req.body.notes, 40000)}`,
      systemInstruction: "Jsi přesný zapisovatel pracovních porad. Z dodaného textu vytvoř přehledný, věcný zápis v češtině a samostatně vytěž úkoly. V zápisu zachovej důležité body, rozhodnutí a závěry. U úkolů uveď odpovědnou osobu a termín pouze tehdy, jsou-li ve vstupu uvedeny. Každý termín vrať výhradně ve formátu RRRR-MM-DD. Nevymýšlej fakta, jména ani termíny; nejasnosti uveď ke kontrole.",
      responseSchema: {
        type: "OBJECT",
        properties: {
          minutes: { type: "STRING" },
          tasks: { type: "ARRAY", items: { type: "OBJECT", properties: { text: { type: "STRING" }, owner: { type: "STRING" }, deadline: { type: "STRING" } }, required: ["text", "owner", "deadline"] } },
          reviewNotes: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["minutes", "tasks", "reviewNotes"],
      },
    });
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: "Návrh zápisu se nepodařilo vytvořit.", details: error.message });
  }
});

app.post("/api/ai/meeting-import", requireAuth, leaderOnly, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Vyberte soubor se zápisem." });
    if (req.file.size > 18 * 1024 * 1024) return res.status(400).json({ error: "Soubor může mít nejvýše 18 MB." });
    const extension = path.extname(req.file.originalname).toLowerCase();
    const inlineMimeTypes = {
      ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg", ".webp": "image/webp",
    };
    let documentText = "";
    let inlineData = null;
    if (extension === ".docx") {
      const mammoth = require("mammoth");
      const extracted = await mammoth.extractRawText({ buffer: req.file.buffer });
      documentText = normalizeText(extracted.value, 60000);
    } else if (extension === ".txt") {
      documentText = normalizeText(req.file.buffer.toString("utf8"), 60000);
    } else if (inlineMimeTypes[extension]) {
      inlineData = { mimeType: inlineMimeTypes[extension], data: req.file.buffer.toString("base64") };
    } else {
      return res.status(400).json({ error: "Podporovány jsou soubory PDF, DOCX, TXT, PNG, JPG a WEBP." });
    }
    if (!inlineData && !documentText) return res.status(400).json({ error: "V dokumentu se nepodařilo najít čitelný text." });

    const result = await callGemini({
      model: process.env.GEMINI_DOCUMENT_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash",
      promptText: `Převeď přiložený zápis z porady do strukturovaných polí aplikace. Název souboru: ${normalizeText(req.file.originalname, 300)}.${documentText ? `\n\nText dokumentu:\n${documentText}` : ""}`,
      inlineData,
      systemInstruction: "Jsi přesný přepisovatel zápisů pracovních porad. Z dokumentu vytěž pouze výslovně uvedené údaje. Nic nevymýšlej. Datum porady i každý termín úkolu vrať jako RRRR-MM-DD, chybějící údaje ponech prázdné a nejasnosti uveď ke kontrole. Zápis zachovej věcně a bez zbytečného zkrácení.",
      responseSchema: {
        type: "OBJECT",
        properties: {
          date: { type: "STRING" },
          participantNames: { type: "ARRAY", items: { type: "STRING" } },
          minutes: { type: "STRING" },
          tasks: { type: "ARRAY", items: { type: "OBJECT", properties: { text: { type: "STRING" }, owner: { type: "STRING" }, deadline: { type: "STRING" } }, required: ["text", "owner", "deadline"] } },
          reviewNotes: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["date", "participantNames", "minutes", "tasks", "reviewNotes"],
      },
    });
    const db = await readDb();
    const normalizedNames = (result.participantNames || []).map((name) => slugify(name).replace(/^(mgr|bc|ing|mudr|phdr|judr|doc|prof)-/, ""));
    const matchedParticipants = db.employees.filter((employee) => {
      const employeeName = slugify(employee.name).replace(/^(mgr|bc|ing|mudr|phdr|judr|doc|prof)-/, "");
      return employee.active !== false && normalizedNames.some((name) => name === employeeName || name.endsWith(employeeName) || employeeName.endsWith(name));
    });
    res.json({
      ...result,
      participantIds: matchedParticipants.map((employee) => employee.id),
      matchedParticipantNames: matchedParticipants.map((employee) => employee.name),
      sourceFileName: req.file.originalname,
    });
  } catch (error) {
    res.status(502).json({ error: "Zápis se nepodařilo rozpoznat.", details: error.message });
  }
});

app.post("/api/ai/generate", requireAuth, async (req, res) => {
  try {
    const result = await callGemini({
      promptText: normalizeText(req.body?.promptText, 30000),
      systemInstruction: "Jsi asistent pro pracovní výkazy OPZ+. Vrať pouze činnosti dodané uživatelem a rozděl mezi ně hodiny; texty neměň a nové činnosti nepřidávej.",
      responseSchema: { type: "ARRAY", items: { type: "OBJECT", properties: { desc: { type: "STRING" }, hours: { type: "NUMBER" } }, required: ["desc", "hours"] } },
    });
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: "AI požadavek selhal.", details: error.message });
  }
});

app.post("/api/meetings/:id/pdf", requireAuth, leaderOnly, upload.single("file"), async (req, res) => {
  try {
    if (!req.file || req.file.mimetype !== "application/pdf") return res.status(400).json({ error: "Nahrajte PDF zápisu." });
    const db = await readDb();
    const meeting = db.meetings.find((item) => item.id === req.params.id);
    if (!meeting) return res.status(404).json({ error: "Porada nebyla nalezena." });
    if (!isLeaderRole(req.auth.employee.appRole) && meeting.createdBy !== req.auth.employee.id) return res.status(403).json({ error: "PDF této porady nemůžete uložit." });
    const uploaded = await googleWorkspace.uploadFile({
      name: `${meeting.date}__zapis_z_porady.pdf`, mimeType: "application/pdf", buffer: req.file.buffer,
      pathSegments: [String(new Date(meeting.date).getFullYear()), "Porady"],
    });
    let localFilePath = "";
    if (!uploaded.uploaded) {
      const directory = path.join(path.dirname(DB_PATH), "meeting-pdfs");
      await fs.mkdir(directory, { recursive: true });
      localFilePath = path.join(directory, `${meeting.id}.pdf`);
      await fs.writeFile(localFilePath, req.file.buffer);
    }
    const updated = await mutateDb(async (current) => {
      const item = current.meetings.find((entry) => entry.id === meeting.id);
      item.driveFileId = uploaded.id || "";
      item.driveFileUrl = uploaded.webViewLink || "";
      item.localFilePath = localFilePath;
      item.status = "archived";
      item.updatedAt = now();
      addAudit(current, req.auth.employee, "archive", "meeting", item.id);
      return { data: current, value: item };
    });
    const replacedDriveFile = uploaded.uploaded && meeting.driveFileId && meeting.driveFileId !== uploaded.id
      ? await trashFileSafe(meeting.driveFileId)
      : null;
    if (uploaded.uploaded && meeting.localFilePath) {
      await fs.rm(meeting.localFilePath, { force: true }).catch(() => undefined);
    }
    const sync = await syncRecordSafe("meeting", updated);
    res.json({ meeting: updated, upload: uploaded, replacedDriveFile, sync });
  } catch (error) {
    res.status(500).json({ error: "PDF zápisu se nepodařilo uložit.", details: error.message });
  }
});

app.post("/api/signed-reports/analyze", requireAuth, signedReportUploaderOnly, signedReportUpload.fields([
  { name: "bundles", maxCount: 50 },
  { name: "bundle", maxCount: 1 },
]), async (req, res) => {
  try {
    const files = [...(req.files?.bundles || []), ...(req.files?.bundle || [])];
    if (!files.length) return res.status(400).json({ error: "Vyberte alespoň jeden PDF nebo ZIP soubor." });
    if (files.reduce((sum, file) => sum + file.size, 0) > 200 * 1024 * 1024) {
      return res.status(400).json({ error: "Vybrané soubory mohou mít dohromady nejvýše 200 MB." });
    }
    if (files.some((file) => ![".pdf", ".zip"].includes(path.extname(file.originalname).toLowerCase()))) {
      return res.status(400).json({ error: "Podporovány jsou pouze PDF a ZIP soubory." });
    }
    const db = await readDb();
    const reports = signedUploadReports(db, req.auth.employee);
    const analysis = await analyzeBundles({
      files: files.map((file) => ({ buffer: file.buffer, originalName: file.originalname })),
      reports,
    });
    res.json({ ...analysis, expectedReports: reports });
  } catch (error) {
    res.status(400).json({ error: "Soubory se nepodařilo analyzovat.", details: error.message });
  }
});

app.post("/api/signed-reports/commit", requireAuth, signedReportUploaderOnly, async (req, res) => {
  let importDir = "";
  try {
    const db = await readDb();
    const mappings = Array.isArray(req.body?.mappings) ? req.body.mappings : [];
    if (!mappings.length) throw new Error("Nebyla potvrzena žádná stránka výkazu.");
    const knownIds = new Set(signedUploadReports(db, req.auth.employee).map((item) => item.id));
    if (mappings.some((item) => item.reportId && !knownIds.has(item.reportId))) throw new Error("Import odkazuje na neznámý výkaz.");
    const candidateIds = mappings.map((item) => String(item.candidateId || ""));
    if (new Set(candidateIds).size !== candidateIds.length) throw new Error("Jedna stránka importu byla přiřazena vícekrát.");
    const merged = await mergeMappedCandidates(req.body?.importId, mappings);
    importDir = merged.importDir;
    const prepared = merged.results.map((result) => ({ ...result, fileHash: fileHash(result.buffer) }));
    const batchHashes = new Set();
    for (const result of prepared) {
      if (batchHashes.has(result.fileHash)) {
        const conflict = new Error("Stejný podepsaný výkaz je v tomto nahrání zařazen vícekrát.");
        conflict.status = 409;
        throw conflict;
      }
      batchHashes.add(result.fileHash);
      const duplicate = findDuplicateByFileHash(db.workReports, result.fileHash);
      if (duplicate) {
        const conflict = new Error(`Tento podepsaný soubor už je uložen u výkazu ${duplicate.employeeName} · ${duplicate.positionName} · ${duplicate.month}/${duplicate.year}.`);
        conflict.status = 409;
        throw conflict;
      }
    }
    const archived = [];
    for (const result of prepared) {
      const report = db.workReports.find((item) => item.id === result.reportId);
      const filename = `${report.year}-${String(report.month).padStart(2, "0")}__${safeName(report.positionName)}__${safeName(report.employeeName)}__podepsano.pdf`;
      const uploaded = await googleWorkspace.uploadFile({
        name: filename, mimeType: "application/pdf", buffer: result.buffer,
        pathSegments: [String(report.year), "Pracovni vykazy", String(report.month).padStart(2, "0"), report.employeeName],
      });
      let localFilePath = "";
      if (!uploaded.uploaded) {
        const directory = path.join(path.dirname(DB_PATH), "signed-reports", String(report.year), String(report.month).padStart(2, "0"));
        await fs.mkdir(directory, { recursive: true });
        localFilePath = path.join(directory, `${report.id}.pdf`);
        await fs.writeFile(localFilePath, result.buffer);
      }
      const updated = await mutateDb(async (current) => {
        const item = current.workReports.find((entry) => entry.id === report.id);
        item.status = "signed_archived";
        item.driveFileId = uploaded.id || "";
        item.driveFileUrl = uploaded.webViewLink || "";
        item.localFilePath = localFilePath;
        item.fileHash = result.fileHash;
        item.signedAt = now();
        item.updatedAt = now();
        addAudit(current, req.auth.employee, "signed_archive", "workReport", item.id, { pages: result.pageCount });
        return { data: current, value: item };
      });
      await syncRecordSafe("workReport", updated);
      archived.push(updated);
    }
    await removeImport(merged.importDir);
    importDir = "";
    res.json({ reports: archived });
  } catch (error) {
    res.status(error.status || 400).json({ error: "Podepsané výkazy se nepodařilo uložit.", details: error.message });
  } finally {
    if (importDir) await removeImport(importDir).catch((error) => console.error("Temporary report import cleanup failed:", error));
  }
});

const DIST_PATH = path.join(__dirname, "dist");
const INDEX_HTML_PATH = path.join(DIST_PATH, "index.html");
app.use(express.static(DIST_PATH));
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  if (fsSync.existsSync(INDEX_HTML_PATH)) return res.sendFile(INDEX_HTML_PATH);
  return res.status(404).send("Frontend build nebyl nalezen. Spusťte nejdříve: npm run build");
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) return res.status(400).json({ error: "Nahraný soubor je příliš velký nebo neplatný.", details: error.message });
  console.error("Unhandled server error:", error);
  return res.status(500).json({ error: "Neočekávaná chyba serveru.", details: error.message });
});

async function startServer() {
  const sheets = await googleWorkspace.ensureSheets();
  if (sheets.ready) console.log(`Google Sheets ready: ${sheets.sheets.join(", ")}`);
  if (process.env.GOOGLE_SHEETS_PRIMARY === "true") {
    const database = await readPrimaryDatabase({ force: true });
    if (database.employees.length) {
      console.log(`Database refreshed from Google Sheets (${database.employees.length} employees).`);
    } else {
      console.log("Google Sheets snapshot is empty; initial application setup is required.");
    }
  }
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Database path: ${DB_PATH}`);
  });
}

startServer().catch((error) => {
  console.error("Application startup failed:", error);
  process.exitCode = 1;
});
