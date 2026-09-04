export function formatMeetingContent(minutes, tasks = []) {
  const cleanMinutes = String(minutes || "").trim();
  const taskLines = (tasks || []).filter((task) => task?.text).map((task) => {
    const owner = String(task.owner || "neurčeno").trim() || "neurčeno";
    const deadline = String(task.deadline || "neurčeno").trim() || "neurčeno";
    return `- ${String(task.text).trim()} | ${owner} | ${deadline}`;
  });
  return [
    "ZÁPIS",
    cleanMinutes || "Bez dalšího zápisu.",
    "",
    "ÚKOLY",
    taskLines.length ? taskLines.join("\n") : "Bez úkolů.",
  ].join("\n");
}

export function parseMeetingTasks(content) {
  const lines = String(content || "").split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim().toLocaleUpperCase("cs-CZ").replace(/:$/, "") === "ÚKOLY");
  if (headingIndex < 0) return [];
  return lines.slice(headingIndex + 1).map((line) => line.trim().replace(/^[-•]\s*/, "")).filter((line) => line && !/^bez úkolů\.?$/i.test(line)).map((line) => {
    const [text, owner = "", deadline = ""] = line.split("|").map((part) => part.trim());
    return { text, owner: owner === "neurčeno" ? "" : owner, deadline: deadline === "neurčeno" ? "" : deadline };
  }).filter((task) => task.text);
}

export function contentFromLegacyMeeting(meeting = {}) {
  if (meeting.notes && (/^ÚKOLY\s*$/mi.test(meeting.notes) || !(meeting.tasks || []).length)) return meeting.notes;
  if (meeting.notes) return formatMeetingContent(meeting.notes, meeting.tasks || []);
  const minutes = [meeting.agenda, meeting.decisions].filter(Boolean).join("\n\n");
  return formatMeetingContent(minutes, meeting.tasks || []);
}
