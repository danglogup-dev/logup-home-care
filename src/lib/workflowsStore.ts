// Admin Workflow Builder V1 — "When this happens → do this."
// In-memory store with localStorage persistence, matching the project pattern.
// Workflows are evaluated by the human (Admin/Manager activates) — the system
// records audit entries when triggered. AI may DRAFT a workflow but never
// activates it automatically.

import type { EventType } from "./eventTypes";
import type { Role, SiteName } from "./roleStore";
import { ALL_SITES, isManagerRole } from "./roleStore";

export type WorkflowTrigger =
  | "event_submitted"
  | "high_severity_event"
  | "restricted_event_submitted"
  | "event_assigned"
  | "task_created"
  | "task_overdue"
  | "closure_requested"
  | "event_closed"
  | "info_request_approaching_due"
  | "missing_info_unresolved";

export type WorkflowActionKind =
  | "in_app_alert"
  | "email_alert" // gated — only fires if email notifications are enabled
  | "create_followup_task"
  | "assign_reviewer"
  | "request_missing_info"
  | "escalate_overdue"
  | "require_manager_review"
  | "require_closure_approval";

export type RecipientKind =
  | "user"
  | "role"
  | "site_manager"
  | "assigned_manager"
  | "admins"
  | "governance_lead"
  | "safeguarding_lead"
  | "custom_group";

export interface AlertRecipient {
  kind: RecipientKind;
  /** Free-form value: a user id, role name, or group name. */
  value?: string;
}

export interface WorkflowAction {
  id: string;
  kind: WorkflowActionKind;
  /** Free-form label shown in the audit trail. */
  label: string;
  recipients?: AlertRecipient[];
  /** For create_followup_task: e.g. "48h", "3d". */
  dueRule?: string;
  /** For create_followup_task / assign_reviewer. */
  ownerHint?: string;
}

export type WorkflowOwnership =
  | "organisation" // Admin, can apply across selected sites
  | "site"         // Manager-created, single site
  | "locked"       // Admin-locked, cannot be edited by Managers
  | "local";       // Manager-created within their permitted site scope

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  ownership: WorkflowOwnership;
  ownerName: string;
  ownerRole: Role;
  /** Sites the workflow applies to. Empty = all sites in scope. */
  scopeSites: string[];
  trigger: WorkflowTrigger;
  conditions: {
    eventType?: EventType;
    minSeverity?: "Low" | "Moderate" | "High" | "Critical";
    onlyRestricted?: boolean;
  };
  actions: WorkflowAction[];
  requiresClosureApproval: boolean;
  createdAt: string;
  updatedAt: string;
  /** "draft" until Admin/Manager activates. AI drafts arrive as "draft". */
  status: "draft" | "active" | "disabled";
  /** True when the draft was authored by AI (so we badge it for human review). */
  aiDrafted?: boolean;
}

export interface WorkflowAuditEntry {
  id: string;
  workflowId: string;
  ts: string;
  by: string;
  event: string;
}

// ---------- Trigger labels (user-facing) ----------
export const TRIGGER_LABELS: Record<WorkflowTrigger, string> = {
  event_submitted: "Event submitted",
  high_severity_event: "High severity Event submitted",
  restricted_event_submitted: "Restricted Event submitted",
  event_assigned: "Event assigned",
  task_created: "Follow-up task created",
  task_overdue: "Follow-up task overdue",
  closure_requested: "Closure requested",
  event_closed: "Event closed",
  info_request_approaching_due: "Information request approaching due date",
  missing_info_unresolved: "Missing information still unresolved",
};

export const ACTION_LABELS: Record<WorkflowActionKind, string> = {
  in_app_alert: "Send in-app alert",
  email_alert: "Send email (if email enabled)",
  create_followup_task: "Create follow-up task",
  assign_reviewer: "Assign reviewer",
  request_missing_info: "Request missing information",
  escalate_overdue: "Escalate overdue item",
  require_manager_review: "Require Manager/Admin review",
  require_closure_approval: "Require closure approval",
};

export const RECIPIENT_LABELS: Record<RecipientKind, string> = {
  user: "Specific user",
  role: "Role",
  site_manager: "Site Manager",
  assigned_manager: "Assigned Manager",
  admins: "Admin users",
  governance_lead: "Governance Lead",
  safeguarding_lead: "Safeguarding Lead",
  custom_group: "Custom group",
};

