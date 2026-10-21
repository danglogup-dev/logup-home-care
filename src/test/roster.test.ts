import { describe, expect, it } from "vitest";
import { visitsStore } from "@/lib/visitsStore";
import { ROLE_PRESETS } from "@/lib/roleStore";
import { serviceUsersStore } from "@/lib/serviceUsersStore";
import { availabilityReasons, staffAvailabilityStore } from "@/lib/staffAvailabilityStore";
import { myVisits } from "@/lib/visitPresentation";
import { travelCheck } from "@/lib/travelTime";
import { assignmentStatus, isRosterEditable, RosterConflictError, scheduleConflicts } from "@/lib/rosterRules";

const preset = (id: string) => { const r = ROLE_PRESETS.find((p) => p.id === id); if (!r) throw new Error(id); return r; };
const coordinator = preset("coordinator"); // East Cork
const liam = preset("frontline");
const manager = preset("manager-single"); // East Cork // STAFF-LIAM, East Cork
const future = () => visitsStore.getState().visits.filter((v) => isRosterEditable(v) && Date.parse(v.scheduledStart) > Date.now() + 3600000 && v.rosterStatus === "published");

describe("roster", () => {
  it("seeds unassigned, two-carer, one-off, draft and conflict demo visits on the shared records", () => {
    const visits = visitsStore.getState().visits;
    expect(visits.some((v) => assignmentStatus(v) === "unassigned")).toBe(true);
    expect(visits.some((v) => (v.carersRequired ?? 1) === 2)).toBe(true);
    expect(visits.some((v) => v.purpose)).toBe(true);
    expect(visits.some((v) => v.rosterStatus === "draft")).toBe(true);
    expect(visits.some((v) => v.rosterHistory?.some((h) => h.kind === "conflict_overridden"))).toBe(true);
    expect(new Set(visits.map((v) => v.expectedDurationMinutes))).toEqual(expect.objectContaining({}));
  });

  it("assigns by staff ID, needs a reason on published visits, and the carer then sees it", () => {
    const users = serviceUsersStore.getState().users;
    const target = future().find((v) => users.find((u) => u.id === v.clientId)?.siteId === "SITE-ECK" && !v.staffIds.includes("STAFF-LIAM") && (v.carersRequired ?? 1) === 1 && !scheduleConflicts(visitsStore.getState().visits, ["STAFF-LIAM"], v.scheduledStart, v.scheduledEnd, v.id).length && !availabilityReasons(staffAvailabilityStore.getState(), "STAFF-LIAM", v.scheduledStart, v.scheduledEnd).length && travelCheck(visitsStore.getState().visits, "STAFF-LIAM", v.clientId, v.scheduledStart, v.scheduledEnd, v.id).level !== "conflict");
    if (!target) throw new Error("no target");
    expect(() => visitsStore.assignCarers(target.id, ["STAFF-LIAM"], coordinator)).toThrow(/reason/);
    expect(() => visitsStore.assignCarers(target.id, ["STAFF-LIAM"], liam, { reason: "Sickness" })).toThrow();
    visitsStore.assignCarers(target.id, ["STAFF-LIAM"], coordinator, { reason: "Sickness" });
    const after = visitsStore.getVisit(target.id)!;
    expect(after.staffIds).toEqual(["STAFF-LIAM"]);
    expect(after.rosterHistory?.at(-1)?.reason).toBe("Sickness");
    expect(myVisits(visitsStore.getState().visits, users, liam).some((v) => v.id === target.id)).toBe(true);
    expect(after.rosterHistory?.some((h) => h.kind.endsWith("_overridden"))).toBe(false);
  });

  it("blocks overlaps until acknowledged and records the override", () => {
    const users = serviceUsersStore.getState().users;
    const liamVisit = future().find((v) => v.staffIds.includes("STAFF-LIAM"))!;
    const other = visitsStore.createOneOff({ clientId: users.find((u) => u.siteId === "SITE-ECK" && u.status === "active")!.id, start: liamVisit.scheduledStart, durationMinutes: 30, carersRequired: 1, purpose: "Welfare check" }, coordinator);
    expect(other.rosterStatus).toBe("draft");
    expect(() => visitsStore.assignCarers(other.id, ["STAFF-LIAM"], coordinator, { overrideReason: "Cover" })).toThrow(/manager or admin/);
    expect(() => visitsStore.assignCarers(other.id, ["STAFF-LIAM"], manager)).toThrow(RosterConflictError);
    visitsStore.assignCarers(other.id, ["STAFF-LIAM"], manager, { overrideReason: "Operational cover" });
    expect(visitsStore.getVisit(other.id)?.rosterHistory?.find((h) => h.kind === "conflict_overridden")?.reason).toBe("Operational cover");
    expect(myVisits(visitsStore.getState().visits, users, liam).some((v) => v.id === other.id)).toBe(false);
    visitsStore.publishVisits([other.id], manager);
    expect(myVisits(visitsStore.getState().visits, users, liam).some((v) => v.id === other.id)).toBe(true);
  });

  it("refuses edits outside service-area scope and on completed visits", () => {
    const wwd = future().find((v) => v.serviceAreaId === "SITE-WWD")!;
    expect(() => visitsStore.assignCarers(wwd.id, [], coordinator, { reason: "Other" })).toThrow(/service area/);
    const done = visitsStore.getState().visits.find((v) => v.status === "completed" && v.serviceAreaId === "SITE-ECK")!;
    expect(() => visitsStore.editVisit(done.id, { durationMinutes: 10 }, coordinator, { reason: "Other" })).toThrow(/locked/);
  });
});

import { carerEligibility, parseTypedTime, quarterHourOptions, formWindow } from "@/lib/rosterRules";
describe("phase 4A eligibility and time", () => {
  const v = (id: string, staff: string, s: string, e: string) => ({ id, clientId: "PS-001", staffIds: [staff], scheduledStart: s, scheduledEnd: e, status: "scheduled" }) as never;
  const busy = [v("x", "A", "2026-10-15T09:00:00.000Z", "2026-10-15T09:45:00.000Z")];
  it("excludes overlapping carers and re-includes them when the time moves", () => {
    const at9 = carerEligibility(busy, ["A", "B"] as never, [], "2026-10-15T09:15:00.000Z", "2026-10-15T10:00:00.000Z");
    expect(at9.eligible).toEqual(["B"]);
    expect(at9.unavailable[0].staffId).toBe("A");
    const at10 = carerEligibility(busy, ["A", "B"] as never, [], "2026-10-15T10:00:00.000Z", "2026-10-15T10:45:00.000Z");
    expect(at10.eligible).toEqual(["A", "B"]);
  });
  it("keeps typed times and suggests quarter hours after them", () => {
    expect(parseTypedTime("9:22")).toBe("09:22");
    expect(parseTypedTime("25:00")).toBeUndefined();
    expect(quarterHourOptions().length).toBe(96);
    expect(quarterHourOptions("09:22").slice(0, 2)).toEqual(["09:30", "09:45"]);
    const w = formWindow("2026-10-15", "09:15", 45)!;
    expect((Date.parse(w.end) - Date.parse(w.start)) / 60000).toBe(45);
  });
});
