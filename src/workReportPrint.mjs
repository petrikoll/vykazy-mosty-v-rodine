import ExcelJS from "exceljs";
import JSZip from "jszip";
import { buildWorkbookBuffer } from "./workbookExport.mjs";

const TEMPLATE_FILE_URL = new URL("../data/ŠABLONA_Pracovní výkaz OPZ+.xlsx", import.meta.url).href;
const CONTRACT_LABELS = { PS: "Pracovní smlouva", "DPČ": "Dohoda o pracovní činnosti", DPP: "Dohoda o provedení práce" };

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const formatDate = (value) => value ? new Intl.DateTimeFormat("cs-CZ").format(new Date(value)) : "";

function assignedProjectFte(employee, positions) {
  return (employee.assignments || []).reduce((sum, assignment) => {
    const position = positions.find((item) => item.id === assignment.positionId);
    if (!position || position.active === false || !position.reportRequired || position.allocationType !== "fte") return sum;
    return sum + Number(assignment.fte ?? position.fte ?? 0);
  }, 0);
}

function columnNumber(label) {
  return [...label].reduce((value, character) => value * 26 + character.charCodeAt(0) - 64, 0);
}

function parseRange(range) {
  const [start, end = start] = String(range).split(":");
  const parseCell = (address) => {
    const match = /^([A-Z]+)(\d+)$/i.exec(address);
    return { column: columnNumber(match[1].toUpperCase()), row: Number(match[2]) };
  };
  return { start: parseCell(start), end: parseCell(end) };
}

function displayValue(cell) {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return formatDate(value);
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || "").join("");
    if (value.result !== undefined && value.result !== null) return value.result;
    if (value.text !== undefined) return value.text;
  }
  if (typeof value === "number") return value.toLocaleString("cs-CZ", { maximumFractionDigits: 2 });
  return String(value);
}

function cellCss(cell) {
  const styles = [];
  const fill = cell.fill;
  if (fill?.type === "pattern" && fill.pattern && fill.pattern !== "none") styles.push("background:#d9d9d9");
  if (cell.font?.bold) styles.push("font-weight:700");
  if (cell.alignment?.horizontal === "center") styles.push("text-align:center");
  if (cell.alignment?.horizontal === "right") styles.push("text-align:right");
  if (cell.alignment?.vertical === "middle") styles.push("vertical-align:middle");
  if (cell.alignment?.vertical === "top") styles.push("vertical-align:top");
  return styles.join(";");
}

function renderWorksheet(worksheet) {
  const merges = (worksheet.model.merges || []).map(parseRange);
  const mergeAt = (row, column) => merges.find((range) => row >= range.start.row && row <= range.end.row
    && column >= range.start.column && column <= range.end.column);
  const columnWidths = Array.from({ length: 7 }, (_, index) => Number(worksheet.getColumn(index + 1).width || 10));
  const widthTotal = columnWidths.reduce((sum, width) => sum + width, 0);
  const colgroup = columnWidths.map((width) => `<col style="width:${(width / widthTotal * 100).toFixed(3)}%">`).join("");
  const rows = [];

  for (let rowNumber = 7; rowNumber <= 45; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const hasEnteredActivity = rowNumber >= 21 && rowNumber <= 26
      && [worksheet.getCell(`B${rowNumber}`), worksheet.getCell(`G${rowNumber}`)].some((cell) => displayValue(cell) !== "");
    if (row.hidden && !hasEnteredActivity) continue;
    if (rowNumber === 43) {
      const declarationCell = worksheet.getCell("A43");
      const declaration = displayValue(declarationCell);
      const rowHeight = Number(row.height || 15);
      rows.push(`<tr class="declaration" style="height:${Math.max(3, rowHeight * 0.72).toFixed(1)}px"><td colspan="7" style="${cellCss(declarationCell)}">${declaration === "" ? "&nbsp;" : escapeHtml(declaration)}</td></tr>`);
      continue;
    }
    const cells = [];
    for (let column = 1; column <= 7; column += 1) {
      const merge = mergeAt(rowNumber, column);
      if (merge && (merge.start.row !== rowNumber || merge.start.column !== column)) continue;
      const cell = worksheet.getCell(rowNumber, column);
      const rowSpan = merge ? merge.end.row - merge.start.row + 1 : 1;
      const colSpan = merge ? merge.end.column - merge.start.column + 1 : 1;
      const attributes = `${rowSpan > 1 ? ` rowspan="${rowSpan}"` : ""}${colSpan > 1 ? ` colspan="${colSpan}"` : ""}`;
      const value = displayValue(cell);
      cells.push(`<td${attributes} style="${cellCss(cell)}">${value === "" ? "&nbsp;" : escapeHtml(value)}</td>`);
    }
    const isSpacer = !cells.some((cell) => !cell.includes("&nbsp;"));
    const rowHeight = Number(row.height || 15);
    rows.push(`<tr${isSpacer ? ' class="spacer"' : ""} style="height:${Math.max(3, rowHeight * 0.72).toFixed(1)}px">${cells.join("")}</tr>`);
  }
  return `<table class="template-grid"><colgroup>${colgroup}</colgroup><tbody>${rows.join("")}</tbody></table>`;
}

