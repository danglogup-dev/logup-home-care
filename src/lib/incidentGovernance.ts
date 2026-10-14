// Shared governance vocabulary for the Incident module.
// Types and helpers used by Board, Reporting, the capture flow and the
// per-incident governance workspace. Keeping it isolated avoids bloating
// incidentsStore.ts and lets historical IncidentRecord rows share the same
// vocabulary as the live IncidentCard rows.

export type PrimaryCategory =
  | "Medication"
  | "Fall"
  | "Safeguarding"
  | "Behavioural"
  | "Missing Person"
  | "Injury"
  | "Restrictive Practice"
  | "Infection Prevention"
  | "Property Damage"
  | "Near Miss"
  | "Other";

export const PRIMARY_CATEGORIES: PrimaryCategory[] = [
  "Medication",
  "Fall",
  "Safeguarding",
  "Behavioural",
  "Missing Person",
  "Injury",
  "Restrictive Practice",
  "Infection Prevention",
  "Property Damage",
  "Near Miss",
  "Other",
];

export type RiskImpact = "Low" | "Medium" | "High" | "Critical";
export type RiskLikelihood = "Low" | "Medium" | "High";
export type RiskRating = "Low" | "Moderate" | "High" | "Extreme";

export const IMPACT_OPTIONS: RiskImpact[] = ["Low", "Medium", "High", "Critical"];
export const LIKELIHOOD_OPTIONS: RiskLikelihood[] = ["Low", "Medium", "High"];

/**
 * 3 × 4 manager-friendly risk matrix. Returns the derived rating + a colour
 * token group so badges in the card, dialog and dashboard stay consistent.
 */
export function computeRiskRating(
  impact: RiskImpact,
  likelihood: RiskLikelihood,
): RiskRating {
  const i = IMPACT_OPTIONS.indexOf(impact) + 1;       // 1..4
  const l = LIKELIHOOD_OPTIONS.indexOf(likelihood) + 1; // 1..3
  const score = i * l;
  if (score >= 9) return "Extreme";  // Critical × Medium / Critical × High / High × High
  if (score >= 6) return "High";
  if (score >= 3) return "Moderate";
  return "Low";
}

