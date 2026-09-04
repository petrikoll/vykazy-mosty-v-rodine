import pdfMake from "pdfmake/build/pdfmake.js";
import pdfFonts from "pdfmake/build/vfs_fonts.js";
import { meetingMinutesFromRecord, meetingTasksFromRecord } from "./meetingUtils.mjs";

pdfMake.addVirtualFileSystem(pdfFonts);

export async function createMeetingPdf(meeting, project) {
  const meetingContent = meetingMinutesFromRecord(meeting);
  const meetingTasks = meetingTasksFromRecord(meeting);
  const definition = {
    pageSize: "A4",
    pageMargins: [48, 48, 48, 56],
    defaultStyle: { font: "Roboto", fontSize: 10, lineHeight: 1.25 },
    footer: (currentPage, pageCount) => ({ text: `${project.name} · ${currentPage}/${pageCount}`, alignment: "center", color: "#64748B", fontSize: 8 }),
    content: [
      { text: "ZÁPIS Z PORADY", style: "title" },
      { text: project.name, style: "project" },
      { margin: [0, 20, 0, 12], table: { widths: [90, "*"], body: [
        ["Datum", meeting.date], ["Účastníci", (meeting.participantNames || []).join(", ") || "-"],
        ["Zapsal/a", meeting.createdByName || "-"],
      ] }, layout: "lightHorizontalLines" },
      { text: "Zápis", style: "heading" }, { text: meetingContent || "Bez dalšího zápisu.", preserveLeadingSpaces: true },
      { text: "Úkoly", style: "heading" },
      meetingTasks.length ? { table: { headerRows: 1, widths: ["*", 130, 80], body: [
        [{ text: "Úkol", bold: true }, { text: "Pracovník", bold: true }, { text: "Termín", bold: true }],
        ...meetingTasks.map((task) => [task.text, task.owner || "Nepřiřazeno", task.deadline || "—"]),
      ] }, layout: "lightHorizontalLines" } : { text: "Bez úkolů.", color: "#64748B" },
      { text: `ID zápisu: ${meeting.id}`, margin: [0, 24, 0, 0], color: "#64748B", fontSize: 8 },
    ],
    styles: {
      title: { fontSize: 20, bold: true, color: "#1E3A8A" },
      project: { fontSize: 11, color: "#475569" },
      heading: { fontSize: 13, bold: true, color: "#0F172A", margin: [0, 16, 0, 6] },
    },
  };
  return pdfMake.createPdf(definition).getBlob();
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
