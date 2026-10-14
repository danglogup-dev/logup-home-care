// Lightweight in-memory store for events (formerly "incidents") captured via
// the Events flow, so submitted drafts appear as new cards on the Board.

import type { SourceLanguage } from "./translation";
import { NEXT_EVENT_NUMBER, DEMO_YEAR } from "./demoScenario";
import { STAFF } from "./demoDataRegistry";
import type {
  PrimaryCategory, RiskImpact, RiskLikelihood, LifecycleStatus,
  InvestigationRecord, ClosureRecord, EvidenceLink, RegulatoryNotificationRecord,
} from "./incidentGovernance";
import type { EvidenceItem } from "./evidence";
import { DEFAULT_EVENT_TYPE, type EventType } from "./eventTypes";
import { getDefaultVisibility, type VisibilityMode, type VisibilityChange } from "./eventVisibility";
import type {
  LearningSummary, LinkedRef, LinkedRefKind, ProportionateResponse,
  ReviewLevel, EscalationFlag,
} from "./learningStore";
import { aiDraftLearning, aiDraftProportionate } from "./learningStore";
import { serviceUsersStore, serviceUserName } from "./serviceUsersStore";
import { raiseCarePlanReviewForEvent } from "./carePlanReviewTrigger";
import type { ServiceUserId, StaffId } from "./demoDataRegistry";



export type Severity = "Low" | "Moderate" | "Severe" | "Death";
export type InitialSeverity = "Low" | "Moderate" | "High" | "Critical" | "Unsure";
export type ColumnId = "new" | "review" | "actions" | "complete";
export type ActionStatus = "Open" | "In progress" | "Complete" | "Overdue";

export type IncidentType =
  | "Fall"
  | "Medication error"
  | "Behavioural"
  | "Missing person"
  | "Suspected abuse / neglect"
  | "Restraint"
  | "Skin integrity"
  | "Near miss"
  | "Other";

export interface ActionItem {
  id: string;
  title: string;
  assignee: string;
  due: string;
  status: ActionStatus;
  instruction?: string;
  createdBy: string;
  createdAt: string;
  completedBy?: string;
  completedAt?: string;
  completionNote?: string;
}

export interface TimelineEntry {
  id: string;
  ts: string;
  who: string;
  what: string;
}

export interface ClarificationExchange {
  id: string;
  question: string;
  answer: string;
  ts: string;
}

export interface DraftSection {
  label: string;
  body: string;
}

export interface ResidentDemographics {
  age?: number;
  gender?: string;
  room?: string;
}

export interface InjuryDetail {
  sustained: boolean;
  type?: string;
  bodyArea?: string;
  note?: string;
}

export type NotificationKey = "family" | "gp" | "gardai" | "hiqa" | "mhc" | "hsa";

export interface NotificationStatus {
  notified: boolean;
  ts?: string;
  by?: string;
  notApplicable?: boolean;
}

export type NotificationsRecord = Record<NotificationKey, NotificationStatus>;

export interface NotifiableAssessment {
  flagged: boolean;
  framework?: "HIQA NIMS" | "MHC" | "Patient Safety Act 2023" | "Multiple";
  rationale?: string;
  autoSuggested?: boolean;
}

export interface OpenDisclosure {
  required: "Yes" | "No" | "Not yet decided";
  discussedOn?: string;
  discussedWith?: string;
}

export interface IncidentSubmission {
  capturedBy: string;
  capturedAt: string;
  source: "text" | "voice";
  rawNote: string;
  // Multilingual capture
  sourceLanguage?: SourceLanguage;
  languageAutoDetected?: boolean;
  originalText?: string;     // verbatim user input / transcript in source language
  translatedText?: string;   // English translation used to build the structured draft
  voiceDurationSec?: number;
  draftSections: DraftSection[];
  clarifications: ClarificationExchange[];
  outstandingFlags: string[];

  // Classification
  /** User-facing top-level Event Type (12 categories). */
  eventType: EventType;
  incidentType: IncidentType;
  dateOfIncident?: string;
  timeOfIncident?: string;

  // People
  residentDemographics?: ResidentDemographics;
  staffInvolved: string[];
  witnesses: string[];
  otherWitnesses?: string;

  // Impact
  injury: InjuryDetail;
  medicationTreatment?: string;
  immediateActions?: string;

  // Regulatory
  notifications: NotificationsRecord;
  notifiable: NotifiableAssessment;
  openDisclosure: OpenDisclosure;

  // Reviewer-added (optional at capture)
  contributoryFactors?: string;
  reviewNotes?: string;
  prevention?: string;
}

