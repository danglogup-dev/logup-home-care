import { describe, expect, it } from "vitest";
import { ROLE_PRESETS, can, canAccess, canReviewEvents, canCoordinateVisit } from "@/lib/roleStore";
import { PEOPLE_SUPPORTED } from "@/lib/demoDataRegistry";
import { liveVisits, liveVisitAlerts, telephoneHref } from "@/lib/liveVisitRules";
import { EVENT_TYPES, inferEventType } from "@/lib/eventTypes";
import type { Visit } from "@/lib/visitsStore";
import type { IncidentCard } from "@/lib/incidentsStore";

const role = ROLE_PRESETS.find((p) => p.id === "coordinator");
if (!role) throw new Error("Missing coordinator preset");
const now = new Date(2026, 9, 14, 10);
const visit = (id: string, minutes: number, clientId: Visit["clientId"] = "PS-001", extra: Partial<Visit> = {}): Visit => ({ id, clientId, staffIds: ["STAFF-EMMA"], scheduledStart: new Date(now.getTime() + minutes * 60000).toISOString(), scheduledEnd: new Date(now.getTime() + (minutes + 30) * 60000).toISOString(), status: "scheduled", ...extra });
const event = (id: string, visitId: string, extra: Partial<IncidentCard> = {}): IncidentCard => ({ id, visitId, resident: "Ignored label", serviceUserId: "PS-001", category: "Other", severity: "Low", initialSeverity: "Low", site: "Ignored label", location: "Home", dateTime: now.toISOString(), column: "new", summary: "Concern recorded", actions: [], timeline: [], ...extra });

describe("coordinator live visits", () => {
  it("inherits manager access and actions, not admin grants", () => {
    for (const key of ["audits.overview", "tasks.register", "policies.library", "workforce.coverage", "incidents.board", "carePlans.create"] as const) expect(canAccess(key, "coordinator")).toBe(canAccess(key, "manager"));
    expect(canAccess("visits.live", "coordinator")).toBe(true);
    expect(canAccess("visits.live", "frontline")).toBe(false);
    expect(can("assign", "coordinator")).toBe(true);
    expect(can("policy.publish", "coordinator")).toBe(false);
    expect(canReviewEvents("SITE-ECK", role)).toBe(true);
    expect(canReviewEvents("SITE-WWD", role)).toBe(false);
    expect(canCoordinateVisit(undefined, role)).toBe(false);
  });
  it("joins scope by ID, not assigned staff; derives thresholds without mutations", () => {
    const input = [visit("scheduled", 30), visit("late", -15), visit("missed", -60), visit("other-area", -90, "PS-004"), visit("unknown", -90, "PS-999"), visit("tomorrow", 1440), visit("done", -90, "PS-001", { status: "completed", checkInAt: now.toISOString() })];
    const result = liveVisits(input, PEOPLE_SUPPORTED, [], role, now);
    expect(result.map((v) => v.id)).toEqual(["missed", "late", "scheduled", "done"]);
    expect(input[1].status).toBe("scheduled");
  });
  it("combines SOS, timing and new visit events, excludes closed, unlinked and other-area events", () => {
    const visits = [visit("missed", -60), visit("late", -15), visit("west", -60, "PS-004")];
    const events = [event("sos", "missed", { urgent: true }), event("new", "late"), event("closed", "late", { lifecycleStatus: "Closed" }), event("unlinked", "missing"), event("west", "west", { serviceUserId: "PS-004" }), event("old", "late", { dateTime: new Date(2026, 9, 13).toISOString() }), event("review", "late", { column: "review" }), event("mismatch", "late", { serviceUserId: "PS-004" })];
    const alerts = liveVisitAlerts(liveVisits(visits, PEOPLE_SUPPORTED, [], role, now), events, visits, PEOPLE_SUPPORTED, role, now);
    expect(alerts.map((a) => a.kind)).toEqual(["sos", "missed", "late", "event"]);
  });
  it("supports existing capture stamps and preserves open SOS from previous days", () => {
    const v = visit("v", 0);
    expect(liveVisitAlerts([], [event("legacy", "v", { dateTime: "14 Oct · 09:45" }), event("sos", "v", { urgent: true, dateTime: "13 Oct · 09:45" })], [v], PEOPLE_SUPPORTED, role, now).map((a) => a.id)).toEqual(["event-sos", "event-legacy"]);
  });
  it("offers telephone links only for valid direct numbers", () => {
    expect(telephoneHref("+353 (87) 123-4567")).toBe("tel:+353871234567");
    expect(telephoneHref(undefined)).toBeUndefined();
    expect(telephoneHref("javascript:alert(1)")).toBeUndefined();
  });
});

describe("home support event classification suggestions", () => {
  it.each([
    ["Missed visit", "The carer did not arrive for the missed visit"],
    ["Late visit", "The carer arrived late for the call"],
    ["No answer at door", "No answer at the door"],
    ["Unable to access home", "Could not access home, key safe broken"],
    ["Found on floor", "Found Paddy on the floor beside his bed"],
    ["Environmental hazard", "Exposed wiring and a trip hazard"],
    ["Lone worker concern", "Lone worker felt unsafe"],
  ] as const)("adds and infers %s", (type, text) => {
    expect(EVENT_TYPES).toContain(type);
    expect(inferEventType(text)).toBe(type);
    expect(inferEventType(type)).toBe(type);
  });
  it("preserves safeguarding and medication inference", () => {
    expect(inferEventType("Safeguarding concern, suspected neglect after a missed visit")).toBe("Safeguarding Concern");
    expect(inferEventType("Missed medication dose")).toBe("Medication Event");
  });
});