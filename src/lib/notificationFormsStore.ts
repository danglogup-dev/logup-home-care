// Notification Forms preparation store.
//
// LogUp prepares DRAFT Notification Forms from an incident record.
// A human reviews, edits, approves, and exports.
// Submission remains OUTSIDE LogUp unless manually recorded here.
//
// Rules enforced elsewhere (UI/permissions):
//  - Editing a draft field NEVER overwrites the source IncidentRecord.
//  - Human approval is required before export.
//  - AI is not the final decision-maker.

import { useEffect, useState } from "react";
import type { IncidentRecord } from "./incidentRecords";

// ---------- Types ----------

export type ServiceProfile =
  | "Disability Services"
  | "Older People Services"
  | "Generic / Not configured";

export type PdfTemplateStatus =
  | "Not uploaded" | "Uploaded" | "Mapping required" | "Ready";

export type MappingStatus =
  | "Not mapped" | "Partially mapped" | "Ready";

export interface NotificationTemplateField {
  key: string;
  label: string;
  required?: boolean;
  /** How to derive the initial draft value from an incident record. */
  from?: (i: IncidentRecord) => string;
  hint?: string;
}

export interface NotificationTemplate {
  templateId: string;
  templateCode: string;
  templateName: string;
  serviceProfile: ServiceProfile;
  timeframe: string;
  category: string;
  description: string;
  requiredFields: NotificationTemplateField[];
  optionalFields: NotificationTemplateField[];
  pdfTemplateStatus: PdfTemplateStatus;
  mappingStatus: MappingStatus;
  /** Loose matcher against IncidentRecord category/secondaryCategory. */
  suggestFor?: (i: IncidentRecord) => boolean;
}

export type NotificationDraftStatus =
  | "Not assessed"
  | "Possible notification"
  | "Notification form suggested"
  | "Draft form missing information"
  | "Draft form ready for review"
  | "Approved for export"
  | "Exported"
  | "Submitted outside LogUp"
  | "Marked not required, reason recorded";

export type NotificationFieldStatus =
  | "Populated from incident"
  | "Needs review"
  | "Missing required information"
  | "Manually edited"
  | "Approved";

export interface NotificationDraftField {
  key: string;
  label: string;
  required: boolean;
  sourceValue: string;   // original derived value (never mutated)
  sourceRef: string;     // "IncidentRecord.<path>" or similar
  value: string;         // current editable value
  status: NotificationFieldStatus;
  editedBy?: string;
  editedAt?: string;
  unavailableNote?: string;
}

export interface NotificationDraftApproval {
  reviewer: string;
  reviewedAt: string;
  confirmed: boolean;
}

export interface NotificationDraft {
  draftId: string;
  incidentId: string;
  templateId: string;
  status: NotificationDraftStatus;
  fields: NotificationDraftField[];
  approval?: NotificationDraftApproval;
  exportedAt?: string;
  submittedOutsideAt?: string;
  submittedOutsideBy?: string;
  submittedReference?: string;
  notRequired?: { reason: string; reviewer: string; reviewedAt: string };
  createdAt: string;
  updatedAt: string;
  audit: NotificationAuditEntry[];
}

export interface NotificationAuditEntry {
  at: string;
  actor: string;
  event: string;
  detail?: string;
}

// ---------- Templates (placeholder catalogue) ----------

