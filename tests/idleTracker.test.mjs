import assert from "node:assert/strict";
import { createIdleTracker } from "../src/methodology/idleTracker.mjs";
import { METHODOLOGY_IDLE_TIMEOUT_MS } from "../src/methodology/quizConfig.mjs";

function fakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    setTimer(callback, delay) { const id = nextId++; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimer(id) { timers.delete(id); },
    advance(milliseconds) {
      const target = now + milliseconds;
      while (true) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]); now = due[1].at; due[1].callback();
      }
      now = target;
    },
  };
}

const clock = fakeClock();
let opens = 0;
let closes = 0;
const draftForm = { text: "Rozepsaný a neuložený zápis" };
const tracker = createIdleTracker({ timeoutMs: METHODOLOGY_IDLE_TIMEOUT_MS, onIdle: () => { opens += 1; }, onClose: () => { closes += 1; }, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
tracker.start();
clock.advance(METHODOLOGY_IDLE_TIMEOUT_MS - 1);
assert.equal(opens, 0, "overlay does not activate before three minutes");
clock.advance(1);
assert.equal(opens, 1, "overlay activates after exactly three idle minutes");
tracker.recordActivity();
clock.advance(METHODOLOGY_IDLE_TIMEOUT_MS * 2);
assert.equal(opens, 1, "activity while overlay is open neither closes nor restarts it");
assert.equal(tracker.isOverlayActive(), true, "overlay remains open after activity");
assert.deepEqual(draftForm, { text: "Rozepsaný a neuložený zápis" }, "underlying form state remains untouched");
tracker.closeOverlay();
assert.equal(closes, 1, "explicit close action closes the overlay");
assert.equal(tracker.isOverlayActive(), false);
clock.advance(METHODOLOGY_IDLE_TIMEOUT_MS);
assert.equal(opens, 2, "closing starts a new full idle interval");
tracker.stop();

const resetClock = fakeClock();
let resetOpens = 0;
const resetTracker = createIdleTracker({ timeoutMs: 100, onIdle: () => { resetOpens += 1; }, setTimer: resetClock.setTimer, clearTimer: resetClock.clearTimer });
resetTracker.start();
resetClock.advance(70);
resetTracker.recordActivity();
resetClock.advance(70);
assert.equal(resetOpens, 0, "activity resets the timer before activation");
resetClock.advance(30);
assert.equal(resetOpens, 1);
resetTracker.stop();

const deferClock = fakeClock();
let deferOpens = 0;
let blocked = true;
const deferred = createIdleTracker({ timeoutMs: 100, deferRetryMs: 20, shouldDefer: () => blocked, onIdle: () => { deferOpens += 1; }, setTimer: deferClock.setTimer, clearTimer: deferClock.clearTimer });
deferred.start(); deferClock.advance(100);
assert.equal(deferOpens, 0, "critical operations defer overlay activation");
blocked = false; deferClock.advance(20);
assert.equal(deferOpens, 1, "overlay activates after the critical operation ends");

console.log("idle tracker tests passed");

