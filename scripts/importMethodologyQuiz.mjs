import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultInput = path.join(root, "data", "methodology", "SAS_Emcecko_kviz_databanka_final.csv");
const defaultOutput = path.join(root, "src", "methodology", "quizQuestions.generated.json");
const inputPath = path.resolve(process.argv[2] || defaultInput);
const outputPath = path.resolve(process.argv[3] || defaultOutput);

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  const source = String(text).replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { value += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else value += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(value); value = ""; }
    else if (character === "\n") { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; }
    else value += character;
  }
  if (value || row.length) { row.push(value.replace(/\r$/, "")); rows.push(row); }
  return rows.filter((current) => current.some((cell) => cell !== ""));
}

export function convertQuestionRows(rows) {
  const [headers, ...dataRows] = rows;
  const column = Object.fromEntries(headers.map((name, index) => [name, index]));
  const required = ["ID", "Standard", "Sekce metodiky", "Téma", "Obtížnost", "Typ", "Otázka", "Odpověď A", "Odpověď B", "Odpověď C", "Správná odpověď ID", "Vysvětlení", "Ověřovaná kompetence", "Kritické téma", "Verze banky", "Verze metodiky", "Aktivní"];
  const missing = required.filter((header) => column[header] === undefined);
  if (missing.length) throw new Error(`V CSV chybí sloupce: ${missing.join(", ")}`);
  return dataRows.map((row) => {
    const id = String(row[column.ID] || "").trim();
    return {
      id,
      standard: String(row[column.Standard] || "").trim(),
      source: String(row[column["Sekce metodiky"]] || "").trim(),
      topic: String(row[column["Téma"]] || "").trim(),
      difficulty: String(row[column["Obtížnost"]] || "").trim(),
      type: String(row[column.Typ] || "").trim(),
      question: String(row[column["Otázka"]] || "").trim(),
      answers: ["A", "B", "C"].map((letter) => ({ id: `${id}-${letter}`, text: String(row[column[`Odpověď ${letter}`]] || "").trim() })),
      correctAnswerId: String(row[column["Správná odpověď ID"]] || "").trim(),
      explanation: String(row[column["Vysvětlení"]] || "").trim(),
      competency: String(row[column["Ověřovaná kompetence"]] || "").trim(),
      critical: String(row[column["Kritické téma"]] || "").trim().toUpperCase() === "ANO",
      bankVersion: String(row[column["Verze banky"]] || "").trim(),
      methodologyVersion: String(row[column["Verze metodiky"]] || "").trim(),
      active: String(row[column["Aktivní"]] || "").trim().toUpperCase() === "ANO",
    };
  });
}

export function validateQuestionBank(questions) {
  if (questions.length !== 60) throw new Error(`Očekáváno 60 otázek, nalezeno ${questions.length}.`);
  const ids = new Set();
  for (const question of questions) {
    if (!question.id || ids.has(question.id)) throw new Error(`Chybné nebo duplicitní ID otázky: ${question.id || "(prázdné)"}.`);
    ids.add(question.id);
    if (question.answers.length !== 3 || question.answers.some((answer) => !answer.text)) throw new Error(`Otázka ${question.id} nemá tři vyplněné odpovědi.`);
    if (!question.answers.some((answer) => answer.id === question.correctAnswerId)) throw new Error(`Otázka ${question.id} nemá platné ID správné odpovědi.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const questions = convertQuestionRows(parseCsv(await fs.readFile(inputPath, "utf8")));
  validateQuestionBank(questions);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(questions, null, 2)}\n`, "utf8");
  const difficultyCounts = Object.fromEntries(["ZÁKLADNÍ", "STŘEDNÍ", "POKROČILÁ"].map((level) => [level, questions.filter((question) => question.difficulty === level).length]));
  console.log(`Vytvořeno ${outputPath}: ${questions.length} otázek (${JSON.stringify(difficultyCounts)}).`);
}

