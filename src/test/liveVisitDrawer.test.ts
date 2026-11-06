import { describe, it, expect, beforeEach } from "vitest";
import { visitAlertReviewStore, reviewsForVisit, createVisitFollowUp, tasksForVisit } from "@/lib/visitAlertReviewStore";
import { getTasks, completeTask } from "@/lib/tasksStore";
import { attendanceSummary } from "@/components/visits/LiveVisitDrawer";
import type { Visit } from "@/lib/visitsStore";

const missed = { id: "V1", clientId: "PS-001", staffIds: [], scheduledStart: "2026-11-06T09:00:00Z", scheduledEnd: "2026-11-06T09:30:00Z", status: "missed" } as unknown as Visit;

describe("Live visit review", () => {
  beforeEach(() => visitAlertReviewStore.reset());
  it("keeps no check-in, not delivered and confirmed missed distinct", () => {
    const a = attendanceSummary(missed, false);
    expect(a.checkIn).toBe("No check-in recorded");
    expect(a.delivery).toBe("Not confirmed as delivered");
    expect(a.missed).toBe("Not confirmed — flagged by timing only");
    expect(attendanceSummary(missed, true).missed).toBe("Confirmed missed by a manager");
  });
  it("acknowledging appends a review and never changes the visit", () => {
    visitAlertReviewStore.add({ visitId: "V1", alertId: "timing-V1", kind: "acknowledged", note: "", byStaffId: "STAFF-SIOBHAN" });
    expect(reviewsForVisit(visitAlertReviewStore.getState(), "V1")).toHaveLength(1);
    expect(missed.status).toBe("missed");
    expect(() => visitAlertReviewStore.add({ visitId: "V1", alertId: "x", kind: "investigation_note", note: " ", byStaffId: "S" })).toThrow();
  });
  const input = { visitId: "V1", alertId: "timing-V1", byStaffId: "STAFF-SIOBHAN", note: "Carer contacted; attendance remains unverified.", assessment: "not_confirmed" as const, evidenceBasis: "" };
  it("opening a review does not acknowledge it, and saving separates findings from assessment", () => {
    expect(visitAlertReviewStore.getState()).toHaveLength(0);
    const saved = visitAlertReviewStore.saveReview(input);
    const records = reviewsForVisit(visitAlertReviewStore.getState(), "V1");
    expect(records.map((r) => r.kind)).toEqual(["investigation_note", "assessment"]);
    expect(saved.findingsId).toBe(records[0].id);
    expect(saved.byStaffId).toBe("STAFF-SIOBHAN");
    expect(Number.isFinite(new Date(saved.at).getTime())).toBe(true);
  });
  it.each(["delivered_discrepancy", "missed"] as const)("requires findings and evidence before %s", (assessment) => {
    expect(() => visitAlertReviewStore.saveReview({ ...input, assessment })).toThrow("evidence basis");
    expect(() => visitAlertReviewStore.saveReview({ ...input, assessment, note: " ", evidenceBasis: "Carer telephone confirmation at 10:00" })).toThrow("findings");
    expect(visitAlertReviewStore.getState()).toHaveLength(0);
  });
  it("preserves prior findings and original attendance when assessments change", () => {
    const before = structuredClone(missed);
    const first = visitAlertReviewStore.saveReview({ ...input, assessment: "missed", evidenceBasis: "Client and carer both confirmed no attendance at 10:00" });
    const second = visitAlertReviewStore.saveReview({ ...input, assessment: "delivered_discrepancy", note: "Further evidence received from replacement carer.", evidenceBasis: "Replacement carer confirmation at 11:00" });
    expect(reviewsForVisit(visitAlertReviewStore.getState(), "V1")).toHaveLength(4);
    expect(visitAlertReviewStore.getState().find((r) => r.id === first.id)?.assessment).toBe("missed");
    expect(second.assessment).toBe("delivered_discrepancy");
    expect(missed).toEqual(before);
  });
  it("requires explicit linked follow-up save and rejects same-action open duplicates", () => {
    const review = visitAlertReviewStore.saveReview(input);
    const before = getTasks().length;
    const taskInput = { title: "Contact assigned carer to confirm visit delivery", description: "Phone the assigned carer and record their account.", taskType: "follow_up" as const, sourceType: "manual" as const, sourceRef: "V1", siteId: "SITE-ECK", assigneeId: "STAFF-SIOBHAN", assignedById: "STAFF-SIOBHAN", dueAt: "2026-11-07T12:00:00Z", priority: "high" as const, visitReviewLinks: { visitId: "V1", serviceUserId: "PS-001", alertId: "timing-V1", reviewId: review.id } };
    expect(getTasks()).toHaveLength(before);
    expect(() => createVisitFollowUp({ ...taskInput, visitReviewLinks: { ...taskInput.visitReviewLinks, reviewId: "missing" } })).toThrow("Save the manager review");
    const task = createVisitFollowUp(taskInput);
    expect(task.visitReviewLinks).toMatchObject(taskInput.visitReviewLinks);
    expect(task.assigneeId).toBe("STAFF-SIOBHAN");
    expect(task.dueAt).toBe("2026-11-07T12:00:00Z");
    expect(task.priority).toBe("high");
    expect(() => createVisitFollowUp({ ...taskInput, title: " CONTACT assigned carer to confirm visit delivery! " })).toThrow("open follow-up");
    expect(getTasks()).toHaveLength(before + 1);
    completeTask(task.id, "Carer contacted; investigation still ongoing.", "STAFF-SIOBHAN", "STAFF-SIOBHAN");
    expect(tasksForVisit(getTasks(), "V1").find((t) => t.id === task.id)?.activity.at(-1)?.byStaffId).toBe("STAFF-SIOBHAN");
    expect(visitAlertReviewStore.getState().find((r) => r.id === review.id)?.assessment).toBe("not_confirmed");
    expect(missed.checkInAt).toBeUndefined();
  });
});
