import { describe, expect, it } from "vitest";
import { visitsStore } from "@/lib/visitsStore";
import { ROLE_PRESETS } from "@/lib/roleStore";
import { serviceUsersStore } from "@/lib/serviceUsersStore";
import { myVisits } from "@/lib/visitPresentation";
import { assignmentStatus, isRosterEditable, RosterConflictError, scheduleConflicts } from "@/lib/rosterRules";

const preset = (id: string) => { const r = ROLE_PRESETS.find((p) => p.id === id); if (!r) throw new Error(id); return r; };
const coordinator = preset("coordinator"); // East Cork
const liam = preset("frontline"); // STAFF-LIAM, East Cork
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
    const target = future().find((v) => users.find((u) => u.id === v.clientId)?.siteId === "SITE-ECK" && !v.staffIds.includes("STAFF-LIAM") && (v.carersRequired ?? 1) === 1 && !scheduleConflicts(visitsStore.getState().visits, ["STAFF-LIAM"], v.scheduledStart, v.scheduledEnd, v.id).length);
    if (!target) throw new Error("no target");
    expect(() => visitsStore.assignCarers(target.id, ["STAFF-LIAM"], coordinator)).toThrow(/reason/);
    expect(() => visitsStore.assignCarers(target.id, ["STAFF-LIAM"], liam, { reason: "Sickness" })).toThrow();
    visitsStore.assignCarers(target.id, ["STAFF-LIAM"], coordinator, { reason: "Sickness" });
    const after = visitsStore.getVisit(target.id)!;
    expect(after.staffIds).toEqual(["STAFF-LIAM"]);
    expect(after.rosterHistory?.at(-1)?.reason).toBe("Sickness");
    expect(myVisits(visitsStore.getState().visits, users, liam).some((v) => v.id === target.id)).toBe(true);
  });

  it("blocks overlaps until acknowledged and records the override", () => {
    const users = serviceUsersStore.getState().users;
    const liamVisit = future().find((v) => v.staffIds.includes("STAFF-LIAM"))!;
    const other = visitsStore.createOneOff({ clientId: users.find((u) => u.siteId === "SITE-ECK" && u.status === "active")!.id, start: liamVisit.scheduledStart, durationMinutes: 30, carersRequired: 1, purpose: "Welfare check" }, coordinator);
    expect(other.rosterStatus).toBe("draft");
    expect(() => visitsStore.assignCarers(other.id, ["STAFF-LIAM"], coordinator)).toThrow(RosterConflictError);
    visitsStore.assignCarers(other.id, ["STAFF-LIAM"], coordinator, { acknowledgeConflict: true });
    expect(visitsStore.getVisit(other.id)?.rosterHistory?.some((h) => h.kind === "conflict_overridden")).toBe(true);
    expect(myVisits(visitsStore.getState().visits, users, liam).some((v) => v.id === other.id)).toBe(false);
    visitsStore.publishVisits([other.id], coordinator);
    expect(myVisits(visitsStore.getState().visits, users, liam).some((v) => v.id === other.id)).toBe(true);
  });

  it("refuses edits outside service-area scope and on completed visits", () => {
    const wwd = future().find((v) => v.serviceAreaId === "SITE-WWD")!;
    expect(() => visitsStore.assignCarers(wwd.id, [], coordinator, { reason: "Other" })).toThrow(/service area/);
    const done = visitsStore.getState().visits.find((v) => v.status === "completed" && v.serviceAreaId === "SITE-ECK")!;
    expect(() => visitsStore.editVisit(done.id, { durationMinutes: 10 }, coordinator, { reason: "Other" })).toThrow(/locked/);
  });
});
