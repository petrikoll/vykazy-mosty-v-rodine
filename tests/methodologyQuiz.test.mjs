import assert from "node:assert/strict";
import questions from "../src/methodology/quizQuestions.generated.json" with { type: "json" };
import {
  calculateQuizStats,
  getLevelForPercent,
  hasLevelUp,
  isAnswerCorrect,
  selectQuizQuestions,
  shuffleQuestionAnswers,
} from "../src/methodology/quizServices.mjs";

const answer = (index, overrides = {}) => ({
  id: `a-${index}`,
  questionId: `q-${index}`,
  timestamp: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  selectedAnswerId: `q-${index}-A`,
  correct: true,
  standard: String((index % 15) + 1),
  topic: `Téma ${index % 4}`,
  difficulty: "STŘEDNÍ",
  critical: false,
  seriesId: "series",
  ...overrides,
});

assert.equal(questions.length, 60, "authoritative bank contains 60 questions");
assert.deepEqual(
  Object.fromEntries(["ZÁKLADNÍ", "STŘEDNÍ", "POKROČILÁ"].map((difficulty) => [difficulty, questions.filter((item) => item.difficulty === difficulty).length])),
  { "ZÁKLADNÍ": 18, "STŘEDNÍ": 27, "POKROČILÁ": 15 },
  "difficulty counts match the approved bank",
);

const sourceQuestion = questions[0];
const shuffled = shuffleQuestionAnswers(sourceQuestion, () => 0);
assert.notDeepEqual(shuffled.answers.map((item) => item.id), sourceQuestion.answers.map((item) => item.id), "answers are shuffled");
assert.equal(isAnswerCorrect(shuffled, sourceQuestion.correctAnswerId), true, "shuffling does not change correctness by answer id");
assert.equal(isAnswerCorrect(shuffled, sourceQuestion.answers.find((item) => item.id !== sourceQuestion.correctAnswerId).id), false, "incorrect answer stays incorrect");

for (const [percent, label] of [[0, "Nováček"], [49, "Nováček"], [50, "Rozkoukává se"], [59, "Rozkoukává se"], [60, "V obraze"], [69, "V obraze"], [70, "Zkušený praktik"], [79, "Zkušený praktik"], [80, "Tahoun týmu"], [89, "Tahoun týmu"], [90, "Šprt metodiky"], [100, "Šprt metodiky"]]) {
  assert.equal(getLevelForPercent(percent).label, label, `level boundary ${percent}%`);
}

const collecting = calculateQuizStats(Array.from({ length: 9 }, (_, index) => answer(index)));
assert.equal(collecting.collecting, true, "up to nine answers remain in collecting mode");
assert.equal(collecting.level.label, "Nováček", "collecting mode is shown as Nováček");

const lastThirtyHistory = Array.from({ length: 35 }, (_, index) => answer(index, { correct: index >= 5 }));
const lastThirty = calculateQuizStats(lastThirtyHistory);
assert.equal(lastThirty.scoringCount, 30, "long-term score uses only the latest 30 answers");
assert.equal(lastThirty.percent, 100, "older answers outside the last 30 do not affect the score");

const criticalStats = calculateQuizStats([
  answer(1, { topic: "GDPR", correct: false, critical: true }),
  answer(2, { topic: "Dokumentace", correct: false, critical: false }),
  ...Array.from({ length: 8 }, (_, index) => answer(index + 3, { topic: "Praxe", correct: true })),
]);
assert.equal(criticalStats.weakest.topic, "GDPR", "missed critical topic is always included in review priority");

assert.equal(hasLevelUp(Array.from({ length: 10 }, (_, index) => answer(index, { correct: index < 5 })), Array.from({ length: 11 }, (_, index) => answer(index, { correct: index < 6 }))), false, "level-up is not shown without crossing a level boundary");
assert.equal(hasLevelUp(Array.from({ length: 10 }, (_, index) => answer(index, { correct: index < 5 })), Array.from({ length: 11 }, (_, index) => answer(index, { correct: index < 7 }))), true, "level-up is shown after a real upward boundary crossing");

const inactiveBank = [{ ...questions[0], id: "inactive", active: false }, ...questions.slice(1, 8)];
const activeSelection = selectQuizQuestions({ questions: inactiveBank, count: 3, random: () => 0.4 });
assert.equal(activeSelection.some((item) => item.id === "inactive"), false, "inactive questions are never returned");
assert.equal(new Set(activeSelection.map((item) => item.id)).size, 3, "series contains no duplicate question");
assert.ok(new Set(activeSelection.map((item) => item.standard)).size > 1, "three-question series is not limited to one standard");

const recent = questions.slice(0, 12).map((question, index) => answer(index, { questionId: question.id }));
const noImmediateRepeat = selectQuizQuestions({ questions, history: recent, count: 3, random: () => 0.25 });
assert.equal(noImmediateRepeat.some((item) => recent.some((past) => past.questionId === item.id)), false, "recent questions are avoided when enough alternatives exist");
assert.equal(selectQuizQuestions({ questions, count: 1, random: () => 0.1 }).length, 1, "quick mode returns exactly one question");

const missedCritical = questions.find((item) => item.critical);
const criticalPriority = selectQuizQuestions({
  questions,
  history: [
    answer(99, { questionId: missedCritical.id, topic: missedCritical.topic, critical: true, correct: false }),
    ...questions.filter((item) => item.id !== missedCritical.id).slice(0, 12).map((item, index) => answer(100 + index, { questionId: item.id, topic: item.topic })),
  ],
  count: 3,
  random: () => 0,
});
assert.ok(criticalPriority.some((item) => item.critical && item.topic === missedCritical.topic), "previously missed critical topic receives selection priority");

console.log("methodology quiz tests passed");
