import { canLogEvent, type RoleState } from "./roleStore";
import { featureFlags } from "./featureFlags";
import { serviceUsersStore } from "./serviceUsersStore";
import { visitsStore, type CheckLocation } from "./visitsStore";
import { myVisits } from "./visitPresentation";
import { incidentsStore, type FieldProvenance } from "./incidentsStore";

export function accessibleVisit(id: string, role: RoleState) {
  if (!featureFlags.visits) return undefined;
  return myVisits(visitsStore.getState().visits, serviceUsersStore.getState().users, role).find((v) => v.id === id);
}

export function sendVisitSos(id: string, role: RoleState, location?: CheckLocation) {
  const visit = accessibleVisit(id, role);
  const client = serviceUsersStore.getById(visit?.clientId);
  if (!visit || !client || !canLogEvent(client.siteId, role)) throw new Error("You cannot send an SOS for this visit.");
  const now = new Date();
  const iso = now.toISOString();
  const rawNote = `Urgent SOS raised by carer during visit ${visit.id}. ${location ? `Browser location: ${location.lat}, ${location.lng} (accuracy ${Math.round(location.accuracyM ?? 0)} m).` : "Browser location unavailable; carer sent SOS without location."} Nature of emergency and harm not yet recorded.`;
  const values = { visitId: visit.id, serviceUserId: client.id, urgent: "Yes — SOS requested by carer", location: location ? JSON.stringify(location) : "Unavailable" };
  const fieldProvenance: FieldProvenance[] = Object.entries(values).map(([key, value]) => ({ key, label: key, origin: "source", originalValue: value, value, state: "human_confirmed", confirmedByStaffId: role.staffId, confirmedByName: role.displayName, confirmedAt: iso }));
  const event = incidentsStore.submit({
    summary: `Urgent SOS · Visit ${visit.id}`,
    createdBy: role.displayName, createdByStaffId: role.staffId, fieldProvenance,
    severityDecision: { suggestedSeverity: "Severe", suggestedSeverityReason: "Carer requested urgent assistance; harm severity still requires review." },
    reporterSignOff: { staffId: role.staffId, name: role.displayName, confirmedAt: iso, statement: "I am raising an urgent SOS for this visit. This does not confirm harm severity or contact emergency services." },
  }, {
    site: role.scope.find((_, i) => role.scopeSiteIds[i] === client.siteId) ?? client.siteId,
    resident: client.id, serviceUserId: client.id, visitId: visit.id, urgent: true, capturedLocation: location,
    severity: "unsure", location: location ? `${location.lat}, ${location.lng}` : client.homeAddress ?? "Location unavailable",
    source: "text", text: rawNote, originalText: rawNote, eventType: "Incident / Accident", incidentType: "Other",
    dateOfIncident: now.toLocaleDateString("en-CA"), timeOfIncident: now.toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit", hour12: false }),
  });
  if (!event) throw new Error("SOS could not be recorded. Please try again.");
  visitsStore.linkSos(id, event.id);
  return event;
}