import {
  LONG_TERM_WINDOW,
  METHODOLOGY_LEVELS,
  RECENT_QUESTION_LIMIT,
} from "./quizConfig.mjs";
import defaultQuestions from "./quizQuestions.generated.json" with { type: "json" };

const timestampValue = (item) => Number.isFinite(Date.parse(item?.timestamp)) ? Date.parse(item.timestamp) : 0;
const byNewest = (a, b) => timestampValue(b) - timestampValue(a);

export function getLevelForPercent(percent) {
  const bounded = Math.max(0, Math.min(100, Number(percent) || 0));
  return [...METHODOLOGY_LEVELS].reverse().find((level) => bounded >= level.min) || METHODOLOGY_LEVELS[0];
}

export function getLevelIndex(percent, coveredCount = 0, questionCount = defaultQuestions.filter(question => question.active !== false).length) {
  if (!questionCount) return 0;
  return METHODOLOGY_LEVELS.reduce((current, level, index) =>
    percent >= level.min && coveredCount >= Math.ceil(questionCount * level.coverage / 100) ? index : current, 0);
}

function topicSummaries(history) {
  const topics = new Map();
  for (const answer of history) {
    const topic = answer.topic || answer.tema || "Ostatní";
    const current = topics.get(topic) || { topic, total: 0, correct: 0, criticalMisses: 0 };
    current.total += 1;
    current.correct += answer.correct ? 1 : 0;
    if (!answer.correct && (answer.critical ?? answer.criticalTopic ?? answer.kritickeTema)) current.criticalMisses += 1;
    topics.set(topic, current);
  }
  return [...topics.values()].map((item) => ({ ...item, percent: Math.round((item.correct / item.total) * 100) }));
}

export function calculateQuizStats(history = [], questions = defaultQuestions) {
  const activeIds = new Set(questions.filter(question => question.active !== false).map(question => question.id));
  const questionCount = activeIds.size;
  // One latest answer per active question. Repeating familiar questions cannot
  // increase coverage or push earlier mistakes outside a rolling score window.
  const ordered = [...history].reverse().sort(byNewest).filter(answer => activeIds.has(answer.questionId));
  const latestAnswers = new Map();
  for (const answer of ordered) if (!latestAnswers.has(answer.questionId)) latestAnswers.set(answer.questionId, answer);
  const scoringAnswers = [...latestAnswers.values()];
  const total = scoringAnswers.length;
  const correct = scoringAnswers.filter((answer) => answer.correct).length;
  const exactPercent = total ? (correct / total) * 100 : 0;
  const percent = Math.round(exactPercent * 10) / 10;
  const levelIndex = getLevelIndex(exactPercent, total, questionCount);
  const level = METHODOLOGY_LEVELS[levelIndex];
  const next = questionCount ? METHODOLOGY_LEVELS[levelIndex + 1] : null;
  const nextLevel = next ? { ...next, minQuestions: Math.ceil(questionCount * next.coverage / 100) } : null;
  const collecting = total < Math.ceil(questionCount * METHODOLOGY_LEVELS[1].coverage / 100);
  const progress = questionCount ? Math.floor(total / questionCount * 100) : 0;
  const topicStats = topicSummaries(scoringAnswers);
  const strongest = [...topicStats].sort((a, b) => b.percent - a.percent || b.total - a.total || a.topic.localeCompare(b.topic, "cs"))[0] || null;
  const criticalWeakness = [...topicStats].filter((item) => item.criticalMisses > 0)
    .sort((a, b) => b.criticalMisses - a.criticalMisses || a.percent - b.percent)[0];
  const weakest = criticalWeakness || [...topicStats].sort((a, b) => a.percent - b.percent || b.total - a.total || a.topic.localeCompare(b.topic, "cs"))[0] || null;
  return {
    answerCount: ordered.length,
    questionCount,
    coveredCount: total,
    scoringCount: total,
    correct,
    percent,
    collecting,
    level,
    levelIndex,
    nextLevel,
    progress,
    strongest,
    weakest,
    recentQuestionIds: ordered.slice(0, RECENT_QUESTION_LIMIT).map((answer) => answer.questionId),
    topicStats,
  };
}