// === Reporter sign-off & field provenance =================================
/** Where a structured field's value came from, and whether a person has confirmed it. */
export type FieldState = "source" | "ai_draft" | "human_confirmed";
export const FIELD_STATE_LABEL: Record<FieldState, string> = {
  source: "Source", ai_draft: "AI draft", human_confirmed: "Human confirmed",
};
export interface FieldProvenance {
  key: string;
  label: string;
  /** How the value first arrived (never changes). */
  origin: "source" | "ai_draft";
  originalValue: string;
  value: string;
  state: FieldState;
  edited?: boolean;
  confirmedByStaffId?: StaffId;
  confirmedByName?: string;
  confirmedAt?: string; // ISO
}
export interface SeverityDecision {
  suggestedSeverity: Severity;
  suggestedSeverityReason: string;
  confirmedSeverity?: Severity;
  confirmedByStaffId?: StaffId;
  confirmedAt?: string; // ISO
}
export interface NotificationSuggestion {
  key: NotificationKey;
  suggested: boolean;
  reason: string;
  confirmed?: boolean;
  confirmedByStaffId?: StaffId;
  confirmedAt?: string; // ISO
}
export interface ReporterSignOff {
  staffId?: StaffId;
  name: string;
  confirmedAt: string; // ISO
  statement: string;
}
/** Information added after submission. The original record is never changed. */
export interface Amendment {
  id: string;
  addedAt: string; // ISO
  addedByStaffId?: StaffId;
  addedByName: string;
  reason: string;
  text: string;
}

/** Fixed-rule severity suggestion (LogUp suggestion). Never auto-confirmed. */
export function suggestSeverity(d: Pick<DraftDetails, "text" | "injurySustained" | "injuryNote" | "immediateActions">): { severity: Severity; reason: string } {
  const all = [d.text, d.injuryNote, d.immediateActions].filter(Boolean).join(" ").toLowerCase();
  if (/\b(died|death|deceased|passed away|fatal)\b/.test(all)) return { severity: "Death", reason: "A death is described." };
  const serious = all.match(/\b(fracture|broken|hospital|ambulance|a&e|unconscious|head injury|bleeding heavily)\b/);
  if (serious) return { severity: "Severe", reason: `Serious harm indicated ("${serious[1]}").` };
  const gp = /\b(gp|doctor|nurse assessed|out of hours)\b/.test(all);
  if (d.injurySustained) return { severity: "Moderate", reason: `Injury reported${gp ? ", GP contacted" : ""}.` };
  if (gp) return { severity: "Moderate", reason: "No injury recorded, but clinical follow-up mentioned." };
  return { severity: "Low", reason: "No injury or clinical follow-up reported." };
}

/** Fixed-rule notification suggestions (LogUp suggestion). Never auto-confirmed. */
export function suggestNotifications(d: DraftDetails): NotificationSuggestion[] {
  const all = [d.text, d.injuryNote, d.immediateActions].filter(Boolean).join(" ").toLowerCase();
  const sev = suggestSeverity(d).severity;
  const type = d.incidentType || inferType(d.text);
  const notif = autoSuggestNotifiable(type, sev);
  const out: NotificationSuggestion[] = [
    { key: "family", suggested: !!d.serviceUserId && (d.injurySustained || sev !== "Low"), reason: d.serviceUserId ? (d.injurySustained || sev !== "Low" ? "A person was involved and harm or follow-up is reported." : "No harm reported.") : "No person linked." },
    { key: "gp", suggested: !!d.injurySustained || type === "Medication error" || sev === "Severe", reason: d.injurySustained ? "Injury reported." : type === "Medication error" ? "Medication error." : "No injury or medication issue reported." },
    { key: "gardai", suggested: /\b(theft|stolen|assault|police|garda|missing person)\b/.test(all), reason: "Only if a crime or missing person is described." },
    { key: "hiqa", suggested: notif.flagged, reason: notif.flagged ? (notif.rationale || "Meets a notifiable rule.") : "No notifiable rule met." },
  ];
  return out;
}

