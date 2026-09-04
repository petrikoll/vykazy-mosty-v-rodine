const questions = require("../src/methodology/quizQuestions.generated.json");

const questionById = new Map(questions.map((question) => [question.id, question]));
const clean = (value, max = 200) => String(value || "").trim().slice(0, max);

function createMethodologyAnswer({ employee, body, makeId, now }) {
  const questionId = clean(body?.questionId, 80);
  const selectedAnswerId = clean(body?.selectedAnswerId, 100);
  const seriesId = clean(body?.seriesId, 100);
  const question = questionById.get(questionId);
  if (!question || question.active === false) {
    const error = new Error("Otázka není dostupná nebo již není aktivní.");
    error.status = 404;
    throw error;
  }
  if (!question.answers.some((answer) => answer.id === selectedAnswerId)) {
    const error = new Error("Vybraná odpověď k této otázce nepatří.");
    error.status = 400;
    throw error;
  }
  if (!seriesId) {
    const error = new Error("Chybí identifikátor série otázek.");
    error.status = 400;
    throw error;
  }
  return {
    id: makeId("MTA"),
    employeeId: employee.id,
    employeeName: employee.name,
    questionId: question.id,
    timestamp: now(),
    selectedAnswerId,
    correct: selectedAnswerId === question.correctAnswerId,
    standard: question.standard,
    topic: question.topic,
    difficulty: question.difficulty,
    critical: Boolean(question.critical),
    seriesId,
    bankVersion: question.bankVersion,
    methodologyVersion: question.methodologyVersion,
  };
}

module.exports = { createMethodologyAnswer, questions };

