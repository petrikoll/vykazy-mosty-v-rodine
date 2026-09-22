const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mosty-meeting-access-"));
  process.env.APP_DB_PATH = path.join(directory, "app-db.json");
  process.env.GOOGLE_SHEETS_PRIMARY = "false";

  const workspace = require("../server/googleWorkspace.cjs");
  workspace.syncRecord = async () => ({ synced: true });

  const { readDb, writeDb } = require("../server/storage.cjs");
  const { createSession } = require("../server/auth.cjs");
  const { app } = require("../server.js");
  const employees = [
    { id: "worker-a", name: "Pracovník A", appRole: "worker", active: true, assignments: [] },
    { id: "worker-b", name: "Pracovník B", appRole: "worker", active: true, assignments: [] },
    { id: "worker-c", name: "Pracovník C", appRole: "worker", active: true, assignments: [] },
    { id: "guarantor", name: "Odborný garant", appRole: "manager", active: true, assignments: [] },
  ];
  await writeDb({ employees, meetings: [
    {
      id: "old-meeting", date: "2026-09-01", status: "archived", notes: "Starší zápis", participantIds: [],
      createdBy: "worker-b", tasks: [{ id: "old-task", text: "Doplnit podklady", ownerIds: ["worker-a"], deadline: "2026-09-10" }],
    },
    {
      id: "hidden-meeting", date: "2026-09-01", status: "archived", notes: "Jiný zápis", participantIds: [],
      createdBy: "worker-c", tasks: [{ id: "hidden-task", text: "Nepřístupný úkol", ownerIds: ["worker-c"], deadline: "2026-09-10" }],
    },
  ] });

  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const address = `http://127.0.0.1:${server.address().port}`;
    const tokens = Object.fromEntries(employees.map((employee) => [employee.id, createSession(employee.id)]));
    const request = async (employeeId, resource, method = "GET", body) => {
      const response = await fetch(`${address}${resource}`, {
        method,
        headers: { Authorization: `Bearer ${tokens[employeeId]}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: response.status, body: await response.json() };
    };

    const created = await request("worker-a", "/api/meetings", "POST", {
      date: "2026-09-02", content: "Poradu vede odborný garant, zápis pořizuje pracovník A.", participantIds: ["worker-b", "guarantor"],
      tasks: [{ text: "Doplnit podklady", ownerIds: ["worker-a"], deadline: "2026-09-30" }],
      followUpTasks: [
        { id: "old-task", sourceMeetingId: "old-meeting", text: "Doplnit podklady", ownerIds: ["worker-b"], deadline: "2026-10-01" },
        { id: "hidden-task", sourceMeetingId: "hidden-meeting", text: "Nepřístupný úkol", deadline: "2026-10-01" },
      ],
      status: "draft",
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.meeting.id;
    assert.equal(created.body.meeting.createdBy, "worker-a");

    const stored = await readDb();
    assert.equal(stored.meetings.find((meeting) => meeting.id === "old-meeting").tasks[0].deadline, "2026-09-10", "worker cannot change the old task while writing a new meeting");
    assert.deepEqual(stored.meetings.find((meeting) => meeting.id === id).followUpTaskRefs.map((reference) => reference.meetingId), ["old-meeting"]);

    const author = await request("worker-a", `/api/meetings/${id}`, "PATCH", {
      date: "2026-09-02", content: "Opravený koncept.", participantIds: ["worker-b", "guarantor"], status: "draft",
    });
    assert.equal(author.status, 200, JSON.stringify(author.body));

    const otherWorker = await request("worker-b", `/api/meetings/${id}`, "PATCH", {
      date: "2026-09-02", content: "Cizí úprava.", status: "draft",
    });
    assert.equal(otherWorker.status, 403, "another participant cannot edit the author's draft");

    const deleteByWorker = await request("worker-a", `/api/meetings/${id}`, "DELETE");
    assert.equal(deleteByWorker.status, 403, "writing a meeting does not grant deletion rights");

    const visibleToAuthor = await request("worker-a", "/api/portal");
    const visibleToParticipant = await request("worker-b", "/api/portal");
    const visibleToGuarantor = await request("guarantor", "/api/portal");
    const visibleToUninvolved = await request("worker-c", "/api/portal");
    assert(visibleToAuthor.body.meetings.some((meeting) => meeting.id === id));
    assert(visibleToParticipant.body.meetings.some((meeting) => meeting.id === id));
    assert(visibleToGuarantor.body.meetings.some((meeting) => meeting.id === id), "guarantor sees the meeting written by another worker");
    assert(!visibleToUninvolved.body.meetings.some((meeting) => meeting.id === id));
    assert.equal(visibleToAuthor.body.collaborators.length, 4, "worker can select guarantor and other team participants or task owners");

    const archivedDatabase = await readDb();
    archivedDatabase.meetings.find((meeting) => meeting.id === id).status = "archived";
    await writeDb(archivedDatabase);
    const archivedEdit = await request("worker-a", `/api/meetings/${id}`, "PATCH", {
      date: "2026-09-02", content: "Pozdější úprava.", status: "draft",
    });
    assert.equal(archivedEdit.status, 403, "author cannot edit an archived meeting");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
}

main().then(() => console.log("Meeting access tests passed.")).catch((error) => { console.error(error); process.exitCode = 1; });
