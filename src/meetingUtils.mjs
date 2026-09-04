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

export function meetingMinutesFromContent(content) {
  const lines = String(content || "").split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim().toLocaleUpperCase("cs-CZ").replace(/:$/, "") === "ZÁPIS");
  const taskIndex = lines.findIndex((line) => line.trim().toLocaleUpperCase("cs-CZ").replace(/:$/, "") === "ÚKOLY");
  const start = startIndex >= 0 ? startIndex + 1 : 0;
  const end = taskIndex >= start ? taskIndex : lines.length;
  const minutes = lines.slice(start, end).join("\n").trim();
  return /^bez dalšího zápisu\.?$/i.test(minutes) ? "" : minutes;
}

function normalizedPersonName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("cs-CZ")
    .replace(/\b(mgr|bc|ing|arch|phdr|mudr|judr|rndr|doc|prof)\.?\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findTaskOwnerId(owner, employees = []) {
  const normalizedOwner = normalizedPersonName(owner);
  if (!normalizedOwner) return "";
  const match = employees.find((employee) => {
    const normalizedEmployee = normalizedPersonName(employee.name);
    return normalizedEmployee === normalizedOwner
      || normalizedEmployee.endsWith(` ${normalizedOwner}`)
      || normalizedOwner.endsWith(` ${normalizedEmployee}`);
  });
  return match?.id || "";
}

export function normalizeTaskDeadline(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const czech = raw.match(/^(\d{1,2})\s*[.\/]\s*(\d{1,2})\s*[.\/]\s*(\d{4})$/);
  if (!czech) return "";
  const [, day, month, year] = czech;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function meetingMinutesFromRecord(meeting = {}) {
  if (meeting.notes) return meetingMinutesFromContent(meeting.notes);
  return [meeting.agenda, meeting.decisions].filter(Boolean).join("\n\n").trim();
}

export function meetingTasksFromRecord(meeting = {}, employees = []) {
  const source = (meeting.tasks || []).length ? meeting.tasks : parseMeetingTasks(meeting.notes || "");
  return source.filter((task) => task?.text).map((task) => ({
    id: task.id || "",
    text: String(task.text || "").trim(),
    ownerId: task.ownerId || findTaskOwnerId(task.owner, employees),
    owner: String(task.owner || "").trim(),
    deadline: normalizeTaskDeadline(task.deadline),
  }));
}

export function contentFromLegacyMeeting(meeting = {}) {
  if (meeting.notes && (/^ÚKOLY\s*$/mi.test(meeting.notes) || !(meeting.tasks || []).length)) return meeting.notes;
  if (meeting.notes) return formatMeetingContent(meeting.notes, meeting.tasks || []);
  const minutes = [meeting.agenda, meeting.decisions].filter(Boolean).join("\n\n");
  return formatMeetingContent(minutes, meeting.tasks || []);
}
