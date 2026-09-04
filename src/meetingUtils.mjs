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

export function findExternalTaskOwnerName(owner, externalParticipantNames = []) {
  const normalizedOwner = normalizedPersonName(owner);
  if (!normalizedOwner) return "";
  const matches = externalParticipantNames.filter((name) => {
    const normalizedName = normalizedPersonName(name);
    return normalizedName === normalizedOwner
      || normalizedName.endsWith(` ${normalizedOwner}`)
      || normalizedOwner.endsWith(` ${normalizedName}`);
  });
  return matches.length === 1 ? matches[0] : "";
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

export function meetingTaskIdentity(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("cs-CZ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function meetingMinutesFromRecord(meeting = {}) {
  if (meeting.notes) return meetingMinutesFromContent(meeting.notes);
  return [meeting.agenda, meeting.decisions].filter(Boolean).join("\n\n").trim();
}

export function meetingTasksFromRecord(meeting = {}, employees = []) {
  const source = (meeting.tasks || []).length ? meeting.tasks : parseMeetingTasks(meeting.notes || "");
  return source.filter((task) => task?.text).map((task) => {
    const legacyOwnerId = task.ownerId || findTaskOwnerId(task.owner, employees);
    const ownerIds = [...new Set([
      ...(Array.isArray(task.ownerIds) ? task.ownerIds : []),
      legacyOwnerId,
    ].filter(Boolean))];
    return {
      id: task.id || "",
      text: String(task.text || "").trim(),
      ownerIds,
      ownerNames: Array.isArray(task.ownerNames)
        ? task.ownerNames
        : ownerIds.map((id) => employees.find((employee) => employee.id === id)?.name).filter(Boolean),
      externalOwnerNames: Array.isArray(task.externalOwnerNames) ? task.externalOwnerNames : [],
      ownerId: ownerIds[0] || "",
      owner: String(task.owner || "").trim(),
      deadline: normalizeTaskDeadline(task.deadline),
      status: task.status || "",
      completionText: String(task.completionText || "").trim(),
      completionRecipientIds: Array.isArray(task.completionRecipientIds) ? task.completionRecipientIds : [],
      completionRecipientNames: Array.isArray(task.completionRecipientNames) ? task.completionRecipientNames : [],
      completedAt: task.completedAt || "",
      completedBy: task.completedBy || "",
      completedByName: task.completedByName || "",
    };
  });
}

export function unresolvedMeetingTasks(meetings = [], employees = [], { beforeDate = "", excludeMeetingId = "" } = {}) {
  const seen = new Set();
  return meetings
    .filter((meeting) => meeting.id !== excludeMeetingId && meeting.status !== "draft" && (!beforeDate || !meeting.date || meeting.date <= beforeDate))
    .toSorted((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .flatMap((meeting) => meetingTasksFromRecord(meeting, employees).map((task) => ({
      ...task,
      sourceMeetingId: meeting.id,
      sourceMeetingDate: meeting.date || "",
    })))
    .filter((task) => {
      if (task.status === "completed") return false;
      const identity = task.id ? `id:${task.id}` : `text:${meetingTaskIdentity(task.text)}`;
      if (!meetingTaskIdentity(task.text) || seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
}

export function meetingFollowUpTasks(meeting = {}, meetings = [], employees = []) {
  return (meeting.followUpTaskRefs || []).map((reference) => {
    const sourceMeeting = meetings.find((item) => item.id === reference.meetingId);
    const task = sourceMeeting
      ? meetingTasksFromRecord(sourceMeeting, employees).find((item) => item.id === reference.taskId)
      : null;
    return task ? { ...task, sourceMeetingId: sourceMeeting.id, sourceMeetingDate: sourceMeeting.date || reference.sourceMeetingDate || "" } : null;
  }).filter(Boolean);
}

export function contentFromLegacyMeeting(meeting = {}) {
  if (meeting.notes && (/^ÚKOLY\s*$/mi.test(meeting.notes) || !(meeting.tasks || []).length)) return meeting.notes;
  if (meeting.notes) return formatMeetingContent(meeting.notes, meeting.tasks || []);
  const minutes = [meeting.agenda, meeting.decisions].filter(Boolean).join("\n\n");
  return formatMeetingContent(minutes, meeting.tasks || []);
}
