const crypto = require("node:crypto");

const sessions = new Map();
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function hashPin(pin, salt = crypto.randomBytes(16).toString("hex")) {
  const normalized = String(pin || "");
  if (!/^\d{4,10}$/.test(normalized)) {
    throw new Error("PIN musí obsahovat 4 až 10 číslic.");
  }
  const hash = crypto.scryptSync(normalized, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPin(pin, storedHash) {
  try {
    const [salt, expectedHex] = String(storedHash || "").split(":");
    if (!salt || !expectedHex) return false;
    const actual = crypto.scryptSync(String(pin || ""), salt, 64);
    const expected = Buffer.from(expectedHex, "hex");
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function createSession(employeeId) {
  const token = crypto.randomBytes(32).toString("base64url");
  sessions.set(token, { employeeId, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function getSession(token) {
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function deleteSession(token) {
  sessions.delete(token);
}

function bearerToken(req) {
  const authorization = String(req.headers.authorization || "");
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

function authMiddleware(readDb) {
  return async (req, res, next) => {
    try {
      const token = bearerToken(req);
      const session = getSession(token);
      if (!session) return res.status(401).json({ error: "Přihlášení vypršelo nebo chybí." });
      const db = await readDb();
      const employee = db.employees.find((item) => item.id === session.employeeId && item.active !== false);
      if (!employee) return res.status(401).json({ error: "Uživatel už není aktivní." });
      req.auth = { token, employee };
      return next();
    } catch (error) {
      return res.status(500).json({ error: "Nelze ověřit přihlášení.", details: error.message });
    }
  };
}

function directorOnly(req, res, next) {
  if (req.auth?.employee?.appRole !== "director") {
    return res.status(403).json({ error: "Tato akce je dostupná pouze Vedoucí služby/programu." });
  }
  return next();
}

function leaderOnly(req, res, next) {
  if (!["manager", "director"].includes(req.auth?.employee?.appRole)) {
    return res.status(403).json({ error: "Tato akce je dostupná pouze Odbornému garantovi nebo Vedoucí služby/programu." });
  }
  return next();
}

function publicEmployee(employee) {
  if (!employee) return null;
  const { pinHash, ...safe } = employee;
  return safe;
}

module.exports = {
  bearerToken,
  createSession,
  deleteSession,
  hashPin,
  verifyPin,
  authMiddleware,
  directorOnly,
  leaderOnly,
  publicEmployee,
};
