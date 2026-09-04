const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return timestamp;
}

function parseTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

const roundedHours = (minutes) => Math.round((minutes / 60) * 100) / 100;

export function calculateTimeRangeHours(timeFrom, timeTo) {
  const from = parseTime(timeFrom);
  const to = parseTime(timeTo);
  if (from === null || to === null || to <= from) return 0;
  return roundedHours(to - from);
}

export function calculateInclusiveEducationHours({ dateFrom, dateTo, timeFrom, timeTo }) {
  const fromDate = parseDate(dateFrom);
  const toDate = parseDate(dateTo);
  const dailyHours = calculateTimeRangeHours(timeFrom, timeTo);
  if (fromDate === null || toDate === null || toDate < fromDate || dailyHours <= 0) return 0;
  const days = Math.round((toDate - fromDate) / DAY_MS) + 1;
  return Math.round(days * dailyHours * 100) / 100;
}
