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
  questionId: questions[index % questions.length].id,
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

const historyOf = (count, correctCount = count) => Array.from({ length: count }, (_, index) => answer(index, { correct: index < correctCount }));
const wholeBank = calculateQuizStats(historyOf(60));
assert.equal(wholeBank.questionCount, 60);
assert.equal(wholeBank.progress, 100);
assert.equal(wholeBank.level.key, "methodology-nerd");
assert.notEqual(calculateQuizStats(historyOf(10)).level.key, "methodology-nerd", "ten answers cannot earn the highest award");
for (const count of [40, 60]) {
  const bank = questions.slice(0, count);
  assert.equal(calculateQuizStats([], bank).questionCount, count, "total follows the active bank");
  assert.notEqual(calculateQuizStats(historyOf(count - 1), bank).level.key, "methodology-nerd", "every question must be covered");
  assert.equal(calculateQuizStats(historyOf(count, count * 0.9), bank).level.key, "methodology-nerd", "full coverage and 90% earns the highest award");
  assert.notEqual(calculateQuizStats(historyOf(count, count * 0.9 - 1), bank).level.key, "methodology-nerd", "full coverage alone is insufficient");
}
for (const [count, index] of [[0, 0], [10, 0], [12, 1], [24, 2], [36, 3], [48, 4], [60, 5]]) {
  assert.equal(calculateQuizStats(historyOf(count)).levelIndex, index, `coverage threshold ${count}`);
}
const repeated = calculateQuizStats(Array.from({ length: 40 }, (_, index) => answer(index, { questionId: questions[0].id })));
assert.equal(repeated.coveredCount, 1, "repeated answers do not inflate coverage");
assert.equal(repeated.levelIndex, 0);
const corrected = calculateQuizStats([answer(0, { correct: false }), answer(1, { questionId: questions[0].id })]);
assert.equal(corrected.coveredCount, 1);
assert.equal(corrected.correct, 1, "latest answer replaces the previous score");
const sameTime = calculateQuizStats([answer(0, { correct: false }), answer(0)]);
assert.equal(sameTime.correct, 1, "last appended answer wins identical timestamps");
const earlierMistakes = calculateQuizStats(historyOf(35, 30));
assert.equal(earlierMistakes.scoringCount, 35, "all covered questions count, not only a rolling window");
assert.equal(earlierMistakes.percent, 85.7);
const filtered = calculateQuizStats([answer(0), answer(1), answer(2, { questionId: "unknown" })], [{ ...questions[0], active: false }, questions[1]]);
assert.equal(filtered.questionCount, 1);
assert.equal(filtered.coveredCount, 1, "inactive and unknown questions are excluded");
assert.equal(calculateQuizStats(historyOf(10), []).progress, 0);

const criticalStats = calculateQuizStats([
  answer(1, { topic: "GDPR", correct: false, critical: true }),
  answer(2, { topic: "Dokumentace", correct: false, critical: false }),
  ...Array.from({ length: 8 }, (_, index) => answer(index + 3, { topic: "Praxe", correct: true })),
]);
assert.equal(criticalStats.weakest.topic, "GDPR", "missed critical topic is always included in review priority");

assert.equal(hasLevelUp(historyOf(10), historyOf(11)), false, "level-up is not shown without crossing a level boundary");
assert.equal(hasLevelUp(historyOf(11), historyOf(12)), true, "level-up requires the coverage threshold too");
assert.equal(hasLevelUp(historyOf(60), historyOf(60, 53)), false, "a lower score is not celebrated");

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
assert.ok(criticalPriority.every(item => ![missedCritical, ...questions.filter(q => q.id !== missedCritical.id).slice(0, 12)].some(past => past.id === item.id)), "unseen questions take priority over repeats");

const traversal = [];
for (let series = 0; series < 20; series += 1) {
  const selected = selectQuizQuestions({ questions, history: traversal, count: 3, random: () => 0.25 });
  for (const question of selected) {
    assert.ok(!traversal.some(past => past.questionId === question.id), "no repeats until the entire bank is covered");
    traversal.push(answer(traversal.length, { questionId: question.id }));
  }
}
assert.equal(calculateQuizStats(traversal).coveredCount, 60);

console.log("methodology quiz tests passed");
