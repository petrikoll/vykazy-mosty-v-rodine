const { Readable } = require("node:stream");
const googleDriveOAuth = require("./googleDriveOAuth.cjs");

const SNAPSHOT_HEADER = "záznam JSON";

const SHEET_HEADERS = {
  "Pracovníci": [
    "id", "jméno", "aplikační role", "celkový úvazek", "aktivní", "pozice JSON",
    "vytvořeno", "aktualizováno", "PIN hash", SNAPSHOT_HEADER,
  ],
  "Výkazy": [
    "id", "submissionId", "employeeId", "employeeName", "období", "positionId",
    "pozice", "kód rozpočtu", "typ vztahu", "úvazek/hodiny", "odpracováno",
    "nepřítomnost", "stav", "předáno", "aktualizováno", "soubor na Disku", "činnosti JSON", "otisk souboru SHA-256", SNAPSHOT_HEADER,
  ],
  "Hodnocení zaměstnanců": [
    "id", "employeeId", "zaměstnanec", "rok", "datum hodnocení", "evaluatorId", "hodnotitel", "role hodnotitele",
    "vyhodnocení předchozích cílů", "silné stránky a kvalifikace", "rozvojové oblasti a potřeby kvalifikace",
    "profesní cíle JSON", "stav", "uzavřeno", "ID vzdělávacího plánu", "vytvořeno", "aktualizováno", SNAPSHOT_HEADER,
  ],
  "Vzdělávací plány": [
    "id", "employeeId", "employeeName", "rok", "cíle", "potřeby", "plánované aktivity JSON",
    "roční vyhodnocení", "aktualizace", "stav", "aktualizováno", "pracovní pozice",
    "služba / pracoviště", "nadřízený", "zdroje potřeb JSON", "jiný zdroj potřeby",
    "další profesní rozvoj", "co se neuskutečnilo", "datum sestavení", "datum vyhodnocení",
    "schválil/a", "role schvalujícího", "schváleno", "předpokládané náklady celkem", "ID hodnocení zaměstnance", SNAPSHOT_HEADER,
  ],
  "Vzdělávání": [
    "id", "employeeId", "employeeName", "datum od", "datum do", "čas od", "čas do",
    "název", "poskytovatel", "forma", "hodiny", "akreditace", "název osvědčení", "doklad na Disku", "vytvořeno",
    "ID vzdělávacího plánu", "ID položky plánu", "položka plánu", "otisk souboru SHA-256", SNAPSHOT_HEADER,
  ],
  "Supervize": [
    "id", "datum", "typ", "supervizor", "čas od", "čas do", "hodiny", "účastníci", "zapsal", "vytvořeno", SNAPSHOT_HEADER,
  ],
  "Porady": [
    "id", "datum", "název", "místo", "účastníci", "program", "rozhodnutí", "úkoly JSON",
    "stav", "PDF na Disku", "zapsal", "aktualizováno", "průběh / zápis", SNAPSHOT_HEADER,
  ],
  "Upozornění": [
    "id", "employeeId", "zaměstnanec", "koncový bod", "veřejný klíč zařízení",
    "ověřovací klíč zařízení", "vytvořeno", "aktualizováno", SNAPSHOT_HEADER,
  ],
  "Metodický spořič": [
    "id", "user_id", "zaměstnanec", "question_id", "timestamp", "selected_answer_id",
    "correct", "standard", "tema", "obtiznost", "kriticke_tema", "series_id",
    "verze banky", "verze metodiky", SNAPSHOT_HEADER,
  ],
};

let clientsPromise = null;
const sheetContextPromises = new Map();

function parseCredentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_BASE64) {
    return JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8"));
  }
  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };
  }
  return null;
}

