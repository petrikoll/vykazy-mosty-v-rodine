const assert = require("node:assert/strict");
const { directorOnly, hashPin, isAdminRole, isLeaderRole, leaderOnly, publicEmployee, verifyPin } = require("../server/auth.cjs");

const defaultHash = hashPin("0000");

assert.match(defaultHash, /^[a-f0-9]{32}:[a-f0-9]{128}$/i, "PIN is stored as a salted scrypt hash");
assert.equal(verifyPin("0000", defaultHash), true, "default PIN verifies");
assert.equal(verifyPin("0001", defaultHash), false, "wrong PIN is rejected");
assert.notEqual(hashPin("0000"), defaultHash, "equal PINs receive different salts");
assert.throws(() => hashPin("123"), /4 až 10 číslic/, "short PIN is rejected");
assert.deepEqual(
  publicEmployee({ id: "employee-1", name: "Pracovník", pinHash: defaultHash, pinMustChange: true }),
  { id: "employee-1", name: "Pracovník", pinMustChange: true },
  "the hash is never returned to the browser"
);

let allowed = false;
directorOnly({ auth: { employee: { appRole: "director" } } }, {}, () => { allowed = true; });
assert.equal(allowed, true, "service/program manager may open settings endpoints");
allowed = false;
directorOnly({ auth: { employee: { appRole: "project_manager" } } }, {}, () => { allowed = true; });
assert.equal(allowed, true, "project manager may open settings endpoints");
assert.equal(isAdminRole("project_manager"), true, "project manager has administrative data access");
assert.equal(isLeaderRole("project_manager"), true, "project manager may maintain shared records");

let deniedStatus = 0;
let deniedPayload = null;
directorOnly(
  { auth: { employee: { appRole: "manager" } } },
  { status(code) { deniedStatus = code; return this; }, json(payload) { deniedPayload = payload; return payload; } },
  () => assert.fail("expert guarantor must not access settings endpoints")
);
assert.equal(deniedStatus, 403, "expert guarantor is denied settings endpoints");
assert.match(deniedPayload.error, /Vedoucí služby\/programu nebo Projektový manažer/, "permission error names both administrative roles");

for (const appRole of ["manager", "director", "project_manager"]) {
  let leaderAllowed = false;
  leaderOnly({ auth: { employee: { appRole } } }, {}, () => { leaderAllowed = true; });
  assert.equal(leaderAllowed, true, `${appRole} may write shared personnel records`);
}

deniedStatus = 0;
deniedPayload = null;
leaderOnly(
  { auth: { employee: { appRole: "worker" } } },
  { status(code) { deniedStatus = code; return this; }, json(payload) { deniedPayload = payload; return payload; } },
  () => assert.fail("worker must not write education, supervision, or meeting records")
);
assert.equal(deniedStatus, 403, "worker is denied shared-record write endpoints");
assert.match(deniedPayload.error, /Odborný garant, Vedoucí služby\/programu nebo Projektový manažer/, "permission error names all allowed roles");

console.log("auth tests passed");
