const crypto = require("node:crypto");

function fileHash(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError("Pro výpočet otisku je potřeba Buffer.");
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function findDuplicateByFileHash(records, hash) {
  if (!hash) return null;
  return (records || []).find((record) => record?.fileHash === hash) || null;
}

module.exports = { fileHash, findDuplicateByFileHash };
