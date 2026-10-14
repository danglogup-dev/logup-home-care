import { carePlansStore, canViewPersonCarePlan, SECTION_LABELS } from "./carePlansStore";
import { incidentsStore } from "./incidentsStore";
import { canViewFullRecord, getDefaultVisibility } from "./eventVisibility";
import { visitNotesStore } from "./visitNotesStore";
import { visitsStore } from "./visitsStore";
import { accessibleVisit } from "./visitActions";
import { serviceUsersStore } from "./serviceUsersStore";
import type { RoleState } from "./roleStore";

export function visitBriefSources(visitId: string, role: RoleState) {
  const visit = accessibleVisit(visitId, role);
  if (!visit) throw new Error("Visit unavailable.");
  const client = serviceUsersStore.getState().users.find((u) => u.id === visit.clientId);
  if (!client) throw new Error("Client unavailable.");
  const current = canViewPersonCarePlan(client.id, role) ? carePlansStore.getCurrentVersion(client.id) : undefined;
  const lastVisit = visitsStore.visitsForClient(client.id)
    .filter((v) => v.id !== visitId && v.checkOutAt && v.checkOutAt < visit.scheduledStart)
    .sort((a, b) => (b.checkOutAt ?? "").localeCompare(a.checkOutAt ?? ""))[0];
  return {
    clientId: client.id, visitId, lastVisitAt: lastVisit?.checkOutAt ?? null,
    accessNotes: client.accessNotes ?? "",
    carePlan: current?.status === "published" ? {
      versionId: current.id, publishedAt: current.publishedAt ?? null,
      sections: current.sections.filter((s) => (!s.visibility || s.visibility === "all_staff") && s.contentState !== "ai_draft")
        .map((s) => ({ label: s.label ?? SECTION_LABELS[s.key as keyof typeof SECTION_LABELS] ?? s.key, text: s.body })),
    } : null,
    notes: visitNotesStore.getState().filter((n) => n.client_id === client.id && n.confirmed_at)
      .sort((a, b) => b.confirmed_at.localeCompare(a.confirmed_at)).slice(0, 3)
      .map((n) => ({ id: n.id, confirmedAt: n.confirmed_at, text: n.final_text })),
    events: incidentsStore.getPending().filter((e) => e.serviceUserId === client.id && e.lifecycleStatus !== "Closed" && e.column !== "complete" && canViewFullRecord({
      role: role.role, scope: role.scope, viewerStaffId: role.staffId, recordSite: e.site,
      submitterStaffId: e.createdByStaffId, visibility: e.visibility ?? getDefaultVisibility(e.eventType),
    })).map((e) => ({ id: e.id, date: e.dateTime, summary: e.summary, status: e.lifecycleStatus ?? e.column, severity: e.severity })),
  };
}