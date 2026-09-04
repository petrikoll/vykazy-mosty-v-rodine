const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const isDeepStrictEqual = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

function recordMap(records) {
  const map = new Map();
  for (const record of records || []) {
    if (!record?.id || map.has(record.id)) throw new Error("Databáze obsahuje chybějící nebo duplicitní ID. Ukládání bylo zastaveno.");
    map.set(record.id, record);
  }
  return map;
}

function changesBetween(before, after, collections) {
  return Object.entries(collections).flatMap(([type, collection]) => {
    const previous = recordMap(before[collection]);
    const next = recordMap(after[collection]);
    return [...new Set([...previous.keys(), ...next.keys()])]
      .filter((id) => !isDeepStrictEqual(previous.get(id), next.get(id)))
      .map((id) => ({ type, collection, id, before: previous.get(id), after: next.get(id) }));
  });
}

function cell(value) {
  if (value == null) return {};
  if (typeof value === "number" && Number.isFinite(value)) return { userEnteredValue: { numberValue: value } };
  if (typeof value === "boolean") return { userEnteredValue: { boolValue: value } };
  const text = String(value);
  if (text.length > 49000) throw new Error("Záznam je příliš dlouhý pro buňku Google Sheetu. Zkraťte prosím text.");
  // Explicit stringValue: text beginning with '=' is never executed as a formula.
  return { userEnteredValue: { stringValue: text } };
}

function rowRequest({ sheetId, headers, rowIndex }, values) {
  const rows = [{ values: values ? values.map(cell) : [] }];
  if (rowIndex < 0) return { appendCells: { sheetId, rows, fields: "userEnteredValue" } };
  return { updateCells: {
    range: { sheetId, startRowIndex: rowIndex + 1, endRowIndex: rowIndex + 2, startColumnIndex: 0, endColumnIndex: headers.length },
    rows, fields: "userEnteredValue",
  } };
}

module.exports = { recordMap, changesBetween, rowRequest, isDeepStrictEqual };
