const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mosty-employee-hours-"));
  process.env.APP_DB_PATH = path.join(directory, "app-db.json");
  process.env.GOOGLE_SHEETS_PRIMARY = "false";

  const workspace = require("../server/googleWorkspace.cjs");
  workspace.syncRecord = async () => ({ synced: true });
  const { writeDb } = require("../server/storage.cjs");
  const { createSession } = require("../server/auth.cjs");
  const { app } = require("../server.js");
  const director = { id: "director", name: "Vedoucí", appRole: "director", active: true, assignments: [] };
  await writeDb({ employees: [director] });
  const token = createSession(director.id);
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const address = `http://127.0.0.1:${server.address().port}`;
    const request = async (resource, method, body) => {
      const response = await fetch(`${address}${resource}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };
    const createWorker = (name, assignments) => request("/api/employees", "POST", { name, appRole: "worker", assignments });

    const first = await createWorker("Pracovník A", [{ positionId: "lawyer", monthlyHours: 2 }]);
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.assignments[0].monthlyHours, 2);
    const second = await createWorker("Pracovník B", [{ positionId: "lawyer", monthlyHours: 3 }]);
    assert.equal(second.status, 201, JSON.stringify(second.body));
    assert.equal(second.body.assignments[0].monthlyHours, 3);

    const overSharedLimit = await createWorker("Pracovník C", [{ positionId: "lawyer", monthlyHours: 0.01 }]);
    assert.equal(overSharedLimit.status, 409, "combined assignments must not exceed the project cap");
    const overIndividualLimit = await createWorker("Pracovník C", [{ positionId: "lawyer", monthlyHours: 5.01 }]);
    assert.equal(overIndividualLimit.status, 400, "individual hours must not exceed the project cap");
    const zeroHours = await createWorker("Pracovník C", [{ positionId: "lawyer", monthlyHours: 0 }]);
    assert.equal(zeroHours.status, 400, "hourly assignments need positive hours");

    const reduced = await request(`/api/employees/${first.body.id}`, "PATCH", {
      assignments: [{ ...first.body.assignments[0], monthlyHours: 1 }],
    });
    assert.equal(reduced.status, 200, JSON.stringify(reduced.body));
    assert.equal(reduced.body.assignments[0].id, first.body.assignments[0].id, "editing hours preserves report assignment identity");
    const third = await createWorker("Pracovník C", [{ positionId: "lawyer", monthlyHours: 1 }]);
    assert.equal(third.status, 201, JSON.stringify(third.body));

    const firstDpp = await createWorker("Pracovník DPP A", [{ positionId: "facilitator", monthlyHours: 2.5 }]);
    const secondDpp = await createWorker("Pracovník DPP B", [{ positionId: "facilitator", monthlyHours: 5 }]);
    assert.equal(firstDpp.status, 201, JSON.stringify(firstDpp.body));
    assert.equal(secondDpp.status, 201, JSON.stringify(secondDpp.body));
    const thirdDpp = await createWorker("Pracovník DPP C", [{ positionId: "facilitator", monthlyHours: 0.01 }]);
    assert.equal(thirdDpp.status, 409, "DPP assignments share the same project cap");

    const fteOwner = await createWorker("Pracovník D", [{ positionId: "case-manager" }]);
    assert.equal(fteOwner.status, 201, JSON.stringify(fteOwner.body));
    const repeatedFte = await createWorker("Pracovník E", [{ positionId: "case-manager" }]);
    assert.equal(repeatedFte.status, 409, "regular positions remain exclusive");

    const submitHourly = async (employee, hours, month = 9) => {
      const response = await fetch(`${address}/api/work-reports/submit`, {
        method: "POST",
        headers: { Authorization: `Bearer ${createSession(employee.body.id)}`, "Content-Type": "application/json" },
        body: JSON.stringify({ month, year: 2026, reports: [
          { assignmentId: employee.body.assignments[0].id, activities: [{ desc: "Projektová činnost", hours }] },
        ] }),
      });
      return { status: response.status, body: await response.json() };
    };
    const reportOverLimit = await submitHourly(first, 1.01);
    assert.equal(reportOverLimit.status, 400, "hourly report cannot exceed the worker's assigned maximum");
    const reportBelowLimit = await submitHourly(first, 0.5);
    assert.equal(reportBelowLimit.status, 201, JSON.stringify(reportBelowLimit.body));
    assert.equal(reportBelowLimit.body.reports[0].workedHours, 0.5);

    const dppReportA = await submitHourly(firstDpp, 2.5, 10);
    assert.equal(dppReportA.status, 201, JSON.stringify(dppReportA.body));
    const reducedDpp = await request(`/api/employees/${firstDpp.body.id}`, "PATCH", {
      assignments: [{ ...firstDpp.body.assignments[0], monthlyHours: 1.5 }],
    });
    assert.equal(reducedDpp.status, 200, JSON.stringify(reducedDpp.body));
    const thirdDppAfterReallocation = await createWorker("Pracovník DPP C", [{ positionId: "facilitator", monthlyHours: 1 }]);
    assert.equal(thirdDppAfterReallocation.status, 201, JSON.stringify(thirdDppAfterReallocation.body));
    const dppReportB = await submitHourly(secondDpp, 5, 10);
    assert.equal(dppReportB.status, 201, JSON.stringify(dppReportB.body));
    const aggregateOverLimit = await submitHourly(thirdDppAfterReallocation, 1, 10);
    assert.equal(aggregateOverLimit.status, 400, "past reports still count toward the monthly project cap after assignments change");

    const doubleSelection = await createWorker("Pracovník F", [
      { positionId: "facilitator", monthlyHours: 1 },
      { positionId: "facilitator", monthlyHours: 1 },
    ]);
    assert.equal(doubleSelection.status, 400, "one employee cannot select the same hourly position twice");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
}

main().then(() => console.log("Employee hour limits passed.")).catch((error) => { console.error(error); process.exitCode = 1; });