async function getTemplateBuffer(templateBuffer) {
  if (templateBuffer) return templateBuffer;
  const response = await fetch(TEMPLATE_FILE_URL);
  if (!response.ok) throw new Error("Nelze načíst šablonu výkazu.");
  return response.arrayBuffer();
}

async function extractLogoDataUrl(templateBuffer) {
  const archive = await JSZip.loadAsync(templateBuffer);
  const logoFile = archive.file("xl/media/image1.png");
  if (!logoFile) throw new Error("V šabloně chybí logo.");
  return `data:image/png;base64,${await logoFile.async("base64")}`;
}

async function buildReportPage({ report, project, employees, positions, templateBuffer, logoDataUrl }) {
  const employee = employees.find((item) => item.id === report.employeeId) || {
    id: report.employeeId,
    name: report.employeeName,
    globalFte: Number(report.fte || 0) || 1,
    assignments: [],
  };
  const position = positions.find((item) => item.id === report.positionId) || {};
  const role = { ...position, ...report, id: report.assignmentId, positionName: report.positionName };
  const totalFte = Number(employee.globalFte || 0) || assignedProjectFte(employee, positions);
  const built = await buildWorkbookBuffer({
    templateBuffer,
    project,
    employee,
    role,
    period: { month: report.month, year: report.year },
    absences: report.absences || {},
    totalFte,
    activities: report.activities || [],
    reportId: report.id,
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(built.buffer);
  const worksheet = workbook.worksheets[0];
  const approvalDate = formatDate(report.approvedAt || report.reviewedAt);
  const approvalName = report.approvedByName || report.reviewedByName || "";

  return `<article class="report">
    <img class="programme-logo" src="${logoDataUrl}" alt="Financováno Evropskou unií · Operační program Zaměstnanost plus">
    <div class="report-title">${escapeHtml(displayValue(worksheet.getCell("D5")))}</div>
    ${renderWorksheet(worksheet)}
    <div class="approval">Zkontrolováno a schváleno k podpisu${approvalName ? ` · ${escapeHtml(approvalName)}` : ""}${approvalDate ? ` · ${escapeHtml(approvalDate)}` : ""}</div>
    <div class="report-id">ID výkazu: ${escapeHtml(report.id)}</div>
  </article>`;
}

export async function buildWorkReportsPrintHtml(reports, project, employees = [], positions = [], suppliedTemplateBuffer = null) {
  const templateBuffer = await getTemplateBuffer(suppliedTemplateBuffer);
  const logoDataUrl = await extractLogoDataUrl(templateBuffer);
  const pages = [];
  for (const report of reports) {
    pages.push(await buildReportPage({ report, project, employees, positions, templateBuffer, logoDataUrl }));
  }
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><title>Tisk schválených výkazů</title><style>
    @page { size: A4 portrait; margin: 9mm 11mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #000; background: #fff; font-family: Arial, sans-serif; font-size: 9px; }
    .report { position: relative; width: 100%; break-after: page; page-break-after: always; }
    .report:last-child { break-after: auto; page-break-after: auto; }
    .programme-logo { display: block; width: 100%; height: 48px; object-fit: contain; margin: 0 auto 4px; }
    .report-title { height: 26px; padding-top: 4px; text-align: center; font-size: 15px; font-weight: 700; }
    .template-grid { width: 100%; table-layout: fixed; border-collapse: collapse; }
    .template-grid td { border: 1px solid #111; padding: 2px 3px; line-height: 1.12; overflow-wrap: anywhere; }
    .template-grid .spacer td { border: 0; padding: 0; }
    .template-grid .declaration td { border: 0; padding: 2px 3px; white-space: nowrap; overflow-wrap: normal; }
    .approval { margin-top: 5px; color: #475569; font-size: 7px; text-align: right; }
    .report-id { margin-top: 2px; color: #94a3b8; font-size: 6px; text-align: right; }
    @media screen { body { background:#e5e7eb; padding:20px; } .report { max-width: 190mm; min-height: 270mm; margin:0 auto 20px; padding:9mm 11mm; background:#fff; box-shadow:0 2px 12px #0002; } }
  </style></head><body>${pages.join("")}</body></html>`;
}

export async function printWorkReports(reports, project, employees = [], positions = []) {
  if (!reports.length) throw new Error("Nejsou vybrány žádné schválené výkazy.");
  const printWindow = window.open("", "_blank", "width=1000,height=850");
  if (!printWindow) throw new Error("Prohlížeč zablokoval tiskové okno. Povolte vyskakovací okna pro tuto aplikaci.");
  printWindow.opener = null;
  printWindow.document.write("<!doctype html><html lang=\"cs\"><body style=\"font-family:Arial;padding:24px\">Připravuji formuláře k tisku…</body></html>");
  printWindow.document.close();
  try {
    const html = await buildWorkReportsPrintHtml(reports, project, employees, positions);
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    printWindow.focus();
    printWindow.print();
  } catch (error) {
    printWindow.close();
    throw error;
  }
}

export { CONTRACT_LABELS };