export const RISK_TONE: Record<RiskRating, { text: string; bg: string; border: string; dot: string }> = {
  Low:      { text: "text-success",     bg: "bg-success/10",     border: "border-success/30",     dot: "bg-success" },
  Moderate: { text: "text-warning",     bg: "bg-warning/10",     border: "border-warning/30",     dot: "bg-warning" },
  High:     { text: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/30", dot: "bg-destructive" },
  Extreme:  { text: "text-destructive", bg: "bg-destructive/20", border: "border-destructive/40", dot: "bg-destructive" },
};

// ---------- Lifecycle ------------------------------------------------------
// Governance-grade statuses; independent of the 4 board columns.

export type LifecycleStatus =
  | "Draft"
  | "Submitted"
  | "Under Review"
  | "Investigation Required"
  | "Investigation In Progress"
  | "Actions In Progress"
  | "Ready For Closure"
  | "Closed";

export const LIFECYCLE_ORDER: LifecycleStatus[] = [
  "Draft",
  "Submitted",
  "Under Review",
  "Investigation Required",
  "Investigation In Progress",
  "Actions In Progress",
  "Ready For Closure",
  "Closed",
];

export const LIFECYCLE_TONE: Record<LifecycleStatus, string> = {
  Draft:                       "bg-secondary text-muted-foreground border-border",
  Submitted:                   "bg-primary/10 text-primary border-primary/20",
  "Under Review":              "bg-accent/15 text-accent-foreground border-accent/30",
  "Investigation Required":    "bg-warning/10 text-warning border-warning/30",
  "Investigation In Progress": "bg-warning/15 text-warning border-warning/40",
  "Actions In Progress":       "bg-primary/10 text-primary border-primary/20",
  "Ready For Closure":         "bg-success/10 text-success border-success/30",
  Closed:                      "bg-muted text-muted-foreground border-border",
};

/** Map an existing board column (or legacy status string) to a governance lifecycle status. */
export function deriveLifecycleFromColumn(column: string, ownerAssigned?: boolean): LifecycleStatus {
  switch (column) {
    case "new":      return "Submitted";
    case "review":   return ownerAssigned ? "Under Review" : "Submitted";
    case "actions":  return "Actions In Progress";
    case "complete": return "Closed";
    // legacy IncidentRecord.status strings
    case "Awaiting Review": return "Under Review";
    case "Overdue":         return "Actions In Progress";
    case "Closed":          return "Closed";
    default: return "Submitted";
  }
}

// ---------- Investigation --------------------------------------------------

export type ContributingFactor =
  | "Staffing"
  | "Training"
  | "Communication"
  | "Environment"
  | "Equipment"
  | "Policy"
  | "Process"
  | "Other";

export const CONTRIBUTING_FACTORS: ContributingFactor[] = [
  "Staffing", "Training", "Communication", "Environment",
  "Equipment", "Policy", "Process", "Other",
];

export interface InvestigationRecord {
  required: boolean;
  findings?: string;
  contributingFactors?: ContributingFactor[];
  rootCause?: string;
  recommendations?: string;
  supportingEvidence?: string;
  author?: string;
  startedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
}

// ---------- Closure --------------------------------------------------------

export interface ClosureRecord {
  summary: string;
  lessonsLearned?: string;
  closedBy: string;
  closedAt: string;
  overrideRationale?: string;
}

// ---------- Linked evidence ------------------------------------------------

export type EvidenceLinkKind =
  | "policy"
  | "audit"
  | "workforce"
  | "incident"
  | "document";

export interface EvidenceLink {
  id: string;
  kind: EvidenceLinkKind;
  label: string;
  ref?: string;     // e.g. AUD-001, POL-001
  date?: string;    // chronological ordering
  note?: string;
}

// ---------- Regulatory notification ----------------------------------------

export type RegulatoryAuthority = "HIQA" | "HSE" | "Internal Governance" | "Other";

export const REG_AUTHORITIES: RegulatoryAuthority[] = ["HIQA", "HSE", "Internal Governance", "Other"];

export interface RegulatoryNotificationRecord {
  required: boolean;
  authority?: RegulatoryAuthority;
  submittedAt?: string;
  reference?: string;
  attachment?: string;
  notes?: string;
  /** Notification form code, e.g. "NF06". */
  formCode?: string;
  formTitle?: string;
  /** LogUp suggestion outcome; a person decides whether to notify. */
  outcome?: "likely_notifiable" | "quarterly" | "exported" | "not_required";
  /** Regulatory deadline (ISO). */
  dueAt?: string;
  /** Quarterly return the item belongs to, e.g. "Q4 2026". */
  quarter?: string;
}

// ---------- Closure gate ----------------------------------------------------

export interface ClosureGate {
  ok: boolean;
  blockers: string[];
}

/**
 * Determines whether an incident can be cleanly closed.
 * Blocked if investigation is required but not approved, or if any
 * High/Urgent priority action is still open.
 */
export function canCloseIncident(args: {
  investigation?: InvestigationRecord;
  actions: { status: string; priority?: string; title: string }[];
}): ClosureGate {
  const blockers: string[] = [];
  if (args.investigation?.required && !args.investigation.approvedAt) {
    blockers.push("Investigation is required and not yet approved.");
  }
  const openCritical = args.actions.filter(
    (a) => a.status !== "Complete" && (a.priority === "Urgent" || a.priority === "High"),
  );
  if (openCritical.length > 0) {
    blockers.push(
      `${openCritical.length} critical action${openCritical.length === 1 ? "" : "s"} still open: ${openCritical.map((a) => a.title).join(", ")}.`,
    );
  }
  return { ok: blockers.length === 0, blockers };
}
