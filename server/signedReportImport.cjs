const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const JSZip = require("jszip");
const { PDFDocument } = require("pdf-lib");
const { DB_PATH } = require("./storage.cjs");

const IMPORT_ROOT = path.join(path.dirname(DB_PATH), "report-imports");
const A4 = { width: 595.28, height: 841.89 };

function decodeUploadedFilename(value) {
  const original = String(value || "");
  if (!/[ÃÄÅÆâ]/.test(original)) return original;
  const decoded = Buffer.from(original, "latin1").toString("utf8");
  if (decoded.includes("�")) return original;
  const mojibakeCount = (text) => (text.match(/[ÃÄÅÆâ]/g) || []).length;
  return mojibakeCount(decoded) < mojibakeCount(original) ? decoded : original;
}

const normalize = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

async function splitPdf(buffer, sourceName) {
  const source = await PDFDocument.load(buffer, { ignoreEncryption: true });
  if (source.getPageCount() > 200) throw new Error(`PDF ${sourceName} obsahuje více než 200 stran.`);
  const candidates = [];
  for (let index = 0; index < source.getPageCount(); index += 1) {
    const target = await PDFDocument.create();
    const [page] = await target.copyPages(source, [index]);
    target.addPage(page);
    candidates.push({
      sourceName,
      pageNumber: index + 1,
      mimeType: "application/pdf",
      extension: "pdf",
      buffer: Buffer.from(await target.save()),
    });
  }
  return candidates;
}

async function unpackBundle(buffer, originalName) {
  const extension = path.extname(originalName).toLowerCase();
  if (extension === ".pdf") return splitPdf(buffer, originalName);
  if (extension !== ".zip") throw new Error("Podporován je pouze PDF nebo ZIP.");

  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir && !entry.name.startsWith("__MACOSX/"));
  if (entries.length > 200) throw new Error("ZIP obsahuje více než 200 souborů.");
  const candidates = [];
  let totalUncompressedBytes = 0;
  for (const entry of entries) {
    const entryExtension = path.extname(entry.name).toLowerCase();
    if (![".pdf", ".png", ".jpg", ".jpeg"].includes(entryExtension)) continue;
    const declaredSize = Number(entry?._data?.uncompressedSize || 0);
    if (declaredSize > 25 * 1024 * 1024) throw new Error(`Soubor ${entry.name} je větší než 25 MB.`);
    totalUncompressedBytes += declaredSize;
    if (totalUncompressedBytes > 200 * 1024 * 1024) throw new Error("Rozbalený ZIP by překročil celkový limit 200 MB.");
    const entryBuffer = await entry.async("nodebuffer");
    if (entryBuffer.length > 25 * 1024 * 1024) throw new Error(`Soubor ${entry.name} je větší než 25 MB.`);
    if (!declaredSize) {
      totalUncompressedBytes += entryBuffer.length;
      if (totalUncompressedBytes > 200 * 1024 * 1024) throw new Error("Rozbalený ZIP překročil celkový limit 200 MB.");
    }
    if (entryExtension === ".pdf") {
      candidates.push(...(await splitPdf(entryBuffer, entry.name)));
    } else {
      candidates.push({
        sourceName: entry.name,
        pageNumber: 1,
        mimeType: entryExtension === ".png" ? "image/png" : "image/jpeg",
        extension: entryExtension === ".png" ? "png" : "jpg",
        buffer: entryBuffer,
      });
    }
  }
  if (!candidates.length) throw new Error("V ZIPu nebyl nalezen žádný PDF, JPG ani PNG soubor.");
  return candidates;
}

function classifyFromFilename(candidate, reports) {
  const filename = normalize(candidate.sourceName);
  let best = null;
  for (const report of reports) {
    const reportIdMatch = filename.includes(normalize(report.id));
    const employeeTokens = normalize(report.employeeName).split(" ").filter((token) => token.length > 2);
    const positionTokens = normalize(report.positionName).split(" ").filter((token) => token.length > 3);
    const employeeMatches = employeeTokens.filter((token) => filename.includes(token)).length;
    const positionMatches = positionTokens.filter((token) => filename.includes(token)).length;
    const periodMatch = filename.includes(String(report.year)) && (
      filename.includes(String(report.month).padStart(2, "0")) || filename.includes(String(report.month))
    );
    const score = (reportIdMatch ? 10 : 0) + employeeMatches * 2 + positionMatches + (periodMatch ? 2 : 0);
    if (!best || score > best.score) best = { reportId: report.id, score };
  }
  if (best?.score >= 5) {
    return { reportId: best.reportId, confidence: Math.min(0.98, 0.55 + best.score * 0.04), method: "filename" };
  }
  return { reportId: "", confidence: 0, method: "unmatched" };
}