export function hasLevelUp(beforeHistory = [], afterHistory = [], questions = defaultQuestions) {
  const before = calculateQuizStats(beforeHistory, questions);
  const after = calculateQuizStats(afterHistory, questions);
  return after.levelIndex > before.levelIndex;
}

function shuffled(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function shuffleQuestionAnswers(question, random = Math.random) {
  return { ...question, answers: shuffled(question.answers || [], random) };
}

export function isAnswerCorrect(question, selectedAnswerId) {
  return Boolean(question && selectedAnswerId && question.correctAnswerId === selectedAnswerId);
}

export function selectQuizQuestions({ questions = [], history = [], count = 3, random = Math.random }) {
  const active = questions.filter((question) => question.active !== false);
  if (active.length < count) throw new Error("Databanka neobsahuje dost aktivních otázek.");

  const orderedHistory = [...history].sort(byNewest);
  const recentIds = new Set(orderedHistory.slice(0, RECENT_QUESTION_LIMIT).map((answer) => answer.questionId));
  const shownCounts = orderedHistory.reduce((map, answer) => map.set(answer.questionId, (map.get(answer.questionId) || 0) + 1), new Map());
  const missedCriticalTopics = new Set(orderedHistory.slice(0, LONG_TERM_WINDOW)
    .filter((answer) => !answer.correct && (answer.critical ?? answer.criticalTopic ?? answer.kritickeTema))
    .map((answer) => answer.topic || answer.tema));
  const nonRecent = active.filter((question) => !recentIds.has(question.id));
  const pool = nonRecent.length >= count ? nonRecent : active;
  const selected = [];

  while (selected.length < count) {
    const remaining = pool.filter((question) => !selected.some((item) => item.id === question.id));
    const unseen = remaining.filter(question => !shownCounts.has(question.id));
    const candidates = unseen.length ? unseen : remaining;
    const usedTopics = new Set(selected.map((item) => item.topic));
    const usedDifficulties = new Set(selected.map((item) => item.difficulty));
    const usedStandards = new Set(selected.map((item) => item.standard));
    const ranked = candidates.map((question) => ({
      question,
      score:
        (missedCriticalTopics.has(question.topic) && question.critical ? 8 : 0)
        + (!usedTopics.has(question.topic) ? 5 : 0)
        + (!usedDifficulties.has(question.difficulty) ? 3 : 0)
        + (!usedStandards.has(question.standard) ? 2 : 0)
        - (shownCounts.get(question.id) || 0) * 1.5
        - (recentIds.has(question.id) ? 20 : 0)
        + random(),
    })).sort((a, b) => b.score - a.score);
    selected.push(ranked[0].question);
  }

  if (count >= 3 && new Set(selected.map((question) => question.standard)).size === 1) {
    const replacement = pool.find((question) => question.standard !== selected[0].standard
      && !selected.some((item) => item.id === question.id)
      && (shownCounts.has(selected.at(-1).id) || !shownCounts.has(question.id)));
    if (replacement) selected[selected.length - 1] = replacement;
  }

  return shuffled(selected, random).map((question) => shuffleQuestionAnswers(question, random));
}

export function calculateSeriesSummary(answers = []) {
  const correct = answers.filter((answer) => answer.correct).length;
  return {
    total: answers.length,
    correct,
    percent: answers.length ? Math.round((correct / answers.length) * 100) : 0,
    strongest: topicSummaries(answers).sort((a, b) => b.percent - a.percent || b.total - a.total)[0] || null,
    weakest: topicSummaries(answers).sort((a, b) => a.percent - b.percent || b.criticalMisses - a.criticalMisses)[0] || null,
  };
}
