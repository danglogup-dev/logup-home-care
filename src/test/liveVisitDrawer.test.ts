import { describe, it, expect, beforeEach } from "vitest";
import { visitAlertReviewStore, reviewsForVisit } from "@/lib/visitAlertReviewStore";
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
});
