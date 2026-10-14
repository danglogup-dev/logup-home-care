/**
 * Called by incidentsStore.submit when an event is linked to a service user.
 * Links the event to the care plan (by ID) and raises an open review
 * suggestion for a person to decide on. Rule decisions come from
 * carePlanReviewRules; this file only wires stores together.
 */
import { associatedIncidentsStore, type IncidentSeverity } from "./associatedIncidentsStore";
import { carePlansStore, sectionKeysForCategories, templateSectionName } from "./carePlansStore";
import { serviceUsersStore } from "./serviceUsersStore";
import { sitesStore } from "./sitesStore";
import { orgSettingsStore } from "./orgSettingsStore";
import { SITE_PIC, type ServiceUserId, type StaffId } from "./demoDataRegistry";
import { ruleCategoryForEvent, evaluateEvent, addDays, LOGUP_REVIEW_LABEL, reassessmentsForEvent } from "./carePlanReviewRules";
import { assessmentsStore, ASSESSMENT_CATEGORY_LABELS } from "./assessmentsStore";

export function formatEventWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-IE", { day: "numeric", month: "short" })}, ${d.toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" })}`;
}

function occurredAtFrom(date?: string, time?: string): string {
  if (date) {
    const t = new Date(`${date}${time ? `T${time}` : ""}`);
    if (!isNaN(t.getTime())) return t.toISOString();
  }
  return new Date().toISOString();
}

const SEV: Record<string, IncidentSeverity> = { Low: "Low", Moderate: "Moderate", Severe: "High", Death: "Critical" };

export function raiseCarePlanReviewForEvent(input: {
  incidentId: string;
  serviceUserId: ServiceUserId;
  category: string;
  eventType?: string;
  incidentType?: string;
  narrative: string;
  severity: string;
  dateOfIncident?: string;
  timeOfIncident?: string;
}) {
  const su = serviceUsersStore.getById(input.serviceUserId);
  if (!su) return;
  const site = sitesStore.getById(su.siteId);
  const occurredAt = occurredAtFrom(input.dateOfIncident, input.timeOfIncident);
  const category = ruleCategoryForEvent(input);
  const prior = associatedIncidentsStore.forPerson(su.id).filter((x) => x.category === category).map((x) => x.occurredAt);
  const eventName = (input.incidentType || input.category || "Event").replace(/^General$/, "Event");

  associatedIncidentsStore.create({
    incidentId: input.incidentId,
    personId: su.id,
    organisationId: "ORG-001",
    siteId: su.siteId,
    eventType: eventName,
    category,
    subtype: input.narrative.slice(0, 80) || eventName,
    occurredAt,
    site: site?.name ?? "—",
    severity: SEV[input.severity] ?? "Moderate",
    status: "New event",
    reviewStage: "Awaiting triage",
    openActions: 0,
    careImpact: "not_checked",
  });

  const evaluation = evaluateEvent({
    category, occurredAt, narrative: input.narrative, hasServiceUser: true,
    eventLabel: `${eventName} on ${formatEventWhen(occurredAt)}`, priorSameCategory: prior,
  });
  if (!evaluation || !carePlansStore.getPlan(su.id)) return;

  const now = new Date().toISOString();
  const reviewer: StaffId = site?.carePlanReviewLeadStaffId ?? site?.personInChargeStaffId ?? SITE_PIC[su.siteId];
  // Categories → this person's plan sections (via their template), so renamed sections still match.
  const sectionKeys = sectionKeysForCategories(su.id, evaluation.sections);
  const aiSections = evaluation.ai
    .map((a) => ({ key: sectionKeysForCategories(su.id, [a.category])[0], reason: a.reason }))
    .filter((a) => a.key && !sectionKeys.includes(a.key));
  const sectionNames = sectionKeys.map((k) => templateSectionName(su.id, k));
  const reassessments = reassessmentsForEvent({
    eventCategory: category, sectionCategories: evaluation.sections, eventNoun: eventName, occurredAt,
    latest: (c) => assessmentsStore.latest(su.id, c),
    providerRules: orgSettingsStore.get().reassessmentRules,
    categoryLabel: (c) => ASSESSMENT_CATEGORY_LABELS[c],
  });
  carePlansStore.createReviewSuggestion({
    id: `RS-${Date.now().toString(36).toUpperCase()}`,
    personId: su.id,
    status: "open",
    title: evaluation.repeat ? "Repeat event detected — care plan review recommended" : "Care plan review suggested",
    reason: evaluation.reason,
    suggestedSections: sectionKeys,
    sourceIncidentId: input.incidentId,
    sources: [{ id: `EV-${input.incidentId}`, kind: "incident", refId: input.incidentId, label: `${eventName} — ${sectionNames.join(", ")}`, date: occurredAt, severity: input.severity }],
    createdAt: now,
    aiLabel: LOGUP_REVIEW_LABEL,
    label: LOGUP_REVIEW_LABEL,
    draftSectionKey: sectionKeys[0],
    draftText: "",
    eventLabel: eventName,
    occurredAt,
    reassessment: evaluation.reassessment,
    repeatReason: evaluation.repeat?.reason,
    aiSections,
    reassessments,
    dueAt: addDays(now, orgSettingsStore.get().defaultCarePlanReviewDays),
    reviewerStaffId: reviewer,
  });
  associatedIncidentsStore.markReviewSuggested(input.incidentId, [...sectionKeys, ...aiSections.map((a) => a.key)]);
}

/** Care plan status for an event, as shown on the Events side. */
export function carePlanStatusForEvent(incidentId: string): { label: string; detail?: string; personId?: string } {
  const link = associatedIncidentsStore.getById(incidentId);
  if (!link) return { label: "Not checked" };
  const sug = carePlansStore.getState().suggestions.find((s) => s.sourceIncidentId === incidentId);
  const personId = link.personId;
  switch (link.careImpact) {
    case "care_plan_updated": return { label: `Care plan updated v${link.linkedDraftVersion ?? ""}`.trim(), personId };
    case "no_review_required": return { label: "Not required", detail: link.impactReason ? `Reason: ${link.impactReason}${link.impactCheckedBy ? ` — ${link.impactCheckedBy}` : ""}` : undefined, personId };
    case "draft_created":
    case "draft_awaiting_approval":
    case "review_required":
      return { label: "Review in progress", detail: link.linkedDraftVersion ? `Draft update v${link.linkedDraftVersion}` : undefined, personId };
    case "review_suggested":
      return { label: "Review suggested", detail: sug?.dueAt ? `Due ${new Date(sug.dueAt).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}` : undefined, personId };
    default: return { label: "Not checked", personId };
  }
}
