const TITLE_TOKENS = new Set([
  "mgr.", "bc.", "ing.", "arch.", "phdr.", "mudr.", "judr.", "rndr.", "doc.", "prof.", "dis.",
]);

const VOCATIVES = new Map([
  ["petr", "Petře"],
  ["silvie", "Silvo"],
  ["martina", "Martino"],
  ["iva", "Ivo"],
  ["jana", "Jano"],
  ["tereza", "Terezo"],
  ["jan", "Jane"],
  ["martin", "Martine"],
  ["pavel", "Pavle"],
  ["karel", "Karle"],
  ["marek", "Marku"],
  ["michal", "Michale"],
  ["tomáš", "Tomáši"],
  ["lukáš", "Lukáši"],
  ["jiří", "Jiří"],
  ["david", "Davide"],
  ["jakub", "Jakube"],
  ["josef", "Josefe"],
  ["ondřej", "Ondřeji"],
  ["radek", "Radku"],
  ["zdeněk", "Zdeňku"],
]);

export function firstNameFromFullName(fullName = "") {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  return parts.find((part) => !TITLE_TOKENS.has(part.toLocaleLowerCase("cs-CZ"))) || String(fullName).trim();
}

export function greetingName(fullName = "") {
  const firstName = firstNameFromFullName(fullName);
  const known = VOCATIVES.get(firstName.toLocaleLowerCase("cs-CZ"));
  if (known) return known;
  if (firstName.toLocaleLowerCase("cs-CZ").endsWith("a")) return `${firstName.slice(0, -1)}o`;
  return firstName;
}
