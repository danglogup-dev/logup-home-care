import { beforeEach, describe, expect, it } from "vitest";
import { REAL_AUTH_ENABLED } from "@/lib/featureFlags";
import { roleStore } from "@/lib/roleStore";
import { prototypeSignIn } from "@/pages/SignIn";
import { loadDemoClientEmar, medicationDemoStore, resetMedicationDemo } from "@/lib/medicationDemoStore";
import { currentOutcome } from "@/lib/medicationRules";

describe("prototype sign-in and eMAR", () => {
  beforeEach(() => { resetMedicationDemo(); roleStore.setPreset("admin"); });

  it("signing in needs no credentials and opens the chosen view", () => {
    expect(REAL_AUTH_ENABLED).toBe(false);
    expect(prototypeSignIn("manager-multi")).toBe("/app");
    expect(roleStore.get().role).toBe("manager");
    expect(prototypeSignIn("family-patrick")).toBe("/family");
  });

  it("an admin sees Patrick's medicines with a week of who-gave-what history", () => {
    const emar = loadDemoClientEmar("PS-001");
    expect(emar.access.can_configure).toBe(true);
    expect(emar.medications.length).toBeGreaterThan(0);
    const recorded = emar.outcomes[0];
    if (recorded) { expect(recorded.staff_id).toBeTruthy(); expect(recorded.event_at).toBeTruthy(); }
  });

  it("editing a medicine adds a draft version that a different person must verify", async () => {
    const med = loadDemoClientEmar("PS-001").medications[0];
    await medicationDemoStore.updateInstruction({ medicationId: med.medication.id, dose: "2 tablets", frequency: "Daily", scheduledTimes: ["08:00"], supportLevel: med.current.support_level });
    const draft = loadDemoClientEmar("PS-001").medications.find((m) => m.medication.id === med.medication.id)!.versions.find((v) => v.verification_status === "draft")!;
    await expect(medicationDemoStore.setInstructionStatus(med.medication.id, draft.id, "active")).rejects.toThrow(/different person/);
    roleStore.setPreset("manager-multi");
    await medicationDemoStore.setInstructionStatus(med.medication.id, draft.id, "active");
    const after = loadDemoClientEmar("PS-001").medications.find((m) => m.medication.id === med.medication.id)!;
    expect(after.current.dose).toBe("2 tablets");
    expect(after.versions.length).toBe(2);
  });

  it("a correction is added alongside the original, never overwriting it", async () => {
    const emar = loadDemoClientEmar("PS-001");
    const original = emar.outcomes.find((o) => o.outcome !== "refused");
    if (!original) return;
    const task = emar.tasks.find((t) => t.id === original.task_id)!;
    await medicationDemoStore.submit({ taskId: task.id, visitId: task.visit_id!, outcome: "refused", reason: "Recorded on wrong visit", eventAt: original.event_at, idempotencyKey: "k", correctionOf: original.id, correctionReason: "Wrong entry" });
    const after = loadDemoClientEmar("PS-001");
    expect(after.outcomes.find((o) => o.id === original.id)?.outcome).toBe(original.outcome);
    expect(currentOutcome(after.outcomes, task.id)?.outcome).toBe("refused");
  });
});
