import assert from "node:assert/strict";
import { calculateInclusiveEducationHours, calculateTimeRangeHours } from "../src/timeRange.mjs";

assert.equal(calculateTimeRangeHours("09:00", "16:30"), 7.5);
assert.equal(calculateTimeRangeHours("16:00", "09:00"), 0);
assert.equal(calculateInclusiveEducationHours({ dateFrom: "2026-09-04", dateTo: "2026-09-04", timeFrom: "09:00", timeTo: "16:00" }), 7);
assert.equal(calculateInclusiveEducationHours({ dateFrom: "2026-09-04", dateTo: "2026-09-05", timeFrom: "09:00", timeTo: "16:00" }), 14);
assert.equal(calculateInclusiveEducationHours({ dateFrom: "2026-09-05", dateTo: "2026-09-04", timeFrom: "09:00", timeTo: "16:00" }), 0);

console.log("timeRange tests passed");