export interface IncidentCard {
  id: string;
  /** Display label only — derived from serviceUserId when linked. */
  resident: string;
  /** Linked service user (shared serviceUsersStore id). */
  serviceUserId?: ServiceUserId;
  /** Reporter chose "No service user involved" (site-level event). */
  noServiceUserInvolved?: boolean;
  /** Signed-in reporter. */
  createdByStaffId?: StaffId;
  createdByName?: string;
  category: string;
  /** User-facing Event Type (defaults to "Incident / Accident" for legacy data). */
  eventType?: EventType;
  /** Optional fine-grained primary classification per governance spec. */
  primaryCategory?: PrimaryCategory;
  secondaryCategory?: PrimaryCategory;
  severity: Severity;
  initialSeverity: InitialSeverity;
  // Lightweight risk assessment
  impact?: RiskImpact;
  likelihood?: RiskLikelihood;
  // Governance lifecycle (independent of board column)
  lifecycleStatus?: LifecycleStatus;
  // Investigation / closure / linked evidence / regulatory
  investigation?: InvestigationRecord;
  closure?: ClosureRecord;
  linkedEvidence?: EvidenceLink[];
  /** First-class uploaded evidence (photos, docs, audio, video). */
  evidence?: EvidenceItem[];

  regulatoryNotification?: RegulatoryNotificationRecord;
  site: string;
  location: string;
  dateTime: string;
  owner?: string;
  overdue?: boolean;
  column: ColumnId;
  summary: string;
  actions: ActionItem[];
  timeline: TimelineEntry[];
  submission?: IncidentSubmission;

  // === Visibility & compliance ===
  /** Per-record visibility setting controlling who can view this Event. */
  visibility?: VisibilityMode;
  /** Audit trail of visibility changes (every change is appended). */
  visibilityHistory?: VisibilityChange[];

  // === Learning, Action & Prevention ===
  /** AI-suggested proportionate response + human confirmation. */
  proportionate?: ProportionateResponse;
  /** Linked evidence (tasks, audits, policies, etc.) — Manager/Admin controlled. */
  linkedRefs?: LinkedRef[];
  /** AI-drafted learning summary; requires human approval. */
  learning?: LearningSummary;

  // === Reporter sign-off ===
  severityDecision?: SeverityDecision;
  notificationSuggestions?: NotificationSuggestion[];
  fieldProvenance?: FieldProvenance[];
  reporterSignOff?: ReporterSignOff;
  amendments?: Amendment[];
}


export interface DraftDetails {
  // Anchor
  site: string;
  /** Legacy free-text field; prefer serviceUserId. */
  resident: string;
  serviceUserId?: ServiceUserId;
  severity: string;
  location: string;
  source: "text" | "voice";
  text?: string;
  voiceDurationSec?: number;

  // Multilingual capture
  sourceLanguage?: SourceLanguage;
  languageAutoDetected?: boolean;
  originalText?: string;
  translatedText?: string;

  // Classification
  /** User-facing top-level Event Type. Defaults to "Incident / Accident". */
  eventType?: EventType;
  incidentType?: IncidentType;
  primaryCategory?: PrimaryCategory;
  secondaryCategory?: PrimaryCategory;
  dateOfIncident?: string;
  timeOfIncident?: string;


  // People
  staffInvolved?: string[];
  witnesses?: string[];
  otherWitnesses?: string;

  // Impact
  injurySustained?: boolean;
  injuryType?: string;
  injuryBodyArea?: string;
  injuryNote?: string;
  medicationTreatment?: string;
  immediateActions?: string;

  // Regulatory
  notifications?: Partial<NotificationsRecord>;
  notifiableOverride?: boolean; // user override, true = mark notifiable
  openDisclosure?: OpenDisclosure;
}

const SITE_MAP: Record<string, string> = {
  oakfield: "East Cork",
  riverside: "West Waterford",
  elmgrove: "West Waterford",
};
const SEVERITY_MAP: Record<string, Severity> = {
  low: "Low",
  moderate: "Moderate",
  severe: "Severe",
  high: "Severe",
  critical: "Severe",
  death: "Death",
};
const INITIAL_SEVERITY_MAP: Record<string, InitialSeverity> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  critical: "Critical",
  unsure: "Unsure",
};
const LOCATION_MAP: Record<string, string> = {
  kitchen: "Kitchen",
  corridor: "Corridor",
  bedroom: "Bedroom",
  garden: "Garden",
  bathroom: "Bathroom",
};

export const STAFF_LIST = STAFF.filter((s) => !s.external && !s.readOnly).map((s) => s.name);

export const NOTIFICATION_LABELS: Record<NotificationKey, string> = {
  family: "Family / NOK",
  gp: "GP",
  gardai: "Gardaí",
  hiqa: "HIQA",
  mhc: "Mental Health Commission",
  hsa: "HSA",
};

