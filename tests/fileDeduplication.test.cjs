const assert = require("node:assert/strict");
const { fileHash, findDuplicateByFileHash } = require("../server/fileDeduplication.cjs");

const original = Buffer.from("stejny obsah souboru");
const renamed = Buffer.from("stejny obsah souboru");
const different = Buffer.from("jiny obsah souboru");

assert.equal(fileHash(original), fileHash(renamed), "přejmenovaný soubor má stejný otisk");
assert.notEqual(fileHash(original), fileHash(different), "jiný obsah má jiný otisk");
const record = { id: "one", fileHash: fileHash(original) };
assert.equal(findDuplicateByFileHash([record], fileHash(renamed)), record, "duplicita se najde podle obsahu");
assert.equal(findDuplicateByFileHash([record], fileHash(different)), null, "jiný soubor není duplicita");
assert.throws(() => fileHash("text"), /Buffer/, "neplatný vstup je odmítnut");

console.log("file deduplication tests passed");
