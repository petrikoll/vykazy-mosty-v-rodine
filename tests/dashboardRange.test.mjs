import assert from "node:assert/strict";
import { dateInRange, dateRangesOverlap, reportOverlapsRange, yearsCovered } from "../src/dashboardRange.mjs";

assert.equal(dateInRange("2026-09-04", "2026-09-01", "2026-09-30"), true);
assert.equal(dateInRange("2026-10-01", "2026-09-01", "2026-09-30"), false);
assert.equal(dateRangesOverlap("2026-08-30", "2026-09-02", "2026-09-01", "2026-09-30"), true);
assert.equal(dateRangesOverlap("2026-08-01", "2026-08-31", "2026-09-01", "2026-09-30"), false);
assert.equal(reportOverlapsRange({ year: 2026, month: 9 }, "2026-09-15", "2026-10-05"), true);
assert.equal(reportOverlapsRange({ year: 2026, month: 8 }, "2026-09-01", "2026-09-30"), false);
assert.deepEqual(yearsCovered("2026-09-01", "2028-02-01"), [2026, 2027, 2028]);

console.log("dashboard date range tests passed");
