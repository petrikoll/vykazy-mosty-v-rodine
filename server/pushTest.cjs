// An explicit, short, one-off test; not a due-date scheduler or delivery receipt.
function createPushTestScheduler(send, schedule = setTimeout, clock = Date.now) {
  const tests = new Map();
  return {
    status(employeeId) {
      const test = tests.get(employeeId);
      if (test && clock() - test.createdAt > 600000) { tests.delete(employeeId); return null; }
      return test || null;
    },
    start(employeeId) {
      const previous = this.status(employeeId);
      if (previous?.state === "scheduled") return previous;
      const test = { state: "scheduled", createdAt: clock(), scheduledFor: clock() + 20000 };
      tests.set(employeeId, test);
      schedule(async () => {
        try {
          const result = await send(employeeId);
          Object.assign(test, { state: result.sent > 0 ? "sent" : "failed", sent: result.sent, failed: result.failed });
        } catch { test.state = "failed"; }
        test.finishedAt = clock();
      }, 20000);
      schedule(() => { if (tests.get(employeeId) === test) tests.delete(employeeId); }, 600001).unref?.();
      return test;
    },
  };
}
module.exports = { createPushTestScheduler };
