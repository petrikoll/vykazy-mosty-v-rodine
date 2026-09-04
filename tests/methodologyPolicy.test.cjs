const assert = require("node:assert/strict");
const { createMethodologyAnswer, questions } = require("../server/methodologyPolicy.cjs");

const question = questions[0];
const employee = { id: "employee-1", name: "Pracovník" };
const record = createMethodologyAnswer({
  employee,
  body: { questionId: question.id, selectedAnswerId: question.correctAnswerId, seriesId: "series-1" },
  makeId: () => "MTA-1",
  now: () => "2026-09-04T12:00:00.000Z",
});
assert.equal(record.employeeId, employee.id, "answer is tied to the authenticated employee");
assert.equal(record.correct, true, "server evaluates correctness from the authoritative bank");
assert.equal(record.topic, question.topic);
assert.throws(() => createMethodologyAnswer({ employee, body: { questionId: question.id, selectedAnswerId: "foreign-answer", seriesId: "series" }, makeId: () => "id", now: () => "now" }), /nepatří/, "foreign answer id is rejected");
assert.throws(() => createMethodologyAnswer({ employee, body: { questionId: question.id, selectedAnswerId: question.correctAnswerId }, makeId: () => "id", now: () => "now" }), /identifikátor série/, "series id is required");

console.log("methodology policy tests passed");