type Listener = (cards: IncidentCard[]) => void;
type EvidenceListener = (items: EvidenceItem[]) => void;
const listeners = new Set<Listener>();
const evidenceListeners = new Set<EvidenceListener>();
let pending: IncidentCard[] = [];
let pendingDraft: DraftDetails | null = null;
let pendingClarifications: ClarificationExchange[] = [];
let pendingEvidence: EvidenceItem[] = [];
let counter = NEXT_EVENT_NUMBER;


const emit = () => listeners.forEach((l) => l([...pending]));
const emitEvidence = () => evidenceListeners.forEach((l) => l([...pendingEvidence]));


const nowStamp = () => {
  const d = new Date();
  const day = d.getDate();
  const month = d.toLocaleString("en-IE", { month: "short" });
  const time = d.toTimeString().slice(0, 5);
  return `${day} ${month} · ${time}`;
};

const inferType = (text?: string): IncidentType => {
  const t = (text || "").toLowerCase();
  if (/\b(slip|fall|fell|trip)\b/.test(t)) return "Fall";
  if (/\b(med|medication|dose|tablet|warfarin)\b/.test(t)) return "Medication error";
  if (/\b(agitat|behav|wander)\b/.test(t)) return "Behavioural";
  if (/\b(missing|absconded|left the unit)\b/.test(t)) return "Missing person";
  if (/\b(abuse|neglect)\b/.test(t)) return "Suspected abuse / neglect";
  if (/\b(skin|wound|bruise|tear)\b/.test(t)) return "Skin integrity";
  if (/\b(restraint)\b/.test(t)) return "Restraint";
  if (/\b(near miss|nearly)\b/.test(t)) return "Near miss";
  return "Other";
};

const typeToCategory: Record<IncidentType, string> = {
  "Fall": "Fall",
  "Medication error": "Medication",
  "Behavioural": "Behavioural",
  "Missing person": "Missing person",
  "Suspected abuse / neglect": "Safeguarding",
  "Restraint": "Restraint",
  "Skin integrity": "Skin Integrity",
  "Near miss": "Near miss",
  "Other": "General",
};

const buildDraftSections = (d: DraftDetails): DraftSection[] => {
  const resident = d.serviceUserId ? serviceUserName(d.serviceUserId) : "the service user";
  const location = LOCATION_MAP[d.location] || d.location || "the location";
  // Build the structured draft from the English translation when present,
  // falling back to the original text (English-language captures).
  const englishText = (d.translatedText || d.text || "").trim();
  const raw =
    englishText ||
    (d.source === "voice"
      ? "Voice note captured at point of incident — see transcript."
      : "Captured at point of incident.");
  const sections: DraftSection[] = [
    {
      label: "What happened",
      body: `${resident} — ${raw}`,
    },
    {
      label: "Immediate response",
      body:
        d.immediateActions?.trim() ||
        `Staff attended ${resident} immediately at ${location}. Initial checks completed and resident made comfortable.`,
    },
  ];
  if (d.injurySustained) {
    const parts = [
      d.injuryType && `Type: ${d.injuryType}`,
      d.injuryBodyArea && `Site: ${d.injuryBodyArea}`,
      d.injuryNote && `Detail: ${d.injuryNote}`,
    ].filter(Boolean);
    sections.push({
      label: "Injury sustained",
      body: parts.length ? parts.join(" · ") : "Injury reported — detail to be confirmed.",
    });
  } else {
    sections.push({
      label: "Injury",
      body: "No injury reported at point of capture.",
    });
  }
  if (d.medicationTreatment?.trim()) {
    sections.push({ label: "Medication / treatment involved", body: d.medicationTreatment.trim() });
  }
  return sections;
};

const autoSuggestNotifiable = (
  type: IncidentType,
  severity: Severity,
): NotifiableAssessment => {
  const reasons: string[] = [];
  let framework: NotifiableAssessment["framework"] | undefined;
  if (type === "Suspected abuse / neglect") {
    reasons.push("Allegation of abuse / neglect — HIQA NF06");
    framework = "HIQA NIMS";
  }
  if (type === "Missing person") {
    reasons.push("Resident absent without leave — HIQA NF03");
    framework = framework ? "Multiple" : "HIQA NIMS";
  }
  if (severity === "Death") {
    reasons.push("Unexpected death — Patient Safety Act 2023");
    framework = framework ? "Multiple" : "Patient Safety Act 2023";
  }
  if (severity === "Severe" && (type === "Fall" || type === "Medication error")) {
    reasons.push("Serious harm — review for HIQA NF / Patient Safety Act 2023");
    framework = framework ? "Multiple" : "Patient Safety Act 2023";
  }
  return {
    flagged: reasons.length > 0,
    framework,
    rationale: reasons.join(" · ") || undefined,
    autoSuggested: reasons.length > 0,
  };
};