const F = {
  person: {
    key: "personSupported", label: "Person Supported name", required: true,
    from: (i: IncidentRecord) => i.resident || "",
  },
  site: {
    key: "site", label: "Site", required: true,
    from: (i: IncidentRecord) => i.site || "",
  },
  dateTime: {
    key: "dateTime", label: "Date / time of incident", required: true,
    from: (i: IncidentRecord) => i.date || "",
  },
  narrative: {
    key: "narrative", label: "Incident description", required: true,
    from: (i: IncidentRecord) => i.summary || "",
  },
  immediate: {
    key: "immediateActions", label: "Immediate actions taken", required: true,
    from: (i: IncidentRecord) =>
      i.actions.filter(a => a.done).map(a => `• ${a.action} (${a.owner})`).join("\n") || "",
  },
  injury: {
    key: "injuryImpact", label: "Injury / impact", required: true,
    from: (i: IncidentRecord) => i.impact || "",
  },
  notifications: {
    key: "notificationsMade", label: "Notifications made", required: false,
    from: (i: IncidentRecord) =>
      i.regulatoryNotification?.authority
        ? `${i.regulatoryNotification.authority}${i.regulatoryNotification.reference ? ` · ${i.regulatoryNotification.reference}` : ""}`
        : "",
  },
  reviewer: {
    key: "reviewer", label: "Reviewer", required: true,
    from: (i: IncidentRecord) => i.reviewedBy || i.investigation?.author || "",
  },
  followUp: {
    key: "followUp", label: "Follow-up actions", required: false,
    from: (i: IncidentRecord) =>
      i.actions.filter(a => !a.done).map(a => `• ${a.action} (${a.owner}, due ${a.due})`).join("\n") || "",
  },
  carePlanImpact: {
    key: "carePlanImpact", label: "Care plan review impact", required: false,
    from: (_i: IncidentRecord) => "", // filled from associatedIncidentsStore at draft time
  },
} satisfies Record<string, NotificationTemplateField>;

const commonRequired: NotificationTemplateField[] = [
  F.person, F.site, F.dateTime, F.narrative, F.immediate, F.injury, F.reviewer,
];
const commonOptional: NotificationTemplateField[] = [
  F.notifications, F.followUp, F.carePlanImpact,
];

export const NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  {
    templateId: "TPL-NF03",
    templateCode: "NF03",
    templateName: "NF03 — Serious injury / incident",
    serviceProfile: "Generic / Not configured",
    timeframe: "Within 3 working days",
    category: "Serious injury / incident",
    description: "Notification of a serious injury or incident affecting a person supported.",
    requiredFields: commonRequired,
    optionalFields: commonOptional,
    pdfTemplateStatus: "Not uploaded",
    mappingStatus: "Not mapped",
    suggestFor: (i) => i.severity === "High" || i.severity === "Critical",
  },
  {
    templateId: "TPL-NF06",
    templateCode: "NF06",
    templateName: "NF06 — Alleged or confirmed abuse",
    serviceProfile: "Generic / Not configured",
    timeframe: "Within 3 working days",
    category: "Safeguarding",
    description: "Alleged, suspected or confirmed abuse of a person supported.",
    requiredFields: commonRequired,
    optionalFields: commonOptional,
    pdfTemplateStatus: "Not uploaded",
    mappingStatus: "Not mapped",
    suggestFor: (i) => /safeguard|abuse/i.test(`${i.category} ${i.secondaryCategory ?? ""}`),
  },
  {
    templateId: "TPL-NF09",
    templateCode: "NF09",
    templateName: "NF09 — Fire / loss of power / evacuation",
    serviceProfile: "Generic / Not configured",
    timeframe: "Within 3 working days",
    category: "Fire / environmental",
    description: "Fire, loss of essential utilities, or evacuation of the service.",
    requiredFields: commonRequired,
    optionalFields: commonOptional,
    pdfTemplateStatus: "Not uploaded",
    mappingStatus: "Not mapped",
    suggestFor: (i) => /fire|evacuat|power/i.test(`${i.category} ${i.secondaryCategory ?? ""} ${i.summary}`),
  },
  {
    templateId: "TPL-NF39A",
    templateCode: "NF39A",
    templateName: "NF39A — Restrictive practice / restraint",
    serviceProfile: "Disability Services",
    timeframe: "Quarterly return",
    category: "Restrictive practice",
    description: "Use of restrictive practice or restraint.",
    requiredFields: commonRequired,
    optionalFields: commonOptional,
    pdfTemplateStatus: "Not uploaded",
    mappingStatus: "Not mapped",
    suggestFor: (i) => /restraint|restrictive/i.test(`${i.category} ${i.secondaryCategory ?? ""} ${i.summary}`),
  },
  {
    templateId: "TPL-NF39B",
    templateCode: "NF39B",
    templateName: "NF39B — Fire alarm activation",
    serviceProfile: "Generic / Not configured",
    timeframe: "Quarterly return",
    category: "Fire alarm",
    description: "Activation of the fire alarm system (non-fire or fire).",
    requiredFields: commonRequired,
    optionalFields: commonOptional,
    pdfTemplateStatus: "Not uploaded",
    mappingStatus: "Not mapped",
    suggestFor: (i) => /fire alarm/i.test(`${i.category} ${i.secondaryCategory ?? ""} ${i.summary}`),
  },
  {
    templateId: "TPL-NF39D",
    templateCode: "NF39D",
    templateName: "NF39D — Quarterly return item",
    serviceProfile: "Generic / Not configured",
    timeframe: "Quarterly return",
    category: "Quarterly return",
    description: "Item included in the quarterly return.",
    requiredFields: commonRequired,
    optionalFields: commonOptional,
    pdfTemplateStatus: "Not uploaded",
    mappingStatus: "Not mapped",
  },
  {
    templateId: "TPL-NF39E",
    templateCode: "NF39E",
    templateName: "NF39E — Quarterly return item",
    serviceProfile: "Older People Services",
    timeframe: "Quarterly return",
    category: "Quarterly return",
    description: "Item included in the quarterly return.",
    requiredFields: commonRequired,
    optionalFields: commonOptional,
    pdfTemplateStatus: "Not uploaded",
    mappingStatus: "Not mapped",
  },
];

