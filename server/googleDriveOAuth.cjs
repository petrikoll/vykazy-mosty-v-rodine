const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");

const DRIVE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/drive.file",
];
const AUTH_STATE_TTL_MS = 10 * 60 * 1000;
const oauthStates = new Map();
let drivePromise = null;

const tokenPath = () => process.env.GOOGLE_DRIVE_TOKEN_PATH
  ? path.resolve(process.env.GOOGLE_DRIVE_TOKEN_PATH)
  : path.join(__dirname, "..", "data", "google-drive-oauth.json");

const renderBaseUrl = () => process.env.RENDER_EXTERNAL_HOSTNAME
  ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
  : "";

const redirectUri = () => process.env.GOOGLE_OAUTH_REDIRECT_URI
  || (renderBaseUrl() ? `${renderBaseUrl()}/api/google-drive/callback` : `http://localhost:${process.env.PORT || 3001}/api/google-drive/callback`);

const appUrl = () => process.env.GOOGLE_DRIVE_APP_URL || (renderBaseUrl() ? `${renderBaseUrl()}/` : "http://localhost:5174/");

function environmentConnection() {
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!refreshToken || !rootFolderId) return null;
  return {
    email: process.env.GOOGLE_DRIVE_ACCOUNT_EMAIL || process.env.GOOGLE_DRIVE_ALLOWED_EMAIL || "",
    rootFolderId,
    folderName: process.env.GOOGLE_DRIVE_FOLDER_NAME || "Mosty v rodině – podepsané výkazy",
    tokens: { refresh_token: refreshToken },
    source: "environment",
  };
}

function readConnection() {
  try {
    return JSON.parse(fsSync.readFileSync(tokenPath(), "utf8"));
  } catch {
    return environmentConnection();
  }
}

function clientConfigured() {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

function getStatus() {
  const connection = readConnection();
  const connected = Boolean(clientConfigured() && connection?.tokens?.refresh_token && connection?.rootFolderId);
  return {
    configured: clientConfigured(),
    connected,
    accountEmail: connected ? connection.email || "" : "",
    allowedEmail: process.env.GOOGLE_DRIVE_ALLOWED_EMAIL || "",
    rootFolderId: connected ? connection.rootFolderId : "",
    folderUrl: connected ? `https://drive.google.com/drive/folders/${connection.rootFolderId}` : "",
  };
}

function createClient() {
  if (!clientConfigured()) {
    throw new Error("V Google Cloud ještě chybí OAuth Client ID a Client Secret.");
  }
  const { google } = require("googleapis");
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri()
  );
}

async function writeConnection(connection) {
  const target = tokenPath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(connection, null, 2), { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporary, target);
}

function escapeQuery(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function ensureFolder(drive, name, parentId) {
  const response = await drive.files.list({
    q: `'${escapeQuery(parentId)}' in parents and name='${escapeQuery(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id,name)",
    spaces: "drive",
  });
  if (response.data.files?.[0]) return response.data.files[0].id;
  const created = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id",
  });
  return created.data.id;
}

function getAuthorizationUrl(employeeId) {
  for (const [state, pending] of oauthStates) {
    if (pending.expiresAt <= Date.now()) oauthStates.delete(state);
  }
  const state = crypto.randomBytes(32).toString("base64url");
  oauthStates.set(state, { employeeId, expiresAt: Date.now() + AUTH_STATE_TTL_MS });
  return createClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: DRIVE_SCOPES,
    state,
    include_granted_scopes: true,
    login_hint: process.env.GOOGLE_DRIVE_ALLOWED_EMAIL || undefined,
  });
}

async function completeAuthorization(code, state) {
  const stateKey = String(state || "");
  const pending = oauthStates.get(stateKey);
  oauthStates.delete(stateKey);
  if (!pending || pending.expiresAt <= Date.now()) {
    throw new Error("Platnost připojení vypršela. Vraťte se do Nastavení a zkuste to znovu.");
  }
  if (!code) throw new Error("Google neposlal autorizační kód.");

  const { google } = require("googleapis");
  const auth = createClient();
  const { tokens } = await auth.getToken(code);
  auth.setCredentials(tokens);
  const profile = await google.oauth2({ version: "v2", auth }).userinfo.get();
  const email = String(profile.data.email || "").toLowerCase();
  const allowedEmail = String(process.env.GOOGLE_DRIVE_ALLOWED_EMAIL || "").toLowerCase();
  if (allowedEmail && email !== allowedEmail) {
    throw new Error(`Byl vybrán účet ${email || "bez e-mailu"}. Použijte ${allowedEmail}.`);
  }
  if (!tokens.refresh_token) {
    throw new Error("Google neposlal dlouhodobé oprávnění. Připojení zkuste znovu a potvrďte přístup.");
  }

  const drive = google.drive({ version: "v3", auth });
  const folderName = process.env.GOOGLE_DRIVE_FOLDER_NAME || "Mosty v rodině – podepsané výkazy";
  const rootFolderId = await ensureFolder(drive, folderName, "root");
  await writeConnection({
    email,
    rootFolderId,
    folderName,
    connectedAt: new Date().toISOString(),
    connectedByEmployeeId: pending.employeeId,
    tokens,
  });
  drivePromise = null;
  return { email, rootFolderId, folderName };
}

async function getDriveContext() {
  if (drivePromise) return drivePromise;
  drivePromise = (async () => {
    const connection = readConnection();
    if (!connection?.tokens?.refresh_token || !connection?.rootFolderId) {
      throw new Error("Google Drive není připojený. Vedoucí jej připojí v Nastavení.");
    }
    const { google } = require("googleapis");
    const auth = createClient();
    auth.setCredentials(connection.tokens);
    auth.on("tokens", async (tokens) => {
      try {
        const current = readConnection() || connection;
        await writeConnection({ ...current, tokens: { ...current.tokens, ...tokens } });
      } catch (error) {
        console.error("Nelze uložit obnovené přihlášení Google Drive:", error);
      }
    });
    return { drive: google.drive({ version: "v3", auth }), rootFolderId: connection.rootFolderId };
  })();
  try {
    return await drivePromise;
  } catch (error) {
    drivePromise = null;
    throw error;
  }
}

async function disconnect() {
  const connection = readConnection();
  try {
    if (connection?.tokens && clientConfigured()) {
      const auth = createClient();
      auth.setCredentials(connection.tokens);
      await auth.revokeCredentials().catch(() => undefined);
    }
    await fs.unlink(tokenPath()).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  } finally {
    drivePromise = null;
  }
  return { disconnected: true };
}

module.exports = {
  appUrl,
  completeAuthorization,
  disconnect,
  ensureFolder,
  getAuthorizationUrl,
  getDriveContext,
  getStatus,
};