async function classifyWithGemini(candidate, reports) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !reports.length) return null;
  const model = process.env.GEMINI_DOCUMENT_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const choices = reports.map((report) => ({
    id: report.id,
    employee: report.employeeName,
    position: report.positionName,
    month: report.month,
    year: report.year,
  }));
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [
        { inlineData: { mimeType: candidate.mimeType, data: candidate.buffer.toString("base64") } },
        { text: `Rozpoznej pracovní výkaz a přiřaď jej právě k jednomu z očekávaných záznamů. Pokud údaje nejsou čitelné nebo shoda není jistá, vrať prázdné reportId. Možnosti: ${JSON.stringify(choices)}` },
      ] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            reportId: { type: "STRING" },
            confidence: { type: "NUMBER" },
            reason: { type: "STRING" },
          },
          required: ["reportId", "confidence", "reason"],
        },
      },
    }),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;
  const parsed = JSON.parse(text);
  const valid = reports.some((report) => report.id === parsed.reportId);
  return {
    reportId: valid ? parsed.reportId : "",
    confidence: valid ? Math.max(0, Math.min(1, Number(parsed.confidence || 0))) : 0,
    method: "gemini",
    reason: parsed.reason || "",
  };
}

async function analyzeBundles({ files, reports }) {
  const inputFiles = Array.isArray(files) ? files : [];
  if (!inputFiles.length) throw new Error("Nebyl vybrán žádný PDF nebo ZIP soubor.");
  if (inputFiles.length > 50) throw new Error("Najednou lze nahrát nejvýše 50 souborů.");
  const importId = `IMP-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
  const importDir = path.join(IMPORT_ROOT, importId);
  await fs.mkdir(importDir, { recursive: true });
  const unpacked = [];
  for (const file of inputFiles) {
    unpacked.push(...(await unpackBundle(file.buffer, decodeUploadedFilename(file.originalName))));
  }
  const candidates = [];
  for (let index = 0; index < unpacked.length; index += 1) {
    const item = unpacked[index];
    let classification = classifyFromFilename(item, reports);
    if (!classification.reportId) {
      try {
        classification = (await classifyWithGemini(item, reports)) || classification;
      } catch (error) {
        classification = { ...classification, reason: `AI rozpoznání selhalo: ${error.message}` };
      }
    }
    const candidateId = `P${String(index + 1).padStart(3, "0")}`;
    const storedName = `${candidateId}.${item.extension}`;
    await fs.writeFile(path.join(importDir, storedName), item.buffer);
    candidates.push({
      id: candidateId,
      sourceName: item.sourceName,
      pageNumber: item.pageNumber,
      mimeType: item.mimeType,
      storedName,
      ...classification,
    });
  }
  const originalNames = inputFiles.map((file) => file.originalName);
  const manifest = {
    importId,
    originalName: originalNames.length === 1 ? originalNames[0] : "",
    originalNames,
    createdAt: new Date().toISOString(),
    candidates,
  };
  await fs.writeFile(path.join(importDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}

async function analyzeBundle({ buffer, originalName, reports }) {
  return analyzeBundles({ files: [{ buffer, originalName }], reports });
}

async function loadManifest(importId) {
  if (!/^IMP-[a-z0-9-]+$/i.test(String(importId))) throw new Error("Neplatné ID importu.");
  const importDir = path.join(IMPORT_ROOT, importId);
  const manifest = JSON.parse(await fs.readFile(path.join(importDir, "manifest.json"), "utf8"));
  return { importDir, manifest };
}

async function mergeMappedCandidates(importId, mappings) {
  const { importDir, manifest } = await loadManifest(importId);
  const grouped = new Map();
  for (const mapping of mappings || []) {
    if (!mapping.reportId) continue;
    const candidate = manifest.candidates.find((item) => item.id === mapping.candidateId);
    if (!candidate) throw new Error(`Chybí stránka ${mapping.candidateId}.`);
    if (!grouped.has(mapping.reportId)) grouped.set(mapping.reportId, []);
    grouped.get(mapping.reportId).push(candidate);
  }

  const results = [];
  for (const [reportId, candidates] of grouped.entries()) {
    const target = await PDFDocument.create();
    for (const candidate of candidates) {
      const bytes = await fs.readFile(path.join(importDir, candidate.storedName));
      if (candidate.mimeType === "application/pdf") {
        const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await target.copyPages(source, source.getPageIndices());
        pages.forEach((page) => target.addPage(page));
      } else {
        const image = candidate.mimeType === "image/png"
          ? await target.embedPng(bytes)
          : await target.embedJpg(bytes);
        const scale = Math.min(A4.width / image.width, A4.height / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        const page = target.addPage([A4.width, A4.height]);
        page.drawImage(image, { x: (A4.width - width) / 2, y: (A4.height - height) / 2, width, height });
      }
    }
    results.push({ reportId, buffer: Buffer.from(await target.save()), pageCount: target.getPageCount() });
  }
  return { importDir, results };
}

async function removeImport(importDir) {
  const resolvedRoot = path.resolve(IMPORT_ROOT);
  const resolvedTarget = path.resolve(importDir);
  if (!resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("Import nelze odstranit mimo vyhrazenou složku.");
  }
  await fs.rm(resolvedTarget, { recursive: true, force: true });
}

module.exports = { analyzeBundle, analyzeBundles, decodeUploadedFilename, mergeMappedCandidates, removeImport };