const buildNotifications = (partial?: Partial<NotificationsRecord>): NotificationsRecord => {
  const empty: NotificationStatus = { notified: false };
  const base: NotificationsRecord = {
    family: { ...empty },
    gp: { ...empty },
    gardai: { ...empty },
    hiqa: { ...empty },
    mhc: { ...empty },
    hsa: { ...empty },
  };
  if (!partial) return base;
  (Object.keys(partial) as NotificationKey[]).forEach((k) => {
    base[k] = { ...base[k], ...partial[k]! };
  });
  return base;
};

const outstandingFor = (
  d: DraftDetails,
  severity: Severity,
  type: IncidentType,
  notifiable: NotifiableAssessment,
): string[] => {
  const flags: string[] = [];
  if (!d.timeOfIncident) flags.push("Exact time of incident");
  if (d.injurySustained === undefined) flags.push("Injury detail (yes / no)");
  if (d.injurySustained && !d.injuryBodyArea) flags.push("Injury body area / type");
  const n = d.notifications || {};
  if (!n.family?.notified && !n.family?.notApplicable) flags.push("Family / NOK notification");
  if (!n.gp?.notified && !n.gp?.notApplicable && (type === "Fall" || type === "Medication error" || severity === "Severe"))
    flags.push("GP notification");
  if (notifiable.flagged) {
    if (!n.hiqa?.notified && !n.hiqa?.notApplicable) flags.push("HIQA NIMS notification");
    if (!d.openDisclosure || d.openDisclosure.required === "Not yet decided")
      flags.push("Open disclosure decision");
  }
  if ((severity === "Severe" || severity === "Death") && d.notifiableOverride === undefined && !notifiable.autoSuggested) {
    flags.push("Notifiable-incident assessment");
  }
  return flags;
};

