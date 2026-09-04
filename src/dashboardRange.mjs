function isoDate(value) {
  const normalized = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

export function dateInRange(value, dateFrom, dateTo) {
  const date = isoDate(value);
  return Boolean(date && date >= dateFrom && date <= dateTo);
}

export function dateRangesOverlap(itemFrom, itemTo, dateFrom, dateTo) {
  const start = isoDate(itemFrom);
  const end = isoDate(itemTo) || start;
  return Boolean(start && end >= dateFrom && start <= dateTo);
}

export function reportOverlapsRange(report, dateFrom, dateTo) {
  const year = Number(report?.year);
  const month = Number(report?.month);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return false;
  const firstDay = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDayNumber = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDay = `${year}-${String(month).padStart(2, "0")}-${String(lastDayNumber).padStart(2, "0")}`;
  return dateRangesOverlap(firstDay, lastDay, dateFrom, dateTo);
}

export function yearsCovered(dateFrom, dateTo) {
  const firstYear = Number(String(dateFrom).slice(0, 4));
  const lastYear = Number(String(dateTo).slice(0, 4));
  if (!Number.isInteger(firstYear) || !Number.isInteger(lastYear) || firstYear > lastYear) return [];
  return Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index);
}
