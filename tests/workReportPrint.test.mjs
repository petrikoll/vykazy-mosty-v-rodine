import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { buildWorkReportsPrintHtml } from "../src/workReportPrint.mjs";

const project = { name: "Mosty & rodině", regNumber: "CZ.TEST", organization: "Emcéčko" };
const baseReport = {
  employeeName: "Jana <Sedlářová>",
  positionName: "Psycholog",
  allocationLabel: "1 úv.",
  month: 9,
  year: 2026,
  activities: [{ desc: "Práce s klienty", hours: 10 }],
  absences: {},
  workedHours: 10,
  absenceHours: 0,
  status: "approved",
};
const templateBuffer = await fs.readFile("data/ŠABLONA_Pracovní výkaz OPZ+.xlsx");
const html = await buildWorkReportsPrintHtml([
  { ...baseReport, id: "WR-1" },
  { ...baseReport, id: "WR-2", employeeName: "Petr Novák" },
], project, [], [], templateBuffer);

assert.equal((html.match(/<article class="report">/g) || []).length, 2);
assert.match(html, /Zkontrolováno a schváleno k podpisu/);
assert.match(html, /Jana &lt;Sedlářová&gt;/);
assert.match(html, /Mosty &amp; rodině/);
assert.match(html, /Financováno Evropskou unií/);
assert.match(html, /Registrační číslo projektu/);
assert.match(html, /Počet hodin pracovní neschopnosti za něž je poskytnuta náhrada mzdy\/platu\/odměny z dohody/);
assert.match(html, /Podpis osoby oprávněné potvrdit správnost/);
assert.match(html, /<tr class="declaration"[^>]*><td colspan="7"/);
assert.match(html, /\.template-grid \.declaration td \{ border: 0;/);

console.log("work report print tests passed");
