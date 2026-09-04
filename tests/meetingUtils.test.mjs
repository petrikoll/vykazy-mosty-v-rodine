import assert from "node:assert/strict";
import {
  contentFromLegacyMeeting,
  findTaskOwnerId,
  formatMeetingContent,
  meetingMinutesFromContent,
  meetingTasksFromRecord,
  normalizeTaskDeadline,
  parseMeetingTasks,
} from "../src/meetingUtils.mjs";

const content = formatMeetingContent("Tým projednal další postup.", [
  { text: "Připravit podklady", owner: "Jana", deadline: "2026-09-30" },
]);
assert.match(content, /^ZÁPIS\nTým projednal/m);
assert.match(content, /ÚKOLY\n- Připravit podklady \| Jana \| 2026-09-30/);
assert.deepEqual(parseMeetingTasks(content), [{ text: "Připravit podklady", owner: "Jana", deadline: "2026-09-30" }]);
assert.match(contentFromLegacyMeeting({ agenda: "Program", decisions: "Rozhodnutí", tasks: [] }), /Program\n\nRozhodnutí/);
assert.equal(meetingMinutesFromContent(content), "Tým projednal další postup.");
assert.equal(findTaskOwnerId("Jana Sedlářová", [{ id: "jana-1", name: "Mgr. Jana Sedlářová" }]), "jana-1");
assert.equal(normalizeTaskDeadline("30. 9. 2026"), "2026-09-30");
assert.equal(normalizeTaskDeadline("2026-10-02"), "2026-10-02");
assert.deepEqual(meetingTasksFromRecord({ notes: content }, [{ id: "jana-1", name: "Mgr. Jana Sedlářová" }]), [{
  id: "", text: "Připravit podklady", ownerId: "", owner: "Jana", deadline: "2026-09-30",
}]);

console.log("meeting utils tests passed");
