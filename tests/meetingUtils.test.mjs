import assert from "node:assert/strict";
import { contentFromLegacyMeeting, formatMeetingContent, parseMeetingTasks } from "../src/meetingUtils.mjs";

const content = formatMeetingContent("Tým projednal další postup.", [
  { text: "Připravit podklady", owner: "Jana", deadline: "2026-09-30" },
]);
assert.match(content, /^ZÁPIS\nTým projednal/m);
assert.match(content, /ÚKOLY\n- Připravit podklady \| Jana \| 2026-09-30/);
assert.deepEqual(parseMeetingTasks(content), [{ text: "Připravit podklady", owner: "Jana", deadline: "2026-09-30" }]);
assert.match(contentFromLegacyMeeting({ agenda: "Program", decisions: "Rozhodnutí", tasks: [] }), /Program\n\nRozhodnutí/);

console.log("meeting utils tests passed");
