import assert from "node:assert/strict";
import { firstNameFromFullName, greetingName } from "../src/czechVocative.mjs";

assert.equal(firstNameFromFullName("Mgr. Jana Sedlářová"), "Jana");
assert.equal(greetingName("Petr Laštovica"), "Petře");
assert.equal(greetingName("Silvie Malíková"), "Silvo");
assert.equal(greetingName("Mgr. Martina Pírková"), "Martino");
assert.equal(greetingName("Iva Holcová"), "Ivo");
assert.equal(greetingName("Mgr. Jana Sedlářová"), "Jano");
assert.equal(greetingName("Mgr. Tereza Holleschová"), "Terezo");
assert.equal(greetingName("Lenka Nová"), "Lenko");

console.log("Czech vocative tests passed");
