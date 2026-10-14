import { describe, expect, it } from "vitest";
import { timedVisitStatus } from "@/lib/visitRules";
import { visitsStore, type Visit } from "@/lib/visitsStore";
import { ROLE_PRESETS } from "@/lib/roleStore";
import { serviceUsersStore } from "@/lib/serviceUsersStore";
import { myVisits } from "@/lib/visitPresentation";
import { sendVisitSos } from "@/lib/visitActions";
import { incidentsStore } from "@/lib/incidentsStore";

describe("visit timing", () => {
  const start = new Date(2026, 9, 14, 7, 30);
  const visit: Visit = { id: "timing", clientId: "PS-001", staffIds: ["STAFF-LIAM"], scheduledStart: start.toISOString(), scheduledEnd: new Date(start.getTime() + 45 * 60000).toISOString(), status: "scheduled" };
  it("becomes late at 15 minutes and missed at 60 minutes", () => {
    expect(timedVisitStatus(visit, undefined, new Date(start.getTime() + 14 * 60000))).toBe("scheduled");
    expect(timedVisitStatus(visit, undefined, new Date(start.getTime() + 15 * 60000))).toBe("late");
    expect(timedVisitStatus(visit, undefined, new Date(start.getTime() + 59 * 60000))).toBe("late");
    expect(timedVisitStatus(visit, undefined, new Date(start.getTime() + 60 * 60000))).toBe("missed");
  });
  it("does not relabel checked-in, completed or cancelled visits", () => {
    const now = new Date(start.getTime() + 120 * 60000);
    expect(timedVisitStatus({ ...visit, checkInAt: start.toISOString(), status: "in_progress" }, undefined, now)).toBe("in_progress");
    for (const status of ["completed", "cancelled"] as const) expect(timedVisitStatus({ ...visit, status }, undefined, now)).toBe(status);
  });
});

describe("care recording and SOS", () => {
  it("records check-in, append-only outcomes and a frozen checkout log by staff ID", () => {
    const role = ROLE_PRESETS.find((r) => r.id === "frontline");
    if (!role) throw new Error("Missing carer");
    const visit = myVisits(visitsStore.getState().visits, serviceUsersStore.getState().users, role).find((v) => !v.checkInAt && v.status === "scheduled");
    if (!visit) throw new Error("Missing scheduled visit");
    const template = visitsStore.getState().templates.find((t) => t.id === visit.templateId);
    if (!template) throw new Error("Missing template");
    expect(() => visitsStore.recordTask(visit.id, 0, "done", role.staffId)).toThrow();
    expect(() => visitsStore.checkIn(visit.id, { lat: 51.9, lng: -8.1 }, "STAFF-EMMA")).toThrow();
    visitsStore.checkIn(visit.id, { lat: 51.9, lng: -8.1, accuracyM: 12 }, role.staffId);
    const checkedIn = visitsStore.getVisit(visit.id);
    expect(checkedIn?.checkInByStaffId).toBe(role.staffId);
    expect(checkedIn?.checkInLocation?.accuracyM).toBe(12);
    expect(() => visitsStore.checkIn(visit.id, { lat: 0, lng: 0 }, role.staffId)).toThrow();
    expect(() => visitsStore.checkOut(visit.id, role.staffId)).toThrow();
    template.tasks.forEach((_, i) => visitsStore.recordTask(visit.id, i, "done", role.staffId));
    visitsStore.recordTask(visit.id, 0, "refused", role.staffId);
    template.medications.forEach((_, i) => {
      expect(() => visitsStore.recordMedication(visit.id, i, "refused", "", role.staffId)).toThrow();
      visitsStore.recordMedication(visit.id, i, "refused", "Client declined", role.staffId);
    });
    visitsStore.checkOut(visit.id, role.staffId);
    const finished = visitsStore.getVisit(visit.id);
    expect(finished?.status).toBe("completed");
    expect(finished?.log?.tasks.filter((r) => r.index === 0).map((r) => r.outcome)).toEqual(["done", "refused"]);
    expect(finished?.log?.recordedByStaffId).toBe(role.staffId);
    expect(() => visitsStore.recordTask(visit.id, 0, "not_needed", role.staffId)).toThrow();
    expect(() => visitsStore.checkOut(visit.id, role.staffId)).toThrow();
  });
  it("links a human-raised SOS with location without overwriting an event draft or checking out", () => {
    const role = ROLE_PRESETS.find((r) => r.id === "frontline");
    if (!role) throw new Error("Missing carer");
    const visit = myVisits(visitsStore.getState().visits, serviceUsersStore.getState().users, role)[0];
    if (!visit) throw new Error("Missing visit");
    const draft = { site: "East Cork", resident: "PS-001", serviceUserId: "PS-001" as const, severity: "low", location: "Home", source: "text" as const, text: "Existing unsubmitted report" };
    incidentsStore.setDraft(draft);
    const before = visitsStore.getVisit(visit.id);
    const location = { lat: 51.9, lng: -8.1, accuracyM: 10 };
    const event = sendVisitSos(visit.id, role, location);
    expect(event.urgent).toBe(true);
    expect(event.visitId).toBe(visit.id);
    expect(event.serviceUserId).toBe(visit.clientId);
    expect(event.capturedLocation).toEqual(location);
    expect(event.createdByStaffId).toBe(role.staffId);
    expect(event.reporterSignOff?.staffId).toBe(role.staffId);
    expect(event.initialSeverity).toBe("Unsure");
    expect(event.severityDecision?.confirmedByStaffId).toBeUndefined();
    expect(incidentsStore.getDraft()).toEqual(draft);
    expect(visitsStore.getVisit(visit.id)?.checkOutAt).toBe(before?.checkOutAt);
    expect(visitsStore.getVisit(visit.id)?.sosEventIds).toContain(event.id);
    expect(() => sendVisitSos(visit.id, { ...role, role: "viewonly" }, location)).toThrow();
  });
});