function getStatus() {
  try {
    const credentials = parseCredentials();
    const oauthDrive = googleDriveOAuth.getStatus();
    const sheetsConfigured = Boolean(credentials && process.env.GOOGLE_SHEETS_ID);
    const serviceAccountDriveConfigured = Boolean(credentials && process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID);
    const driveConfigured = oauthDrive.connected || serviceAccountDriveConfigured;
    const rootFolderId = oauthDrive.connected
      ? oauthDrive.rootFolderId
      : process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || "";
    return {
      configured: sheetsConfigured,
      credentialsConfigured: Boolean(credentials),
      sheetsConfigured,
      driveConfigured,
      driveOAuthConfigured: oauthDrive.configured,
      driveConnected: oauthDrive.connected,
      driveMode: oauthDrive.connected ? "oauth" : serviceAccountDriveConfigured ? "service-account" : "",
      driveAccountEmail: oauthDrive.accountEmail,
      driveAllowedEmail: oauthDrive.allowedEmail,
      driveFolderUrl: oauthDrive.folderUrl,
      spreadsheetId: process.env.GOOGLE_SHEETS_ID || "",
      rootFolderId,
      error: "",
    };
  } catch (error) {
    return {
      configured: false,
      credentialsConfigured: false,
      sheetsConfigured: false,
      driveConfigured: false,
      driveOAuthConfigured: false,
      driveConnected: false,
      driveMode: "",
      driveAccountEmail: "",
      driveAllowedEmail: process.env.GOOGLE_DRIVE_ALLOWED_EMAIL || "",
      driveFolderUrl: "",
      spreadsheetId: process.env.GOOGLE_SHEETS_ID || "",
      rootFolderId: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || "",
      error: `Přihlašovací údaje Google nejsou platný JSON: ${error.message}`,
    };
  }
}

async function getClients() {
  if (clientsPromise) return clientsPromise;
  clientsPromise = (async () => {
    const credentials = parseCredentials();
    if (!credentials) throw new Error("Chybí přihlašovací údaje servisního účtu Google.");
    const { google } = require("googleapis");
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/spreadsheets",
      ],
    });
    return {
      drive: google.drive({ version: "v3", auth }),
      sheets: google.sheets({ version: "v4", auth }),
    };
  })();
  return clientsPromise;
}

function columnName(index) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function quoteSheetName(name) {
  return `'${String(name).replace(/'/g, "''")}'`;
}

async function createSheetContext(sheetName) {
  const status = getStatus();
  if (!status.sheetsConfigured) return null;
  const { sheets } = await getClients();
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId: status.spreadsheetId,
    fields: "sheets.properties",
  });
  const existing = metadata.data.sheets?.find((sheet) => sheet.properties?.title === sheetName);
  let sheetId = existing?.properties?.sheetId;
  if (sheetId === undefined) {
    const created = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: status.spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
    });
    sheetId = created.data.replies?.[0]?.addSheet?.properties?.sheetId;
  }

  const headers = SHEET_HEADERS[sheetName];
  if (!headers) throw new Error(`Neznámý cílový list: ${sheetName}`);
  const endColumn = columnName(headers.length - 1);
  const headerRange = `${quoteSheetName(sheetName)}!A1:${endColumn}1`;
  const current = await sheets.spreadsheets.values.get({
    spreadsheetId: status.spreadsheetId,
    range: headerRange,
  });
  const currentHeaders = current.data.values?.[0] || [];
  const headersChanged = headers.some((header, index) => currentHeaders[index] !== header) || currentHeaders.length !== headers.length;
  if (headersChanged) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: status.spreadsheetId,
      range: headerRange,
      valueInputOption: "RAW",
      requestBody: { values: [headers] },
    });
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: status.spreadsheetId,
      requestBody: {
        requests: [{
          updateDimensionProperties: {
            range: { sheetId, dimension: "COLUMNS", startIndex: headers.length - 1, endIndex: headers.length },
            properties: { hiddenByUser: true },
            fields: "hiddenByUser",
          },
        }],
      },
    });
  }
  if (!currentHeaders.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: status.spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.12, green: 0.23, blue: 0.54 },
                  textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
                },
              },
              fields: "userEnteredFormat(backgroundColor,textFormat)",
            },
          },
          { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
        ],
      },
    });
  }
  return { sheets, status, headers, endColumn, sheetId };
}

