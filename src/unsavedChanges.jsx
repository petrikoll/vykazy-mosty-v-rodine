import { useLayoutEffect, useRef, useState } from "react";

const drafts = new Map();
const warning = "Máte neuložené změny. Opravdu chcete odejít a zahodit je?";
const snapshot = (value) => JSON.stringify(value, (_key, item) =>
  typeof File !== "undefined" && item instanceof File
    ? { name: item.name, size: item.size, lastModified: item.lastModified } : item);

export function hasUnsavedChanges() {
  return document.body?.dataset.criticalOperation === "true" || [...drafts.values()].some((dirty) => dirty());
}

export function confirmUnsavedChanges() {
  if (document.body?.dataset.criticalOperation === "true") {
    window.alert("Právě probíhá ukládání nebo zpracování. Počkejte prosím na jeho dokončení.");
    return false;
  }
  return !hasUnsavedChanges() || window.confirm(warning);
}

// Browsers intentionally use their own text for reload/close warnings.
if (typeof window !== "undefined") window.addEventListener("beforeunload", (event) => {
  if (!hasUnsavedChanges()) return;
  event.preventDefault();
  event.returnValue = "";
});

// resetValue is only for loading/successfully saving a form, never for user edits.
export function useGuardedState(initialValue) {
  const [value, setValue] = useState(initialValue);
  const current = useRef(value);
  const baseline = useRef(snapshot(value));
  const id = useRef(Symbol("form"));
  current.current = value;
  useLayoutEffect(() => {
    const key = id.current;
    drafts.set(key, () => snapshot(current.current) !== baseline.current);
    return () => { drafts.delete(key); };
  }, []);
  const resetValue = (next) => {
    const result = typeof next === "function" ? next(current.current) : next;
    baseline.current = snapshot(result);
    current.current = result;
    setValue(result);
  };
  const markSaved = (saved = current.current) => { baseline.current = snapshot(saved); };
  const confirmDiscard = () => snapshot(current.current) === baseline.current || window.confirm(warning);
  return [value, setValue, resetValue, { markSaved, confirmDiscard }];
}
