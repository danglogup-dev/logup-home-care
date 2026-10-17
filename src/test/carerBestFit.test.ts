import { describe, it, expect, vi, afterEach } from "vitest";
import { compareCarerFit, dailyWorkload, recentContinuity, rankEligibleCarers, type CarerFit } from "@/lib/carerBestFit";
import { carerEligibility } from "@/lib/rosterRules";
import { staffAvailabilityStore } from "@/lib/staffAvailabilityStore";
import { workforceStore } from "@/lib/workforceStore";
import { visitsStore, type Visit } from "@/lib/visitsStore";
import type { StaffId } from "@/lib/demoDataRegistry";

const fit = (staffId: StaffId, changes: Partial<CarerFit> = {}): CarerFit => ({ staffId, recentVisits: 0, preferenceMatch: false, travelMinutes: 8, travelBasis: "previous", visitsToday: 4, scheduledMinutes: 195, primaryAreaMatch: true, competencyWarnings: 0, requiredCompetencies: 1, ...changes });
const visit = (id: string, start: string, changes: Partial<Visit> = {}): Visit => ({ id, clientId: "PS-002", staffIds: ["STAFF-EMMA"], scheduledStart: start, scheduledEnd: new Date(Date.parse(start) + 30 * 60000).toISOString(), status: "scheduled", ...changes });
const start = "2026-10-17T11:00:00Z", end = "2026-10-17T11:30:00Z";
const ctx = { siteId: "SITE-ECK" as const, availability: staffAvailabilityStore.getState(), clientId: "PS-002" };
afterEach(() => vi.restoreAllMocks());

describe("explainable best fit", () => {
  it("continuity of 12 vs 4 wins even when the less familiar carer has shorter travel", () => {
    expect(compareCarerFit(fit("STAFF-EMMA", { recentVisits: 12, travelMinutes: 17 }), fit("STAFF-AISLING", { recentVisits: 4, travelMinutes: 8 }))).toBeLessThan(0);
  });
  it("an applicable soft preference breaks a continuity tie before travel", () => {
    const ranked = rankEligibleCarers([], ["STAFF-LIAM", "STAFF-EMMA"], start, end, undefined, { ...ctx, preference: { type: "female_preferred", appliesTo: "all_visits" } });
    expect(ranked[0].staffId).toBe("STAFF-EMMA");
    expect(ranked.find((f) => f.staffId === "STAFF-LIAM")?.preferenceMatch).toBe(false);
  });
  it("a non-applicable intimate-care preference does not favour any carer", () => {
    const ranked = rankEligibleCarers([], ["STAFF-LIAM", "STAFF-EMMA"], start, end, undefined, { ...ctx, preference: { type: "female_preferred", appliesTo: "intimate_care_visits" }, requirement: { requiredQualificationIds: [], supportCategories: ["companionship"] } });
    expect(ranked.map((f) => f.preferenceMatch)).toEqual([false, false]);
  });
  it("prefers 8 minutes to 17 minutes when continuity and preference tie", () => {
    expect(compareCarerFit(fit("STAFF-EMMA", { travelMinutes: 8 }), fit("STAFF-AISLING", { travelMinutes: 17 }))).toBeLessThan(0);
  });
  it("never represents an unknown journey as zero minutes", () => {
    const ranked = rankEligibleCarers([], ["STAFF-EMMA"], start, end, undefined, ctx);
    expect(ranked[0].travelMinutes).toBeUndefined();
    expect(compareCarerFit(fit("STAFF-EMMA", { travelMinutes: undefined }), fit("STAFF-LIAM", { travelMinutes: 17 }))).toBeGreaterThan(0);
  });
  it("lower scheduled care minutes then fewer visits break a travel tie", () => {
    expect(compareCarerFit(fit("STAFF-EMMA", { scheduledMinutes: 180 }), fit("STAFF-AISLING", { scheduledMinutes: 195 }))).toBeLessThan(0);
    expect(compareCarerFit(fit("STAFF-EMMA", { visitsToday: 3 }), fit("STAFF-AISLING", { visitsToday: 4 }))).toBeLessThan(0);
  });
  it("primary service area influences otherwise equal options", () => {
    expect(compareCarerFit(fit("STAFF-EMMA"), fit("STAFF-AISLING", { primaryAreaMatch: false }))).toBeLessThan(0);
  });
  it("fewer relevant competencies due soon breaks the remaining tie", () => {
    expect(compareCarerFit(fit("STAFF-EMMA"), fit("STAFF-AISLING", { competencyWarnings: 1 }))).toBeLessThan(0);
  });
  it("counts only completed visits within the last 30 days, by staff and client ID", () => {
    const history = [visit("yes", "2026-10-01T09:00:00Z", { status: "completed" }), visit("old", "2026-09-01T09:00:00Z", { status: "completed" }), visit("scheduled", "2026-10-02T09:00:00Z"), visit("missed", "2026-10-03T09:00:00Z", { status: "missed" }), visit("other-client", "2026-10-04T09:00:00Z", { status: "completed", clientId: "PS-001" }), visit("other-staff", "2026-10-05T09:00:00Z", { status: "completed", staffIds: ["STAFF-LIAM"] }), visit("future", "2026-10-18T09:00:00Z", { status: "completed" })];
    expect(recentContinuity(history, "STAFF-EMMA", "PS-002", new Date(start))).toBe(1);
  });
  it("derives four visits and 3h 15m, excludes cancellations, another day and the edited visit", () => {
    const history = [45, 45, 45, 60].map((minutes, i) => visit(`v${i}`, start, { scheduledEnd: new Date(Date.parse(start) + minutes * 60000).toISOString() }));
    history.push(visit("cancelled", start, { status: "cancelled" }), visit("tomorrow", "2026-10-18T09:00:00Z"), visit("target", start));
    expect(dailyWorkload(history, "STAFF-EMMA", start, "target")).toEqual({ visitsToday: 4, scheduledMinutes: 195 });
  });
  it("normal suggestions contain only hard-eligible IDs even with excluded-carer continuity", () => {
    const busy = visit("busy", start);
    const result = carerEligibility([busy], ["STAFF-EMMA", "STAFF-LIAM"], [], start, end, undefined, ctx);
    expect(result.unavailable.some((u) => u.staffId === "STAFF-EMMA")).toBe(true);
    expect(result.bestFit?.some((f) => f.staffId === "STAFF-EMMA")).toBe(false);
    expect(result.bestFit?.map((f) => f.staffId)).toEqual(result.eligible);
  });
  it("ranking reads primary area and relevant competency status live without changing records", () => {
    const member = workforceStore.getStaffMember("STAFF-EMMA");
    if (!member) throw new Error("Missing demo staff");
    vi.spyOn(workforceStore, "getStaffMember").mockReturnValue({ ...member, primarySiteId: "SITE-WWD", qualifications: [{ qualificationId: "q-test", issuedOn: "2026-01-01", expiresOn: "2026-10-25" }] });
    const before = JSON.stringify(visitsStore.getState());
    const ranked = rankEligibleCarers([], ["STAFF-EMMA"], start, end, undefined, { ...ctx, requirement: { requiredQualificationIds: ["q-test"], supportCategories: [] } });
    expect(ranked[0].primaryAreaMatch).toBe(false);
    expect(ranked[0].competencyWarnings).toBe(1);
    expect(JSON.stringify(visitsStore.getState())).toBe(before);
  });
});