async function ensureSheet(sheetName) {
  if (!getStatus().sheetsConfigured) return null;
  if (!sheetContextPromises.has(sheetName)) {
    const pending = createSheetContext(sheetName).catch((error) => {
      sheetContextPromises.delete(sheetName);
      throw error;
    });
    sheetContextPromises.set(sheetName, pending);
  }
  return sheetContextPromises.get(sheetName);
}

async function upsertRow(sheetName, record, valueMapper) {
  const context = await ensureSheet(sheetName);
  if (!context) return { synced: false, reason: "not-configured" };
  const { sheets, status, headers, endColumn } = context;
  const ids = await sheets.spreadsheets.values.get({
    spreadsheetId: status.spreadsheetId,
    range: `${quoteSheetName(sheetName)}!A2:A`,
  });
  const rowIndex = (ids.data.values || []).findIndex((row) => row[0] === record.id);
  const targetRow = rowIndex >= 0 ? rowIndex + 2 : (ids.data.values || []).length + 2;
  const baseValues = valueMapper(record);
  const values = headers.at(-1) === SNAPSHOT_HEADER
    ? [...baseValues, JSON.stringify(record)]
    : baseValues;
  if (values.length !== headers.length) {
    throw new Error(`Počet hodnot pro ${sheetName} neodpovídá záhlaví.`);
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: status.spreadsheetId,
    range: `${quoteSheetName(sheetName)}!A${targetRow}:${endColumn}${targetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
  return { synced: true, row: targetRow };
}

function valuesForRecord(type, record) {
  switch (type) {
    case "employee":
      return [
        record.id, record.name, record.appRole, record.globalFte, record.active !== false,
        JSON.stringify(record.assignments || []), record.createdAt, record.updatedAt,
        record.pinHash || "",
      ];
    case "workReport":
      return [
        record.id, record.submissionId, record.employeeId, record.employeeName,
        `${record.year}-${String(record.month).padStart(2, "0")}`, record.positionId,
        record.positionName, record.budgetCode, record.contractType,
        record.allocationLabel, record.workedHours, record.absenceHours, record.status,
        record.submittedAt, record.updatedAt, record.driveFileUrl || "", JSON.stringify(record.activities || []), record.fileHash || "",
      ];
    case "employeeEvaluation":
      return [
        record.id, record.employeeId, record.employeeName, record.year, record.evaluationDate || "",
        record.evaluatorId || "", record.evaluatorName || "", record.evaluatorRole || "",
        record.previousGoalsEvaluation || "", record.strengths || "", record.developmentNeeds || "",
        JSON.stringify(record.professionalGoals || []), record.status || "draft", record.closedAt || "",
        record.educationPlanId || "", record.createdAt || "", record.updatedAt || "",
      ];
    case "educationPlan":
      return [
        record.id, record.employeeId, record.employeeName, record.year, record.goals, record.needs,
        JSON.stringify(record.plannedActivities || []), record.evaluation, record.nextYearUpdate,
        record.status, record.updatedAt, (record.positionNames || []).join(", "), record.serviceName || "",
        record.supervisorName || "", JSON.stringify(record.needSources || []), record.otherNeedSource || "",
        record.professionalDevelopment || "", record.evaluationNotCompleted || "", record.planDate || "",
        record.evaluationDate || "", record.approvedByName || "", record.approvedByRole || "",
        record.approvedAt || "", (record.plannedActivities || []).reduce((sum, activity) => sum + Number(activity.estimatedCost || 0), 0),
        record.employeeEvaluationId || "",
      ];
    case "educationRecord":
      return [record.id, record.employeeId, record.employeeName, record.dateFrom || record.date, record.dateTo || record.date, record.timeFrom || "", record.timeTo || "", record.title, record.provider, record.format, record.hours, record.accreditation, record.certificateFileName || "", record.driveFileUrl || "", record.createdAt, record.educationPlanId || "", record.plannedActivityId || "", record.plannedActivityTitle || "", record.fileHash || ""];
    case "supervision":
      return [record.id, record.date, record.type === "group" ? "team" : record.type, record.supervisor, record.timeFrom || "", record.timeTo || "", record.hours, (record.participantNames || []).join(", "), record.createdByName, record.createdAt];
    case "meeting":
      return [record.id, record.date, record.title, record.location, (record.participantNames || []).join(", "), record.agenda, record.decisions, JSON.stringify(record.tasks || []), record.status, record.driveFileUrl || "", record.createdByName, record.updatedAt, record.notes || ""];
    case "pushSubscription":
      return [record.id, record.employeeId, record.employeeName, record.endpoint, record.keys?.p256dh || "", record.keys?.auth || "", record.createdAt, record.updatedAt];
    case "methodologyAnswer":
      return [record.id, record.employeeId, record.employeeName, record.questionId, record.timestamp, record.selectedAnswerId, record.correct, record.standard, record.topic, record.difficulty, record.critical, record.seriesId, record.bankVersion || "", record.methodologyVersion || ""];
    default:
      throw new Error(`Neznámý typ záznamu: ${type}`);
  }
}

const TYPE_TO_SHEET = {
  employee: "Pracovníci",
  workReport: "Výkazy",
  employeeEvaluation: "Hodnocení zaměstnanců",
  educationPlan: "Vzdělávací plány",
  educationRecord: "Vzdělávání",
  supervision: "Supervize",
  meeting: "Porady",
  pushSubscription: "Upozornění",
  methodologyAnswer: "Metodický spořič",
};

const TYPE_TO_COLLECTION = {
  employee: "employees",
  workReport: "workReports",
  employeeEvaluation: "employeeEvaluations",
  educationPlan: "educationPlans",
  educationRecord: "educationRecords",
  supervision: "supervisions",
  meeting: "meetings",
  pushSubscription: "pushSubscriptions",
  methodologyAnswer: "methodologyAnswers",
};

async function syncRecord(type, record) {
  const sheetName = TYPE_TO_SHEET[type];
  if (!sheetName) throw new Error(`Neznámý typ synchronizace: ${type}`);
  return upsertRow(sheetName, record, (item) => valuesForRecord(type, item));
}

async function ensureSheets() {
  if (!getStatus().sheetsConfigured) return { ready: false, reason: "not-configured" };
  for (const sheetName of Object.keys(SHEET_HEADERS)) await ensureSheet(sheetName);
  return { ready: true, sheets: Object.keys(SHEET_HEADERS) };
}

async function loadDatabaseSnapshot() {
  if (!getStatus().sheetsConfigured) throw new Error("Google Sheets nejsou nakonfigurované jako trvalé úložiště.");
  const snapshot = {
    schemaVersion: 9,
    employees: [],
    workReports: [],
    employeeEvaluations: [],
    educationPlans: [],
    educationRecords: [],
    supervisions: [],
    meetings: [],
    pushSubscriptions: [],
    methodologyAnswers: [],
    auditLog: [],
  };
  const entries = Object.entries(TYPE_TO_SHEET);
  const contexts = await Promise.all(entries.map(([, sheetName]) => ensureSheet(sheetName)));
  const { sheets, status } = contexts[0];
  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: status.spreadsheetId,
    ranges: contexts.map((context, index) => `${quoteSheetName(entries[index][1])}!A2:${context.endColumn}`),
  });
  entries.forEach(([type, sheetName], index) => {
    const context = contexts[index];
    const snapshotColumn = context.headers.length - 1;
    const rows = response.data.valueRanges?.[index]?.values || [];
    snapshot[TYPE_TO_COLLECTION[type]] = rows.map((row, rowIndex) => {
      const raw = row[snapshotColumn];
      if (!raw) return null;
      try {
        const record = JSON.parse(raw);
        return record && typeof record === "object" && record.id ? record : null;
      } catch (error) {
        throw new Error(`List ${sheetName}, řádek ${rowIndex + 2}: uložený záznam JSON není platný (${error.message}).`);
      }
    }).filter(Boolean);
  });
  return snapshot;
}

async function syncDatabaseSnapshot(database) {
  const results = [];
  for (const [type, collection] of Object.entries(TYPE_TO_COLLECTION)) {
    for (const record of database?.[collection] || []) results.push(await syncRecord(type, record));
  }
  return { synced: true, records: results.length };
}

async function deleteRecord(type, recordId) {
  const sheetName = TYPE_TO_SHEET[type];
  if (!sheetName) throw new Error(`Neznámý typ synchronizace: ${type}`);
  const context = await ensureSheet(sheetName);
  if (!context) return { synced: false, reason: "not-configured" };
  const { sheets, status, sheetId } = context;
  const ids = await sheets.spreadsheets.values.get({
    spreadsheetId: status.spreadsheetId,
    range: `${quoteSheetName(sheetName)}!A2:A`,
  });
  const rowIndex = (ids.data.values || []).findIndex((row) => row[0] === recordId);
  if (rowIndex < 0) return { synced: true, deleted: false, reason: "not-found" };
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: status.spreadsheetId,
    requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowIndex + 1, endIndex: rowIndex + 2 } } }] },
  });
  return { synced: true, deleted: true, row: rowIndex + 2 };
}

function escapeDriveQuery(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function ensureFolder(drive, name, parentId) {
  const response = await drive.files.list({
    q: `'${escapeDriveQuery(parentId)}' in parents and name='${escapeDriveQuery(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id,name)",
    spaces: "drive",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  if (response.data.files?.[0]) return response.data.files[0].id;
  const created = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id",
    supportsAllDrives: true,
  });
  return created.data.id;
}

