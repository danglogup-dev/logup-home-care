import { describe, expect, it } from "vitest";
import { getState as visitsState, DEMO_DAY_LIMITS } from "@/lib/visitsStore";
import { medicationDemoStore, demoExceptionsInScope, loadDemoClientEmar } from "@/lib/medicationDemoStore";
import { createTask, completeTask, getTasks } from "@/lib/tasksStore";
import { buildOperationalOverview } from "@/lib/operationalOverview";
import { ROLE_PRESETS, roleStore } from "@/lib/roleStore";
import { serviceUsersStore } from "@/lib/serviceUsersStore";

const manager = ROLE_PRESETS.find((p) => p.id === "manager-single")!;
const overview = () => buildOperationalOverview({ visits: visitsState().visits, templates: visitsState().templates, users: serviceUsersStore.getState().users, role: manager, notes: [], exceptions: demoExceptionsInScope(["SITE-ECK"]), scenarioEvents: [], submittedEvents: [], tasks: getTasks() });

describe("Phase 2 oversight", () => {
  it("Aisling has at most 6 visits today, with gaps between them", () => {
    const today = new Date().toDateString();
    const mine = visitsState().visits.filter((v) => v.staffIds.includes("STAFF-AISLING") && new Date(v.scheduledStart).toDateString() === today).sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
    expect(DEMO_DAY_LIMITS["STAFF-AISLING"]).toBe(6);
    expect(mine.length).toBeLessThanOrEqual(6);
    expect(mine.some((v) => v.id === "VIS-DEMO-MARY-0930")).toBe(true);
    for (let i = 1; i < mine.length; i++) expect(Date.parse(mine[i].scheduledStart)).toBeGreaterThan(Date.parse(mine[i - 1].scheduledEnd));
  });

  it("Aisling is the default frontline persona in the role switcher", () => {
    expect(ROLE_PRESETS.find((p) => p.role === "frontline")!.staffId).toBe("STAFF-AISLING");
  });

  it("a manually recorded refusal shows on Home, and closing its follow-up task changes neither the dose nor the exception", async () => {
    roleStore.setPreset("keyworker-aisling");
    const before = overview().openExceptions.length;
    const data = await medicationDemoStore.loadVisit("VIS-DEMO-MARY-0930");
    const task = data.tasks[0];
    await medicationDemoStore.submit({ taskId: task.id, visitId: task.visit_id!, outcome: "refused", reason: "Declined, said she felt sick", eventAt: new Date().toISOString(), idempotencyKey: "k1" });
    const after = overview();
    expect(after.openExceptions.length).toBe(before + 1);
    const exc = after.openExceptions.find((e) => e.task?.id === task.id)!;
    expect(exc.outcome?.outcome).toBe("refused");

    roleStore.setPreset("manager-single");
    const t = createTask({ title: "Follow up", taskType: "follow_up", sourceType: "medication_exception", siteId: "SITE-ECK", ownership: "person", assigneeId: "STAFF-DANIEL", assignedById: "STAFF-DANIEL", dueAt: new Date(Date.now() - 60_000).toISOString(), priority: "high", medicationLinks: { serviceUserId: "PS-002", visitId: task.visit_id!, medicationTaskId: task.id, medicationOutcomeId: exc.outcome!.id, exceptionId: exc.exception.id } });
    expect(overview().overdueTasks.map((x) => x.id)).toContain(t.id);
    completeTask(t.id, "Reviewed with GP, no harm", "Daniel Walsh", "STAFF-DANIEL");
    expect(overview().overdueTasks.map((x) => x.id)).not.toContain(t.id);
    const emar = loadDemoClientEmar("PS-002");
    expect(emar.exceptions.find((e) => e.id === exc.exception.id)!.status).toBe("open");
    expect(emar.outcomes.find((o) => o.id === exc.outcome!.id)!.outcome).toBe("refused");
  });
});
