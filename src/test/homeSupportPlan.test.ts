import { describe, expect, it } from "vitest";
import { seedTemplates, publishedVersion, categoryForSectionKey, upgradeHomeSupportTemplate } from "@/lib/carePlanTemplateModel";
import { carePlansStore, sectionKeysForCategories } from "@/lib/carePlansStore";
import { ROLE_PRESETS } from "@/lib/roleStore";
import { visitsStore } from "@/lib/visitsStore";
import { validateVisitSchedule, type CarePlanVisitTemplate } from "@/lib/carePlanVisitSchedule";

describe("home support plan", () => {
  it("maps all requested sections and retains the protected review trail", () => {
    const template = seedTemplates().find((t) => t.id === "TPL-HS");
    if (!template) throw new Error("Template missing");
    const sections = publishedVersion(template)?.sections ?? [];
    expect(sections.map((s) => s.displayName)).toEqual(["About me and what matters to me", "My home and access", "My visit schedule", "Personal care", "Eating and drinking", "Medication support", "Moving and falls", "Skin", "Communication", "My family and circle of care", "Risks in the home", "Review notes"]);
    for (const s of sections) expect(categoryForSectionKey(s.sectionKey)).toBe(s.category);
    expect(sectionKeysForCategories("PS-001", ["falls", "mobility"])).toContain("mobility");
    const old = { ...template, versions: [{ ...template.versions[0], versionNumber: 1, sections: sections.filter((s) => s.sectionKey !== "visitSchedule") }] };
    const upgraded = upgradeHomeSupportTemplate([old])[0];
    expect(upgraded.versions[0].sections).toEqual(old.versions[0].sections);
    expect(upgraded.versions[0].status).toBe("superseded");
    expect(upgradeHomeSupportTemplate([upgraded])).toEqual([upgraded]);
  });

  it("validates the schedule without making up tasks", () => {
    const t: CarePlanVisitTemplate = { id: "call", callType: "morning", daysOfWeek: [1], windowStart: "08:00", windowEnd: "09:00", durationMinutes: 30, carersRequired: 1, tasks: ["Prepare breakfast"], medications: [] };
    expect(validateVisitSchedule([t])).toBeUndefined();
    expect(validateVisitSchedule([{ ...t, tasks: [] }])).toBeTruthy();
    expect(validateVisitSchedule([{ ...t, windowEnd: "07:00" }])).toBeTruthy();
    expect(validateVisitSchedule([t, t])).toBeTruthy();
  });

  it("keeps draft edits out of visits then publishes versioned tasks without changing recorded care", () => {
    const actor = ROLE_PRESETS.find((r) => r.id === "manager-single");
    if (!actor) throw new Error("Actor missing");
    const draft = carePlansStore.ensureDraft("PS-001", actor.displayName);
    if (!draft) throw new Error("Draft missing");
    carePlansStore.applyLatestTemplateToDraft("PS-001", actor.displayName);
    const before = visitsStore.getState();
    const recorded = before.visits.find((v) => v.clientId === "PS-001" && v.checkInAt);
    const future = before.visits.find((v) => v.clientId === "PS-001" && v.status === "scheduled" && new Date(v.scheduledStart) > new Date());
    if (!recorded || !future) throw new Error("Visits missing");
    const originalTemplate = before.templates.find((t) => t.id === recorded.templateId);
    const schedule: CarePlanVisitTemplate[] = [{ id: "plan-morning", callType: "morning", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], windowStart: "08:00", windowEnd: "09:00", durationMinutes: 35, carersRequired: 2, tasks: ["Plan-authored breakfast task"], medications: [{ name: "Confirmed medication", supportLevel: "assist" }] }];
    expect(() => carePlansStore.saveDraftVisitSchedule("PS-001", schedule, { ...actor, scopeSiteIds: ["SITE-WWD"] }, "Test change")).toThrow();
    carePlansStore.saveDraftVisitSchedule("PS-001", schedule, actor, "Agreed morning support");
    expect(visitsStore.getState()).toBe(before);
    const sec = carePlansStore.getPlan("PS-001")?.versions.find((v) => v.id === draft.id)?.sections.find((s) => s.key === "visitSchedule");
    expect(sec?.scheduleConfirmedByStaffId).toBe(actor.staffId);
    carePlansStore.approveAndPublish("PS-001", draft.id, actor.displayName);
    expect(visitsStore.templatesForClient("PS-001")[0].tasks).toEqual(["Plan-authored breakfast task"]);
    expect(visitsStore.getVisit(recorded.id)).toEqual(recorded);
    expect(visitsStore.getState().templates.find((t) => t.id === originalTemplate?.id)?.tasks).toEqual(originalTemplate?.tasks);
    expect(visitsStore.getVisit(future.id)?.status).toBe("cancelled");
    expect(visitsStore.getVisit(future.id)?.scheduleChange?.byStaffId).toBe(actor.staffId);
    const generated = visitsStore.visitsForClient("PS-001").filter((v) => v.templateId?.includes(draft.id));
    expect(generated.length).toBeGreaterThan(0);
    expect(generated.every((v) => !v.checkInAt)).toBe(true);
    const count = visitsStore.getState().visits.length;
    visitsStore.applyPublishedSchedule("PS-001", draft.id, schedule, actor.staffId);
    expect(visitsStore.getState().visits.length).toBe(count);
    const next = carePlansStore.ensureDraft("PS-001", actor.displayName);
    expect(next?.sections.find((s) => s.key === "visitSchedule")?.visitTemplates).toEqual(schedule);
  });
});