async function uploadFile({ name, mimeType, buffer, pathSegments = [] }) {
  const status = getStatus();
  if (!status.driveConfigured) {
    if (process.env.GOOGLE_SHEETS_PRIMARY === "true") {
      throw new Error("Google Drive není připojený. Soubor nelze bezpečně uložit na bezplatném serveru.");
    }
    return { uploaded: false, reason: "not-configured" };
  }
  const context = status.driveMode === "oauth"
    ? await googleDriveOAuth.getDriveContext()
    : { ...(await getClients()), rootFolderId: status.rootFolderId };
  const { drive } = context;
  let parentId = context.rootFolderId;
  for (const segment of pathSegments) {
    parentId = await ensureFolder(drive, String(segment), parentId);
  }
  const response = await drive.files.create({
    requestBody: { name, parents: [parentId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id,name,webViewLink",
    supportsAllDrives: true,
  });
  return {
    uploaded: true,
    id: response.data.id,
    name: response.data.name,
    webViewLink: response.data.webViewLink || `https://drive.google.com/file/d/${response.data.id}/view`,
  };
}

async function trashFile(fileId) {
  if (!fileId) return { trashed: false, reason: "missing-id" };
  const status = getStatus();
  if (!status.driveConfigured) return { trashed: false, reason: "not-configured" };
  const context = status.driveMode === "oauth"
    ? await googleDriveOAuth.getDriveContext()
    : { ...(await getClients()), rootFolderId: status.rootFolderId };
  await context.drive.files.update({
    fileId,
    requestBody: { trashed: true },
    supportsAllDrives: true,
  });
  return { trashed: true };
}

async function downloadFile(fileId) {
  if (!fileId) throw new Error("Chybí ID souboru na Google Disku.");
  const status = getStatus();
  if (!status.driveConfigured) throw new Error("Google Drive není připojený.");
  const context = status.driveMode === "oauth"
    ? await googleDriveOAuth.getDriveContext()
    : { ...(await getClients()), rootFolderId: status.rootFolderId };
  const response = await context.drive.files.get({
    fileId,
    alt: "media",
    supportsAllDrives: true,
  }, { responseType: "arraybuffer" });
  return Buffer.from(response.data);
}

module.exports = {
  completeDriveAuthorization: googleDriveOAuth.completeAuthorization,
  disconnectDrive: googleDriveOAuth.disconnect,
  driveAppUrl: googleDriveOAuth.appUrl,
  getDriveAuthorizationUrl: googleDriveOAuth.getAuthorizationUrl,
  getStatus,
  ensureSheets,
  loadDatabaseSnapshot,
  deleteRecord,
  downloadFile,
  syncDatabaseSnapshot,
  syncRecord,
  trashFile,
  uploadFile,
};
