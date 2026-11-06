import { describe, expect, it } from "vitest";
import { getState as visitsState } from "@/lib/visitsStore";
import { visitNotesStore } from "@/lib/visitNotesStore";
import { serviceUsersStore } from "@/lib/serviceUsersStore";
import { carePlansStore } from "@/lib/carePlansStore";
import { createTask, getTasks } from "@/lib/tasksStore";
import { demoExceptionsInScope } from "@/lib/medicationDemoStore";
import { buildCareAssurance } from "@/lib/careAssurance";
import { buildTimeline } from "@/lib/serviceUserTimeline";

const build = () => buildCareAssurance({ visits: visitsState().visits, users: serviceUsersStore.getState().users, notes: visitNotesStore.getState(), exceptions: demoExceptionsInScope(["SITE-ECK"]), events: [], tasks: getTasks(), planFor: (id) => carePlansStore.getCurrentVersion(id), siteIds: ["SITE-ECK"] });

describe("Phase 3 care assurance", () => {
  it("historical notes leave only a few completed visits undocumented", () => {
    const noted = new Set(visitNotesStore.getState().map((n) => n.visit_id));
    const missing = visitsState().visits.filter((v) => v.status === "completed" && !noted.has(v.id));
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.length).toBeLessThan(15);
  });

  it("Mary's repeated unsteadiness produces a simulated AI insight linked to the actual notes, plus a care-plan difference", () => {
    const insights = build();
    const repeat = insights.find((i) => i.id === "INS-REPEAT-PS-002-mobility")!;
    expect(repeat.kind).toBe("ai_simulated");
    expect(repeat.sources.length).toBeGreaterThanOrEqual(3);
    const noteIds = new Set(visitNotesStore.getState().map((n) => n.id));
    repeat.sources.forEach((s) => expect(noteIds.has(s.id)).toBe(true));
    const plan = insights.find((i) => i.id === "INS-PLAN-PS-002-mobility")!;
    expect(plan.kind).toBe("rule");
    expect(plan.observed).toMatch(/independent/i);
  });

  it("creating a task from an insight changes its status and appears in the chronology", () => {
    const t = createTask({ title: "Care-plan review · Mary", taskType: "follow_up", sourceType: "insight", sourceRef: "INS-REPEAT-PS-002-mobility", siteId: "SITE-ECK", ownership: "person", assigneeId: "STAFF-DANIEL", assignedById: "STAFF-DANIEL", dueAt: new Date(Date.now() + 86_400_000).toISOString(), priority: "high", insightLinks: { insightId: "INS-REPEAT-PS-002-mobility", serviceUserId: "PS-002", sourceIds: [] } });
    expect(build().find((i) => i.id === "INS-REPEAT-PS-002-mobility")!.status).toBe("follow_up_assigned");
    const tl = buildTimeline("PS-002");
    expect(tl.some((i) => i.id === `TK-${t.id}` && i.origin === "manager")).toBe(true);
    expect(tl.some((i) => i.kind === "visit_note")).toBe(true);
    expect(tl.some((i) => i.kind === "visit")).toBe(true);
  });
});