export const incidentsStore = {
  setDraft(d: DraftDetails) {
    pendingDraft = d;
    pendingClarifications = [];
  },
  getDraft(): DraftDetails | null {
    return pendingDraft;
  },
  updateDraft(patch: Partial<DraftDetails>) {
    if (!pendingDraft) return;
    pendingDraft = { ...pendingDraft, ...patch };
  },
  addClarification(question: string, answer: string) {
    pendingClarifications.push({
      id: `cl-${Date.now()}`,
      question,
      answer,
      ts: nowStamp(),
    });
  },
  getClarifications(): ClarificationExchange[] {
    return [...pendingClarifications];
  },
  computeNotifiable(d: DraftDetails): NotifiableAssessment {
    const severity = SEVERITY_MAP[d.severity] || "Moderate";
    const type = d.incidentType || inferType(d.text);
    const auto = autoSuggestNotifiable(type, severity);
    if (d.notifiableOverride === true && !auto.flagged) {
      return { flagged: true, framework: "HIQA NIMS", rationale: "Manually flagged by submitter", autoSuggested: false };
    }
    if (d.notifiableOverride === false) {
      return { ...auto, flagged: false };
    }
    return auto;
  },
  computeOutstanding(d: DraftDetails): string[] {
    const severity = SEVERITY_MAP[d.severity] || "Moderate";
    const type = d.incidentType || inferType(d.text);
    return outstandingFor(d, severity, type, this.computeNotifiable(d));
  },
  submit(extras?: {
    summary?: string; createdBy?: string; createdByStaffId?: StaffId;
    severityDecision?: SeverityDecision;
    notificationSuggestions?: NotificationSuggestion[];
    fieldProvenance?: FieldProvenance[];
    reporterSignOff?: ReporterSignOff;
  }): IncidentCard | null {
    if (!pendingDraft) return null;
    const d = pendingDraft;
    const id = `INC-${DEMO_YEAR}-${String(counter++).padStart(3, "0")}`;
    const ts = nowStamp();
    const createdBy = extras?.createdBy || "Unknown reporter";
    const sd = extras?.severityDecision;
    const severity: Severity = sd ? (sd.confirmedSeverity || sd.suggestedSeverity) : (SEVERITY_MAP[d.severity] || "Moderate");
    const fmtT = (iso?: string) => iso ? new Date(iso).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" }) : "";
    const provenanceTimeline: TimelineEntry[] = (extras?.fieldProvenance || []).filter(f => f.state === "human_confirmed").map((f, i) => ({
      id: `t-fp-${Date.now()}-${i}`, ts, who: f.confirmedByName || createdBy,
      what: `${f.label} originated as ${FIELD_STATE_LABEL[f.origin]}, ${f.edited ? "edited and confirmed" : "confirmed"} by ${f.confirmedByName || createdBy} at ${fmtT(f.confirmedAt)}.`,
    }));
    if (sd) provenanceTimeline.push({
      id: `t-sev-${Date.now()}`, ts, who: createdBy,
      what: sd.confirmedSeverity
        ? `Severity: LogUp suggested ${sd.suggestedSeverity} (${sd.suggestedSeverityReason}); ${sd.confirmedSeverity === sd.suggestedSeverity ? "confirmed" : `changed to ${sd.confirmedSeverity}`} by ${createdBy} at ${fmtT(sd.confirmedAt)}.`
        : `Severity: LogUp suggested ${sd.suggestedSeverity} (${sd.suggestedSeverityReason}); not confirmed by reporter — reviewer to confirm.`,
    });
    if (extras?.reporterSignOff) provenanceTimeline.push({
      id: `t-sign-${Date.now()}`, ts, who: extras.reporterSignOff.name,
      what: `Reporter signed off: "${extras.reporterSignOff.statement}" at ${fmtT(extras.reporterSignOff.confirmedAt)}.`,
    });
    const incidentType = d.incidentType || inferType(d.text);
    const notifiable = this.computeNotifiable(d);
    const englishForDraft = d.translatedText?.trim() || d.text?.trim();
    const summary =
      extras?.summary ||
      englishForDraft ||
      (d.source === "voice"
        ? "Voice note captured — structured by LogUp."
        : "Incident captured.");

    const su = serviceUsersStore.getById(d.serviceUserId);
    const age = su ? Math.floor((Date.now() - new Date(su.dateOfBirth).getTime()) / (365.25 * 864e5)) : undefined;

    const originalText =
      d.originalText?.trim() ||
      d.text?.trim() ||
      (d.source === "voice"
        ? "[Voice note transcript — staff described the incident at point of capture.]"
        : "[No raw note provided.]");

    const submission: IncidentSubmission = {
      capturedBy: createdBy,
      capturedAt: ts,
      source: d.source,
      // rawNote stays as the verbatim source for back-compat with existing UI.
      rawNote: originalText,
      sourceLanguage: d.sourceLanguage || "en",
      languageAutoDetected: d.languageAutoDetected,
      originalText,
      translatedText: d.translatedText?.trim(),
      voiceDurationSec: d.voiceDurationSec,
      draftSections: buildDraftSections(d),
      clarifications: [...pendingClarifications],
      outstandingFlags: outstandingFor(d, severity, incidentType, notifiable),

      eventType: d.eventType || DEFAULT_EVENT_TYPE,
      incidentType,
      dateOfIncident: d.dateOfIncident,
      timeOfIncident: d.timeOfIncident,

      residentDemographics: su ? { age } : undefined,
      staffInvolved: d.staffInvolved || [],
      witnesses: d.witnesses || [],
      otherWitnesses: d.otherWitnesses,

      injury: {
        sustained: !!d.injurySustained,
        type: d.injuryType,
        bodyArea: d.injuryBodyArea,
        note: d.injuryNote,
      },
      medicationTreatment: d.medicationTreatment,
      immediateActions: d.immediateActions,

      notifications: buildNotifications(d.notifications),
      notifiable,
      openDisclosure: d.openDisclosure || { required: "Not yet decided" },
    };

    const carriedEvidence = [...pendingEvidence];

    const evidenceTimeline: TimelineEntry[] = carriedEvidence.map((e, i) => ({
      id: `t-ev-${Date.now()}-${i}`,
      ts: e.uploadedAt,
      who: e.uploadedBy,
      what: `Evidence uploaded: ${e.name} (${e.kind})`,
    }));

    const card: IncidentCard = {
      id,
      resident: su?.name ?? "No service user linked",
      serviceUserId: su?.id,
      noServiceUserInvolved: !su && d.resident === "__none__",
      createdByStaffId: extras?.createdByStaffId,
      createdByName: createdBy,
      category: typeToCategory[incidentType],
      eventType: d.eventType || DEFAULT_EVENT_TYPE,
      visibility: getDefaultVisibility(d.eventType || DEFAULT_EVENT_TYPE),
      visibilityHistory: [],
      severity,
      initialSeverity: sd ? (sd.confirmedSeverity === "Severe" ? "High" : sd.confirmedSeverity === "Death" ? "Critical" : (sd.confirmedSeverity as InitialSeverity | undefined) || "Unsure") : (INITIAL_SEVERITY_MAP[d.severity] || "Unsure"),
      severityDecision: sd,
      notificationSuggestions: extras?.notificationSuggestions,
      fieldProvenance: extras?.fieldProvenance,
      reporterSignOff: extras?.reporterSignOff,
      amendments: [],
      site: SITE_MAP[d.site] || d.site || "—",
      location: LOCATION_MAP[d.location] || d.location || "—",
      dateTime: d.dateOfIncident && d.timeOfIncident ? `${d.dateOfIncident} · ${d.timeOfIncident}` : ts,
      column: "new",
      summary,
      actions: [],
      evidence: carriedEvidence,
      timeline: [
        {
          id: `t${Date.now()}`,
          ts,
          who: createdBy,
          what:
            d.source === "voice"
              ? "Incident captured via voice note"
              : "Incident captured (typed note)",
        },
        ...pendingClarifications.map((c, i) => ({
          id: `t${Date.now() + i + 1}`,
          ts: c.ts,
          who: createdBy,
          what: `Clarification: ${c.question} → "${c.answer}"`,
        })),
        ...evidenceTimeline,
        ...provenanceTimeline,
        {
          id: `t${Date.now() + 999}`,
          ts,
          who: "LogUp",
          what: "Draft structured and submitted to Board",
        },
      ],
      submission,
    };
    pending = [card, ...pending];
    pendingDraft = null;
    pendingClarifications = [];
    pendingEvidence = [];
    emit();
    emitEvidence();
    if (su) {
      raiseCarePlanReviewForEvent({
        incidentId: card.id, serviceUserId: su.id, category: card.category, eventType: card.eventType,
        incidentType, narrative: englishForDraft || originalText, severity,
        dateOfIncident: d.dateOfIncident, timeOfIncident: d.timeOfIncident,
      });
    }
    return card;
  },
  getPending(): IncidentCard[] {
    return [...pending];
  },
  subscribe(l: Listener) {
    listeners.add(l);
    l([...pending]);
    return () => listeners.delete(l);
  },

  // ----- Visibility (Manager/Admin controlled, audit-trailed) -----
  setVisibility(
    cardId: string,
    next: VisibilityMode,
    changedBy: string,
    reason?: string,
  ): IncidentCard | null {
    const idx = pending.findIndex((c) => c.id === cardId);
    if (idx === -1) return null;
    const current = pending[idx];
    const prev = current.visibility || getDefaultVisibility(current.eventType);
    if (prev === next) return current;
    const ts = nowStamp();
    const change: VisibilityChange = {
      id: `vc-${Date.now()}`,
      from: prev,
      to: next,
      changedBy,
      changedAt: ts,
      reason: reason?.trim() || undefined,
    };
    const updated: IncidentCard = {
      ...current,
      visibility: next,
      visibilityHistory: [...(current.visibilityHistory || []), change],
      timeline: [
        ...current.timeline,
        {
          id: `t-vis-${Date.now()}`,
          ts,
          who: changedBy,
          what: `Visibility changed from "${prev}" to "${next}" by ${changedBy}${reason ? ` — ${reason}` : ""}.`,
        },
      ],
    };
    pending = [...pending.slice(0, idx), updated, ...pending.slice(idx + 1)];
    emit();
    return updated;
  },

  // ----- Evidence (pre-submission, attached to the in-flight draft) -----
  addDraftEvidence(item: EvidenceItem) {
    pendingEvidence = [item, ...pendingEvidence];
    emitEvidence();
  },
  removeDraftEvidence(id: string) {
    pendingEvidence = pendingEvidence.filter((e) => e.id !== id);
    emitEvidence();
  },
  getDraftEvidence(): EvidenceItem[] {
    return [...pendingEvidence];
  },
  clearDraftEvidence() {
    pendingEvidence = [];
    emitEvidence();
  },
  subscribeDraftEvidence(l: EvidenceListener) {
    evidenceListeners.add(l);
    l([...pendingEvidence]);
    return () => evidenceListeners.delete(l);
  },

  /** Reporter adds information after submission; original kept unchanged. */
  addAmendment(cardId: string, a: { text: string; reason: string; byName: string; byStaffId?: StaffId }): IncidentCard | null {
    const ts = nowStamp();
    return this._updateCard(cardId, (c) => ({
      ...c,
      amendments: [...(c.amendments || []), { id: `am-${Date.now()}`, addedAt: new Date().toISOString(), addedByStaffId: a.byStaffId, addedByName: a.byName, reason: a.reason.trim(), text: a.text.trim() }],
      timeline: [...c.timeline, { id: `t-am-${Date.now()}`, ts, who: a.byName, what: `Information added (amendment) — reason: ${a.reason.trim()}.` }],
    }));
  },

  // ----- Learning, Action & Prevention -----
  _updateCard(cardId: string, patch: (c: IncidentCard) => IncidentCard): IncidentCard | null {
    const idx = pending.findIndex((c) => c.id === cardId);
    if (idx === -1) return null;
    const next = patch(pending[idx]);
    pending = [...pending.slice(0, idx), next, ...pending.slice(idx + 1)];
    emit();
    return next;
  },
  draftProportionate(cardId: string): IncidentCard | null {
    return this._updateCard(cardId, (c) => ({
      ...c,
      proportionate: {
        aiSuggested: aiDraftProportionate(c),
        human: c.proportionate?.human,
      },
      timeline: [
        ...c.timeline,
        { id: `t-prop-${Date.now()}`, ts: nowStamp(), who: "LogUp", what: "AI drafted proportionate-response suggestion (pending human confirmation)." },
      ],
    }));
  },
  confirmProportionate(
    cardId: string,
    human: { severity?: Severity; reviewLevel?: ReviewLevel; escalation?: EscalationFlag; note?: string },
    confirmedBy: string,
  ): IncidentCard | null {
    return this._updateCard(cardId, (c) => {
      const ai = c.proportionate?.aiSuggested || aiDraftProportionate(c);
      const ts = nowStamp();
      return {
        ...c,
        proportionate: {
          aiSuggested: ai,
          human: { ...human, confirmedBy, confirmedAt: ts },
        },
        timeline: [
          ...c.timeline,
          { id: `t-propc-${Date.now()}`, ts, who: confirmedBy, what: `Proportionate response confirmed (severity: ${human.severity || ai.severity}, review: ${human.reviewLevel || ai.reviewLevel}, escalation: ${human.escalation || ai.escalation})${human.note ? ` — ${human.note}` : ""}.` },
        ],
      };
    });
  },
  addLinkedRef(cardId: string, ref: Omit<LinkedRef, "id" | "addedAt">): IncidentCard | null {
    const ts = nowStamp();
    const id = `lr-${Date.now()}`;
    return this._updateCard(cardId, (c) => ({
      ...c,
      linkedRefs: [...(c.linkedRefs || []), { ...ref, id, addedAt: ts }],
      timeline: [
        ...c.timeline,
        { id: `t-lr-${Date.now()}`, ts, who: ref.addedBy, what: `Linked ${ref.kind}: ${ref.label}${ref.detail ? ` — ${ref.detail}` : ""}.` },
      ],
    }));
  },
  removeLinkedRef(cardId: string, refId: string, removedBy: string): IncidentCard | null {
    return this._updateCard(cardId, (c) => {
      const removed = (c.linkedRefs || []).find(r => r.id === refId);
      const ts = nowStamp();
      return {
        ...c,
        linkedRefs: (c.linkedRefs || []).filter(r => r.id !== refId),
        timeline: removed
          ? [...c.timeline, { id: `t-lrx-${Date.now()}`, ts, who: removedBy, what: `Removed linked ${removed.kind}: ${removed.label}.` }]
          : c.timeline,
      };
    });
  },
  draftLearning(cardId: string): IncidentCard | null {
    return this._updateCard(cardId, (c) => ({
      ...c,
      learning: aiDraftLearning(c),
      timeline: [
        ...c.timeline,
        { id: `t-ldr-${Date.now()}`, ts: nowStamp(), who: "LogUp", what: "AI drafted learning summary (pending human approval)." },
      ],
    }));
  },
  updateLearning(cardId: string, patch: Partial<LearningSummary>): IncidentCard | null {
    return this._updateCard(cardId, (c) => ({
      ...c,
      learning: { ...(c.learning || aiDraftLearning(c)), ...patch },
    }));
  },
  approveLearning(cardId: string, approvedBy: string, note?: string): IncidentCard | null {
    const ts = nowStamp();
    return this._updateCard(cardId, (c) => ({
      ...c,
      learning: c.learning
        ? { ...c.learning, approvedBy, approvedAt: ts, approvedNote: note?.trim() || undefined }
        : { ...aiDraftLearning(c), approvedBy, approvedAt: ts, approvedNote: note?.trim() || undefined },
      timeline: [
        ...c.timeline,
        { id: `t-lap-${Date.now()}`, ts, who: approvedBy, what: `Learning summary approved${note ? ` — ${note}` : ""}.` },
      ],
    }));
  },
};