// ---------- Storage ----------
const WF_KEY = "logup.workflows.v1";
const WF_AUDIT_KEY = "logup.workflows.audit.v1";

const nowStamp = () => {
  const d = new Date();
  const day = d.getDate();
  const month = d.toLocaleString("en-IE", { month: "short" });
  const time = d.toTimeString().slice(0, 5);
  return `${day} ${month} · ${time}`;
};

const SEED: Workflow[] = [
  {
    id: "wf-seed-1",
    name: "Complaint review — 48h follow-up",
    description: "When a Complaint is submitted, alert the Site Manager and Governance Lead, create a follow-up due in 48h, and require Manager/Admin closure approval.",
    active: true,
    ownership: "organisation",
    ownerName: "Aoife Lynch",
    ownerRole: "admin",
    scopeSites: [...ALL_SITES],
    trigger: "event_submitted",
    conditions: { eventType: "Complaint" },
    actions: [
      { id: "a1", kind: "in_app_alert", label: "Alert Site Manager and Governance Lead",
        recipients: [{ kind: "site_manager" }, { kind: "governance_lead" }] },
      { id: "a2", kind: "create_followup_task", label: "Review complaint within 48 hours",
        dueRule: "48h", ownerHint: "Site Manager" },
      { id: "a3", kind: "require_closure_approval", label: "Manager/Admin closure approval required" },
    ],
    requiresClosureApproval: true,
    createdAt: "10 Apr · 09:00",
    updatedAt: "10 Apr · 09:00",
    status: "active",
  },
  {
    id: "wf-seed-2",
    name: "Safeguarding — immediate escalation",
    description: "Restricted Safeguarding Concerns immediately alert authorised safeguarding lead and require Manager review.",
    active: true,
    ownership: "locked",
    ownerName: "Aoife Lynch",
    ownerRole: "admin",
    scopeSites: [...ALL_SITES],
    trigger: "restricted_event_submitted",
    conditions: { eventType: "Safeguarding Concern" },
    actions: [
      { id: "a1", kind: "in_app_alert", label: "Restricted Event requires review",
        recipients: [{ kind: "safeguarding_lead" }, { kind: "admins" }] },
      { id: "a2", kind: "require_manager_review", label: "Manager/Admin review required" },
    ],
    requiresClosureApproval: true,
    createdAt: "10 Apr · 09:00",
    updatedAt: "10 Apr · 09:00",
    status: "active",
  },
];

