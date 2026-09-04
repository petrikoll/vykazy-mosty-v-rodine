const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { changesBetween, rowRequest } = require("../server/sheetTransactions.cjs");

async function run() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mosty-storage-test-"));
  process.env.APP_DB_PATH = path.join(directory, "db.json");
  const storage = require("../server/storage.cjs");
  let remote = storage.migrateData({ employees: [{ id: "person", appRole: "worker" }] });
  await storage.writeDb(remote);
  let fail = false;
  let commitCount = 0;
  storage.configurePrimaryStore({
    load: async () => structuredClone(remote),
    commit: async (before, after) => {
      assert.deepEqual(before, remote);
      await new Promise(resolve => setTimeout(resolve, 5));
      if (fail) throw new Error("fixture cloud unavailable");
      remote = structuredClone(after); commitCount++;
    },
  });
  const insert = (id) => storage.mutateDb(db => { db.educationRecords.push({ id, hours: 8 }); return { value: id }; });
  await Promise.all([insert("A"), storage.refreshDb(), insert("B"), storage.refreshDb()]);
  assert.deepEqual((await storage.readDb()).educationRecords.map(r => r.id), ["A", "B"]);
  assert.equal(commitCount, 2);
  const before = await storage.readDb();
  fail = true;
  await assert.rejects(insert("failed"), /unavailable/);
  assert.deepEqual(await storage.readDb(), before);
  fail = false;
  await insert("retry");
  assert.equal(remote.educationRecords.length, 3);
  remote.educationRecords.push({ id: "other-session", hours: 16 });
  await insert("after-external-change");
  assert(remote.educationRecords.some(r => r.id === "other-session"));
  await storage.mutateDb(db => {
    db.educationRecords.push({ id: "linked", hours: 24 });
    db.educationPlans.push({ id: "plan", plannedActivities: [] });
  });
  assert.equal(remote.educationPlans.length, 1);
  assert.deepEqual(await storage.refreshDb(), remote);

  // Execute the real Google adapter with an in-memory Sheets API. No credentials/network.
  const modulePath = path.resolve(__dirname, "../server/googleWorkspace.cjs");
  const localRequire = createRequire(modulePath);
  const sheetRows = new Map();
  const sheetIds = new Map();
  let nextId = 1;
  let mode = "ok";
  const batches = [];
  const sheets = { spreadsheets: { values: {
    batchGet: async ({ ranges }) => ({ data: { valueRanges: ranges.map(range => {
      const name = range.match(/^'(.+)'!/)[1].replace(/''/g, "'");
      return { values: structuredClone(sheetRows.get(name) || []) };
    }) } }),
  }, batchUpdate: async ({ requestBody }, options) => {
    assert.equal(options.retry, false);
    if (mode === "fail") throw new Error("fixture rejected");
    batches.push(requestBody.requests);
    for (const request of requestBody.requests) {
      const body = request.appendCells || request.updateCells;
      const name = [...sheetIds].find(([, id]) => id === (body.sheetId || body.range.sheetId))[0];
      const rows = sheetRows.get(name);
      const values = (body.rows[0].values || []).map(c => Object.values(c.userEnteredValue || { empty: "" })[0]);
      if (request.appendCells) rows.push(values); else rows[body.range.startRowIndex - 1] = values;
    }
    if (mode === "lost-response") throw new Error("fixture lost response after commit");
    return { data: {} };
  } } };
  const context = {
    module: { exports: {} }, require: name => name === "./googleDriveOAuth.cjs" ? {} : localRequire(name),
    process: { env: {} }, Buffer, console,
    fixtureSheets: sheets, fixtureContext: async name => {
      if (!sheetIds.has(name)) { sheetIds.set(name, nextId++); sheetRows.set(name, []); }
      return { sheets, status: { spreadsheetId: "fixture" }, sheetId: sheetIds.get(name) };
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(modulePath, "utf8") + `
    ensureSheet = async name => ({ ...(await fixtureContext(name)), headers: SHEET_HEADERS[name], endColumn: columnName(SHEET_HEADERS[name].length) });
    getStatus = () => ({ sheetsConfigured: true });
  `, context);
  const adapter = context.module.exports;
  const empty = storage.migrateData({});
  const record = id => ({ id, title: "=NOT_A_FORMULA()", employeeId: "p", date: "2026-01-01", hours: 8 });
  const next = storage.migrateData({ educationRecords: [record("A"), record("B")], educationPlans: [{ id: "P", plannedActivities: [] }] });
  await adapter.commitDatabaseChanges(empty, next);
  assert.equal(batches.length, 1, "linked records go in one batch");
  assert.equal(batches[0].filter(r => r.appendCells).length, 3);
  assert(batches[0].some(r => r.appendCells.rows[0].values.some(c => c.userEnteredValue?.stringValue === "=NOT_A_FORMULA()")));
  await adapter.commitDatabaseChanges(empty, next);
  assert.equal(batches.length, 1, "retry with stable IDs does not duplicate rows");
  const updated = structuredClone(next);
  updated.educationRecords[1].hours = 10;
  updated.educationRecords.shift();
  await adapter.commitDatabaseChanges(next, updated);
  assert.equal(sheetRows.get("Vzdělávání")[0].length, 0, "deletion clears without shifting rows");
  assert.equal(JSON.parse(sheetRows.get("Vzdělávání")[1].at(-1)).hours, 10);
  mode = "fail";
  const changed = structuredClone(updated);
  changed.educationRecords.push(record("C"));
  await assert.rejects(adapter.commitDatabaseChanges(updated, changed), /nepodařilo potvrdit/);
  assert.equal(sheetRows.get("Vzdělávání").length, 2);
  mode = "lost-response";
  await adapter.commitDatabaseChanges(updated, changed);
  assert.equal(sheetRows.get("Vzdělávání").length, 3, "read-back confirms lost response without re-appending");
  mode = "ok";
  const stale = structuredClone(changed); stale.educationRecords[0].hours = 999;
  await assert.rejects(adapter.commitDatabaseChanges(next, stale), /mezitím změnil/);
  assert.throws(() => changesBetween({}, { rows: [{ id: "x" }, { id: "x" }] }, { type: "rows" }), /duplicitní/);
  assert.throws(() => rowRequest({ sheetId: 1, headers: ["id"], rowIndex: -1 }, ["a".repeat(50001)]), /příliš dlouhý/);
  console.log("Safe storage: concurrent writes, refresh, cloud failure, atomic batch, retry, RAW text, deletion and conflict checks passed.");
  // Only this newly created fixture directory is removed.
  fs.rmSync(directory, { recursive: true, force: true });
}
run().catch(error => { console.error(error); process.exitCode = 1; });
