import assert from "node:assert/strict";
import {
  contentFromLegacyMeeting,
  findExternalTaskOwnerName,
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
assert.equal(findExternalTaskOwnerName("Laštovica", ["Petr Laštovica"]), "Petr Laštovica");
assert.equal(findExternalTaskOwnerName("Novák", ["Jan Novák", "Petr Novák"]), "");
assert.equal(normalizeTaskDeadline("30. 9. 2026"), "2026-09-30");
assert.equal(normalizeTaskDeadline("2026-10-02"), "2026-10-02");
assert.deepEqual(meetingTasksFromRecord({ notes: content }, [{ id: "jana-1", name: "Mgr. Jana Sedlářová" }]), [{
  id: "", text: "Připravit podklady", ownerIds: [], ownerNames: [], externalOwnerNames: [], ownerId: "", owner: "Jana", deadline: "2026-09-30", status: "", completionText: "", completionRecipientIds: [], completionRecipientNames: [], completedAt: "", completedBy: "", completedByName: "",
}]);
assert.deepEqual(meetingTasksFromRecord({ tasks: [{
  id: "task-1", text: "Odeslat podklady", ownerIds: ["jana-1", "petr-1"], ownerNames: ["Mgr. Jana Sedlářová", "Petr Laštovica"], ownerId: "jana-1", owner: "Mgr. Jana Sedlářová, Petr Laštovica", deadline: "2026-09-30",
  status: "completed", completionText: "Podklady byly odeslány.", completionRecipientIds: ["manager-1"], completionRecipientNames: ["Vedoucí"],
  completedAt: "2026-09-20T10:30:00.000Z", completedBy: "jana-1", completedByName: "Mgr. Jana Sedlářová",
}] }, [{ id: "jana-1", name: "Mgr. Jana Sedlářová" }, { id: "petr-1", name: "Petr Laštovica" }]), [{
  id: "task-1", text: "Odeslat podklady", ownerIds: ["jana-1", "petr-1"], ownerNames: ["Mgr. Jana Sedlářová", "Petr Laštovica"], externalOwnerNames: [], ownerId: "jana-1", owner: "Mgr. Jana Sedlářová, Petr Laštovica", deadline: "2026-09-30",
  status: "completed", completionText: "Podklady byly odeslány.", completionRecipientIds: ["manager-1"], completionRecipientNames: ["Vedoucí"],
  completedAt: "2026-09-20T10:30:00.000Z", completedBy: "jana-1", completedByName: "Mgr. Jana Sedlářová",
}]);

console.log("meeting utils tests passed");
