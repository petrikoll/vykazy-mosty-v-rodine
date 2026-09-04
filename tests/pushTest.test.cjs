const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { createPushTestScheduler } = require("../server/pushTest.cjs");

(async () => {
  const timers = [], recipients = [];
  const scheduler = createPushTestScheduler(async id => { recipients.push(id); return { sent: 1, failed: 0 }; }, (fn, delay) => { timers.push({ fn, delay }); return {}; }, () => 1000);
  assert.equal(scheduler.start("self").state, "scheduled");
  scheduler.start("self");
  assert.equal(timers.filter(t => t.delay === 20000).length, 1);
  assert.equal(scheduler.status("other"), null);
  assert.deepEqual(recipients, []);
  await timers.find(t => t.delay === 20000).fn();
  assert.deepEqual(recipients, ["self"]);
  assert.equal(scheduler.status("self").state, "sent");
  const listeners = {}, notifications = [], windows = [];
  vm.runInNewContext(fs.readFileSync(require.resolve("../public/sw.js"), "utf8"), {
    URL,
    self: {
      location: { origin: "https://portal.example" },
      addEventListener: (type, listener) => { listeners[type] = listener; },
      registration: { showNotification: async (title, options) => notifications.push({ title, options }) },
      clients: { matchAll: async () => [], openWindow: async url => windows.push(url) },
    },
  });
  let pending;
  listeners.push({ data: { json: () => ({ title: "Zkouška", body: "Test", url: "/?open=meetings" }) }, waitUntil: promise => { pending = promise; } });
  await pending;
  assert.equal(notifications.length, 1, "worker shows notification without open window clients");
  listeners.notificationclick({ notification: { ...notifications[0].options, close() {} }, waitUntil: promise => { pending = promise; } });
  await pending;
  assert.deepEqual(windows, ["https://portal.example/?open=meetings"]);
  console.log("Push scheduler and service worker without open app clients passed (not a physical delivery test).");
})().catch(error => { console.error(error); process.exitCode = 1; });
