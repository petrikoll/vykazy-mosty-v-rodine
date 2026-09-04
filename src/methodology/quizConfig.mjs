export const METHODOLOGY_IDLE_TIMEOUT_MS = 3 * 60 * 1000;
export const METHODOLOGY_DEFER_RETRY_MS = 15 * 1000;
export const RECENT_QUESTION_LIMIT = 12;
export const LONG_TERM_WINDOW = 30;
export const MINIMUM_LEVEL_ANSWERS = 10;
export const QUIZ_SERIES_SIZES = Object.freeze({ quick: 1, standard: 3 });

export const METHODOLOGY_LEVELS = Object.freeze([
  { key: "novice", label: "Nováček", min: 0, max: 49 },
  { key: "looking-around", label: "Rozkoukává se", min: 50, max: 59 },
  { key: "in-the-picture", label: "V obraze", min: 60, max: 69 },
  { key: "experienced", label: "Zkušený praktik", min: 70, max: 79 },
  { key: "team-driver", label: "Tahoun týmu", min: 80, max: 89 },
  { key: "methodology-nerd", label: "Šprt metodiky", min: 90, max: 100 },
]);

export const METHODOLOGY_TEXTS = Object.freeze({
  eyebrow: "MOSTY V RODINĚ · PERSONÁLNÍ PORTÁL",
  title: "Metodická chvilka",
  intro: "Tři minuty klidu? Tak si dáme malé opáčko.",
  collecting: "Nováček · sbíráme první výsledky",
  correct: "Správně",
  incorrect: "Tentokrát ne",
  levelUp: "Nová úroveň",
  close: "Zavřít",
});