export function suggestedTemplatesFor(i: IncidentRecord): NotificationTemplate[] {
  return NOTIFICATION_TEMPLATES.filter(t => t.suggestFor?.(i));
}

export function getTemplate(id: string): NotificationTemplate | undefined {
  return NOTIFICATION_TEMPLATES.find(t => t.templateId === id);
}

// ---------- Store ----------

const drafts = new Map<string, NotificationDraft>(); // draftId -> draft
const listeners = new Set<() => void>();

function notify() { listeners.forEach(l => l()); }
function nowIso() { return new Date().toISOString(); }
function uid(prefix: string) { return `${prefix}-${Math.random().toString(36).slice(2, 9)}`; }

function buildFields(tpl: NotificationTemplate, incident: IncidentRecord): NotificationDraftField[] {
  const build = (f: NotificationTemplateField, required: boolean): NotificationDraftField => {
    const src = f.from ? f.from(incident) : "";
    const missing = required && !src.trim();
    return {
      key: f.key,
      label: f.label,
      required,
      sourceValue: src,
      sourceRef: `IncidentRecord.${f.key}`,
      value: src,
      status: missing ? "Missing required information" : (src ? "Populated from incident" : "Needs review"),
    };
  };
  return [
    ...tpl.requiredFields.map(f => build(f, true)),
    ...tpl.optionalFields.map(f => build(f, false)),
  ];
}

function recomputeStatus(d: NotificationDraft): NotificationDraft {
  if (d.notRequired) return { ...d, status: "Marked not required, reason recorded" };
  if (d.submittedOutsideAt) return { ...d, status: "Submitted outside LogUp" };
  if (d.exportedAt) return { ...d, status: "Exported" };
  if (d.approval?.confirmed) return { ...d, status: "Approved for export" };
  const missing = d.fields.some(f => f.required && !f.value.trim() && !f.unavailableNote);
  return { ...d, status: missing ? "Draft form missing information" : "Draft form ready for review" };
}

