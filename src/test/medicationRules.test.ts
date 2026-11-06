import { describe, expect, it } from "vitest";
import { canResolveException, currentOutcome, documentationProgress, exceptionKind, permittedOutcomes, validateOutcome } from "@/lib/medicationRules";

describe("authorised medication outcomes", () => {
  it("never offers administration for prompting or assistance", () => {
    expect(permittedOutcomes("prompt", true)).toEqual(["prompted", "person_reports_taken", "refused", "not_completed", "not_observed"]);
    expect(permittedOutcomes("assist", true)).not.toContain("administered");
    expect(permittedOutcomes("administer", false)).not.toContain("administered");
    expect(permittedOutcomes("administer", true)).toContain("administered");
  });
  it("requires an explicit outcome, reason where needed and a real activity time", () => {
    const base = { support: "prompt" as const, canAdminister: false, reason: "", eventAt: "2026-11-06T09:35", now: new Date("2026-11-06T10:00:00Z") };
    expect(validateOutcome(base)).toMatch("Select");
    expect(validateOutcome({ ...base, outcome: "refused" })).toMatch("reason");
    expect(validateOutcome({ ...base, outcome: "refused", reason: "Mary declined; manager notified" })).toBe("");
    expect(validateOutcome({ ...base, outcome: "prompted", eventAt: "2026-11-06T10:30" })).toMatch("future");
  });
  it("uses deterministic exceptions and never treats missing documentation as a missed dose", () => {
    expect(exceptionKind("refused")).toBe("refusal");
    expect(exceptionKind("not_completed")).toBe("not_completed");
    expect(exceptionKind("prompted")).toBeUndefined();
  });
  it("leaves undocumented tasks outstanding instead of treating visit completion as administration", () => {
    expect(documentationProgress([{ id: "t1" }, { id: "t2" }], [{ task_id: "t1" }])).toEqual({ recorded: 1, total: 2, outstanding: 1 });
    expect(canResolveException({ status: "open" })).toBe(false);
    expect(canResolveException({ status: "acknowledged", acknowledged_at: "2026-11-06T10:00:00Z" })).toBe(false);
    expect(canResolveException({ status: "follow_up", acknowledged_at: "2026-11-06T10:00:00Z", follow_up: "Spoke with manager" })).toBe(true);
  });
  it("keeps corrections traceable to the original record", () => {
    const original = { id: "o1", task_id: "t1", correction_of: null, submitted_at: "2026-11-06T10:00:00Z" };
    const correction = { id: "o2", task_id: "t1", correction_of: "o1", submitted_at: "2026-11-06T10:05:00Z" };
    expect(currentOutcome([original, correction], "t1")?.id).toBe("o2");
    expect(currentOutcome([original, correction], "other")).toBeUndefined();
  });
});