function load(): Workflow[] {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = window.localStorage.getItem(WF_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return SEED;
}
function loadAudit(): WorkflowAuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(WF_AUDIT_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

let workflows: Workflow[] = load();
let auditLog: WorkflowAuditEntry[] = loadAudit();
const wfListeners = new Set<(s: Workflow[]) => void>();
const auditListeners = new Set<(s: WorkflowAuditEntry[]) => void>();

function persist() {
  try { window.localStorage.setItem(WF_KEY, JSON.stringify(workflows)); } catch { /* ignore */ }
  wfListeners.forEach(l => l(workflows));
}
function persistAudit() {
  try { window.localStorage.setItem(WF_AUDIT_KEY, JSON.stringify(auditLog)); } catch { /* ignore */ }
  auditListeners.forEach(l => l([...auditLog]));
}

function uid(prefix = "wf"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export const workflowsStore = {
  get(): Workflow[] { return workflows; },
  getById(id: string): Workflow | undefined { return workflows.find(w => w.id === id); },

  create(w: Omit<Workflow, "id" | "createdAt" | "updatedAt">, by: string): Workflow {
    const ts = nowStamp();
    const next: Workflow = { ...w, id: uid(), createdAt: ts, updatedAt: ts };
    workflows = [next, ...workflows];
    persist();
    this.recordAudit(next.id, by, `Workflow created: ${next.name}`);
    return next;
  },

  update(id: string, patch: Partial<Workflow>, by: string): Workflow | undefined {
    const current = workflows.find(w => w.id === id);
    if (!current) return;
    const updated: Workflow = { ...current, ...patch, id, updatedAt: nowStamp() };
    workflows = workflows.map(w => w.id === id ? updated : w);
    persist();
    this.recordAudit(id, by, `Workflow edited by ${by}`);
    return updated;
  },

  setStatus(id: string, status: Workflow["status"], by: string) {
    const current = workflows.find(w => w.id === id);
    if (!current) return;
    const wasActive = current.active;
    const active = status === "active";
    workflows = workflows.map(w => w.id === id ? { ...w, status, active, updatedAt: nowStamp() } : w);
    persist();
    const verb = status === "active" ? "activated" : status === "disabled" ? "disabled" : "moved to draft";
    this.recordAudit(id, by, `Workflow ${verb} by ${by}`);
    if (wasActive !== active && active) {
      // First-time activation note for AI drafts
      const w = workflows.find(x => x.id === id);
      if (w?.aiDrafted) {
        this.recordAudit(id, by, `AI-drafted workflow reviewed and activated by ${by}`);
      }
    }
  },

  remove(id: string, by: string) {
    const w = workflows.find(x => x.id === id);
    workflows = workflows.filter(x => x.id !== id);
    persist();
    if (w) this.recordAudit(id, by, `Workflow deleted: ${w.name}`);
  },

  recordAudit(workflowId: string, by: string, event: string) {
    auditLog = [{ id: uid("au"), workflowId, ts: nowStamp(), by, event }, ...auditLog].slice(0, 500);
    persistAudit();
  },
  getAudit(): WorkflowAuditEntry[] { return [...auditLog]; },
  getAuditFor(workflowId: string): WorkflowAuditEntry[] {
    return auditLog.filter(a => a.workflowId === workflowId);
  },

  subscribe(fn: (s: Workflow[]) => void): () => void {
    wfListeners.add(fn);
    return () => { wfListeners.delete(fn); };
  },
  subscribeAudit(fn: (s: WorkflowAuditEntry[]) => void): () => void {
    auditListeners.add(fn); fn([...auditLog]);
    return () => { auditListeners.delete(fn); };
  },
};

// ---------- AI-assisted draft ----------
// Heuristic interpreter — converts a natural sentence into a draft workflow.
// The Admin MUST review and activate. AI does not auto-activate.

export interface AiDraftInput {
  prompt: string;
  byName: string;
  byRole: Role;
  permittedSites: string[];
}

export function aiDraftWorkflow(input: AiDraftInput): Omit<Workflow, "id" | "createdAt" | "updatedAt"> {
  const p = input.prompt.toLowerCase();

  // Event type
  const typeMatch: [RegExp, EventType][] = [
    [/complaint/, "Complaint"],
    [/safeguard/, "Safeguarding Concern"],
    [/compliment/, "Compliment"],
    [/concern/, "Concern"],
    [/medication/, "Medication Event"],
    [/behaviou?r/, "Behavioural Event"],
    [/infect|outbreak/, "Infection / Outbreak"],
    [/regulator|hiqa|mhc/, "Regulatory Notification"],
    [/inspection|visit/, "Inspection / Regulatory Visit"],
    [/information request|records request|sar|foi/, "Information Request / Records Request"],
    [/incident|accident|fall/, "Incident / Accident"],
  ];
  const eventType = typeMatch.find(([r]) => r.test(p))?.[1];

  // Severity
  const minSeverity = /\b(critical)\b/.test(p) ? "Critical"
    : /\bhigh( priority| severity)?\b/.test(p) ? "High"
    : /\bmoderate\b/.test(p) ? "Moderate"
    : undefined;

  // Restricted
  const onlyRestricted = /\brestricted\b/.test(p);

  // Trigger
  let trigger: WorkflowTrigger = "event_submitted";
  if (/overdue/.test(p)) trigger = "task_overdue";
  else if (/approaching|due in|deadline/.test(p)) trigger = "info_request_approaching_due";
  else if (/closed/.test(p)) trigger = "event_closed";
  else if (onlyRestricted) trigger = "restricted_event_submitted";
  else if (minSeverity === "High" || minSeverity === "Critical") trigger = "high_severity_event";

  // Recipients
  const recipients: AlertRecipient[] = [];
  if (/site manager/.test(p)) recipients.push({ kind: "site_manager" });
  if (/governance/.test(p)) recipients.push({ kind: "governance_lead" });
  if (/safeguard(ing)? lead/.test(p)) recipients.push({ kind: "safeguarding_lead" });
  if (/admin/.test(p)) recipients.push({ kind: "admins" });
  if (/assigned (manager|owner)/.test(p)) recipients.push({ kind: "assigned_manager" });
  if (recipients.length === 0) recipients.push({ kind: "site_manager" });

  // Actions
  const actions: WorkflowAction[] = [];
  let nextId = 1;
  const add = (a: Omit<WorkflowAction, "id">) => actions.push({ id: `a${nextId++}`, ...a });

  add({ kind: "in_app_alert", label: `Alert ${recipients.map(r => RECIPIENT_LABELS[r.kind]).join(" and ")}`, recipients });

  // Task / due date
  const dueMatch = p.match(/(\d+)\s*(h|hour|hours|hr|hrs|d|day|days)/);
  if (dueMatch || /follow[- ]?up|task/.test(p)) {
    const dueRule = dueMatch ? (dueMatch[2].startsWith("h") || dueMatch[2].startsWith("hr") ? `${dueMatch[1]}h` : `${dueMatch[1]}d`) : "48h";
    add({ kind: "create_followup_task", label: `Create follow-up task (due in ${dueRule})`, dueRule });
  }
  if (/missing information|missing info/.test(p)) {
    add({ kind: "request_missing_info", label: "Request missing information from submitter" });
  }
  if (/manager review|review required/.test(p)) {
    add({ kind: "require_manager_review", label: "Require Manager/Admin review" });
  }
  const closureApproval = /closure approval|approve.*closure|require.*closure/.test(p);
  if (closureApproval) {
    add({ kind: "require_closure_approval", label: "Require closure approval" });
  }

  // Name suggestion
  const namePieces = [
    eventType,
    minSeverity ? `${minSeverity} priority` : null,
    "workflow",
  ].filter(Boolean);
  const name = namePieces.join(" — ") || "Untitled workflow";

  // Ownership: Admin → organisation draft; Manager → site/local
  const ownership: WorkflowOwnership = input.byRole === "admin" ? "organisation" : "site";
  const scopeSites = input.byRole === "admin" ? [...ALL_SITES] : [...input.permittedSites];

  return {
    name,
    description: input.prompt.trim(),
    active: false,
    ownership,
    ownerName: input.byName,
    ownerRole: input.byRole,
    scopeSites,
    trigger,
    conditions: { eventType, minSeverity, onlyRestricted: onlyRestricted || undefined },
    actions,
    requiresClosureApproval: closureApproval,
    status: "draft",
    aiDrafted: true,
  };
}

// ---------- Permissions ----------
const PERM_KEY = "logup.workflows.managerPerms.v1";
type ManagerPerms = Record<string, boolean>; // displayName → canManageSiteWorkflows

function loadPerms(): ManagerPerms {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PERM_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}
let perms: ManagerPerms = loadPerms();
const permListeners = new Set<(p: ManagerPerms) => void>();

export const workflowPermissionsStore = {
  get(): ManagerPerms { return perms; },
  canManageSiteWorkflows(displayName: string, role: Role): boolean {
    if (role === "admin") return true;
    if (!isManagerRole(role)) return false;
    return !!perms[displayName];
  },
  grant(displayName: string, value: boolean) {
    perms = { ...perms, [displayName]: value };
    try { window.localStorage.setItem(PERM_KEY, JSON.stringify(perms)); } catch { /* ignore */ }
    permListeners.forEach(l => l(perms));
  },
  subscribe(fn: (p: ManagerPerms) => void) {
    permListeners.add(fn);
    return () => { permListeners.delete(fn); };
  },
};

import { useSyncExternalStore } from "react";
export function useWorkflows(): Workflow[] {
  return useSyncExternalStore(
    (cb) => workflowsStore.subscribe(() => cb()),
    workflowsStore.get,
    workflowsStore.get,
  );
}
export function useWorkflowPermissions(): ManagerPerms {
  return useSyncExternalStore(
    (cb) => workflowPermissionsStore.subscribe(() => cb()),
    workflowPermissionsStore.get,
    workflowPermissionsStore.get,
  );
}
