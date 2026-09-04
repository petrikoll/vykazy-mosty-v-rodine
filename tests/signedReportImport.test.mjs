import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { PDFDocument } from "pdf-lib";

const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mosty-signed-import-"));
process.env.APP_DB_PATH = path.join(testRoot, "app-db.json");

const require = createRequire(import.meta.url);
const { analyzeBundles, decodeUploadedFilename, mergeMappedCandidates, removeImport } = require("../server/signedReportImport.cjs");

assert.equal(decodeUploadedFilename("Tisk schvÃ¡lenÃ½ch vÃ½kazÅ¯.pdf"), "Tisk schválených výkazů.pdf");
assert.equal(decodeUploadedFilename("Tisk schválených výkazů.pdf"), "Tisk schválených výkazů.pdf");

async function onePagePdf() {
  const document = await PDFDocument.create();
  document.addPage();
  return Buffer.from(await document.save());
}

const reports = [
  { id: "WR-1", employeeName: "Anna Nováková", positionName: "Casemanager", month: 9, year: 2026 },
  { id: "WR-2", employeeName: "Boris Dvořák", positionName: "Mediátor", month: 9, year: 2026 },
];

const analysis = await analyzeBundles({
  files: [
    { originalName: "2026-09__Casemanager__Anna_Novakova.pdf", buffer: await onePagePdf() },
    { originalName: "2026-09__Mediator__Boris_Dvorak.pdf", buffer: await onePagePdf() },
  ],
  reports,
});

assert.equal(analysis.originalNames.length, 2);
assert.equal(analysis.candidates.length, 2);
assert.deepEqual(analysis.candidates.map((item) => item.sourceName), [
  "2026-09__Casemanager__Anna_Novakova.pdf",
  "2026-09__Mediator__Boris_Dvorak.pdf",
]);
assert.deepEqual(new Set(analysis.candidates.map((item) => item.reportId)), new Set(["WR-1", "WR-2"]));

const merged = await mergeMappedCandidates(analysis.importId, analysis.candidates.map((item) => ({
  candidateId: item.id,
  reportId: item.reportId,
})));
assert.equal(merged.results.length, 2);
assert.ok(merged.results.every((item) => item.pageCount === 1));

await removeImport(merged.importDir);
await fs.rm(testRoot, { recursive: true, force: true });

console.log("signed report multi-file import tests passed");