export const notificationFormsStore = {
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },

  listForIncident(incidentId: string): NotificationDraft[] {
    return Array.from(drafts.values()).filter(d => d.incidentId === incidentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  primaryForIncident(incidentId: string): NotificationDraft | undefined {
    return this.listForIncident(incidentId)[0];
  },

  createDraft(incident: IncidentRecord, templateId: string, actor: string): NotificationDraft {
    const tpl = getTemplate(templateId);
    if (!tpl) throw new Error(`Unknown template ${templateId}`);
    const now = nowIso();
    const d: NotificationDraft = {
      draftId: uid("NFD"),
      incidentId: incident.id,
      templateId,
      status: "Draft form missing information",
      fields: buildFields(tpl, incident),
      createdAt: now,
      updatedAt: now,
      audit: [{ at: now, actor, event: "Draft generated", detail: `Template ${tpl.templateCode}` }],
    };
    const withStatus = recomputeStatus(d);
    drafts.set(withStatus.draftId, withStatus);
    notify();
    return withStatus;
  },

  editField(draftId: string, fieldKey: string, value: string, actor: string) {
    const d = drafts.get(draftId); if (!d) return;
    const now = nowIso();
    const fields = d.fields.map(f => f.key === fieldKey ? {
      ...f, value,
      status: (f.required && !value.trim() && !f.unavailableNote)
        ? "Missing required information" as const
        : (value === f.sourceValue ? "Populated from incident" as const : "Manually edited" as const),
      editedBy: actor, editedAt: now,
    } : f);
    const next = recomputeStatus({
      ...d, fields, updatedAt: now,
      audit: [...d.audit, { at: now, actor, event: "Field edited", detail: fieldKey }],
    });
    drafts.set(draftId, next); notify();
  },

  markFieldUnavailable(draftId: string, fieldKey: string, note: string, actor: string) {
    const d = drafts.get(draftId); if (!d) return;
    const now = nowIso();
    const fields = d.fields.map(f => f.key === fieldKey ? {
      ...f, unavailableNote: note, status: "Manually edited" as const,
      editedBy: actor, editedAt: now,
    } : f);
    const next = recomputeStatus({
      ...d, fields, updatedAt: now,
      audit: [...d.audit, { at: now, actor, event: "Missing information noted", detail: `${fieldKey}: ${note}` }],
    });
    drafts.set(draftId, next); notify();
  },

  approveForExport(draftId: string, reviewer: string) {
    const d = drafts.get(draftId); if (!d) return;
    const missing = d.fields.some(f => f.required && !f.value.trim() && !f.unavailableNote);
    if (missing) return; // guard
    const now = nowIso();
    const next = recomputeStatus({
      ...d,
      approval: { reviewer, reviewedAt: now, confirmed: true },
      updatedAt: now,
      audit: [...d.audit, { at: now, actor: reviewer, event: "Draft approved for export" }],
    });
    drafts.set(draftId, next); notify();
  },

  recordExported(draftId: string, actor: string) {
    const d = drafts.get(draftId); if (!d) return;
    const now = nowIso();
    const next = recomputeStatus({
      ...d, exportedAt: now, updatedAt: now,
      audit: [...d.audit, { at: now, actor, event: "PDF exported" }],
    });
    drafts.set(draftId, next); notify();
  },

  recordSubmittedOutside(draftId: string, actor: string, reference: string) {
    const d = drafts.get(draftId); if (!d) return;
    const now = nowIso();
    const next = recomputeStatus({
      ...d, submittedOutsideAt: now, submittedOutsideBy: actor, submittedReference: reference,
      updatedAt: now,
      audit: [...d.audit, { at: now, actor, event: "Submission recorded outside LogUp", detail: reference }],
    });
    drafts.set(draftId, next); notify();
  },

  markNotRequired(incidentId: string, reason: string, reviewer: string) {
    const now = nowIso();
    // Create a lightweight draft-shaped record to hold the decision.
    const d: NotificationDraft = {
      draftId: uid("NFD"),
      incidentId,
      templateId: "",
      status: "Marked not required, reason recorded",
      fields: [],
      notRequired: { reason, reviewer, reviewedAt: now },
      createdAt: now,
      updatedAt: now,
      audit: [{ at: now, actor: reviewer, event: "Marked not required", detail: reason }],
    };
    drafts.set(d.draftId, d); notify();
    return d;
  },
};

// ---------- React hook ----------

// Keep the filtered list in component state instead of deriving it inside a
// useSyncExternalStore snapshot. `listForIncident` intentionally creates a new
// array, which makes it unsafe as an external-store snapshot and can trigger a
// render loop in production React. Store notifications now cause exactly one
// state refresh, while an absent incident always resolves to an empty list.
export function useNotificationDraftsForIncident(incidentId: string | null | undefined): NotificationDraft[] {
  const [incidentDrafts, setIncidentDrafts] = useState<NotificationDraft[]>(() =>
    incidentId ? notificationFormsStore.listForIncident(incidentId) : [],
  );

  useEffect(() => {
    const refresh = () => {
      setIncidentDrafts(incidentId ? notificationFormsStore.listForIncident(incidentId) : []);
    };

    refresh();
    return notificationFormsStore.subscribe(refresh);
  }, [incidentId]);

  return incidentDrafts;
}
