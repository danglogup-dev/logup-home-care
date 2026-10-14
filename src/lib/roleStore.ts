// Demo role & scope model for LogUp prototype.
//
// Permission model:
//   - `role` decides WHAT a user can do (admin / manager / frontline / viewonly / external).
//   - `scopeSiteIds` decides WHERE they can do it (list of SiteId).
//   - Site NAMES are display labels only. All permission checks use `SiteId`.
//
// Presets are aligned to real staff in `src/lib/demoDataRegistry.ts` so every
// module can look up the "viewing as" identity, key-worker assignments and
// specialist links from a single source of truth.

import { useSyncExternalStore } from "react";
import {
  SITES,
  SITE_BY_ID,
  STAFF_BY_ID,
  PERSON_BY_ID,
  type SiteId,
  type StaffId,
  type PersonSupportedId,
  type DemoStaff,
} from "./demoDataRegistry";

// ---------- Types ----------

export type Role = "admin" | "manager" | "coordinator" | "frontline" | "viewonly" | "external" | "family";

/** Demo access only; Cloud authorization remains authenticated and server-enforced. */
export function isManagerRole(role: Role): boolean {
  return role === "manager" || role === "coordinator";
}

export const ALL_SITES = SITES.map((s) => s.name) as unknown as readonly string[];
export type SiteName = (typeof ALL_SITES)[number];

export interface RoleState {
  role: Role;
  /** Real staff id from `demoDataRegistry`. Permission source of truth for identity. */
  staffId: StaffId;
  /** Permission source of truth for WHERE. Never rely on site names for gating. */
  scopeSiteIds: SiteId[];
  /** Back-compat: site NAMES for display / legacy name-based helpers. */
  scope: string[];
  /** Legacy — kept optional, unused for gating (registry is site-only). */
  unit?: string;
  /** People this staff member is a key worker for. */
  keyWorkerFor: PersonSupportedId[];
  /** People an external specialist has been linked to. */
  linkedPersonSupportedIds?: PersonSupportedId[];
  /** Display name + title for the "Viewing as" chip. */
  displayName: string;
  title: string;
  /** Preset id (so the switcher can highlight the active preset). */
  presetId: string;
  /** Extra action capabilities granted to this person beyond their role default. */
  grantedCapabilities?: Capability[];
}

export interface RolePreset extends RoleState {
  id: string;
  label: string;
  description: string;
}

// ---------- Preset construction ----------

/** Build a preset directly from a registry staff record so scope/keyWorker/link stay in sync. */
function presetFromStaff(
  id: string,
  label: string,
  description: string,
  staffId: StaffId,
  role: Role,
  scopeSiteIds: SiteId[],
  overrides: Partial<RolePreset> = {},
): RolePreset {
  const s: DemoStaff | undefined = STAFF_BY_ID[staffId];
  return {
    id,
    label,
    description,
    role,
    staffId,
    scopeSiteIds,
    scope: scopeSiteIds.map((sid) => SITE_BY_ID[sid]?.name).filter(Boolean) as string[],
    keyWorkerFor: [...(s?.keyWorkerFor ?? [])],
    linkedPersonSupportedIds: s?.linkedPersonSupportedIds ? [...s.linkedPersonSupportedIds] : undefined,
    displayName: s?.name ?? label,
    title: s?.roleLabel ?? label,
    presetId: id,
    ...overrides,
  };
}

export const ROLE_PRESETS: RolePreset[] = [
  presetFromStaff("admin",             "Admin (Group)",              "Full access across all 3 sites",              "STAFF-AOIFE",  "admin",     ["SITE-ECK", "SITE-WWD", "SITE-WWD"]),
  presetFromStaff("manager-multi",     "Manager · Multi-site",       "East Cork + West Waterford",             "STAFF-SIOBHAN","manager",   ["SITE-ECK", "SITE-WWD"]),
  presetFromStaff("manager-single",    "Manager · Single site",      "East Cork only",                          "STAFF-DANIEL", "manager",   ["SITE-ECK"]),
  presetFromStaff("manager-elm",       "Manager · Elm Grove",        "West Waterford only",                         "STAFF-CLAIRE", "manager",   ["SITE-WWD"]),
  presetFromStaff("coordinator", "Coordinator · East Cork", "East Cork service area", "STAFF-DANIEL", "coordinator", ["SITE-ECK"], { title: "Coordinator" }),
  presetFromStaff("coordinator-waterford", "Coordinator · West Waterford", "West Waterford service area", "STAFF-CLAIRE", "coordinator", ["SITE-WWD"], { title: "Coordinator" }),
  presetFromStaff("coordinator-multi", "Coordinator · Both areas", "East Cork + West Waterford", "STAFF-SIOBHAN", "coordinator", ["SITE-ECK", "SITE-WWD"], { title: "Coordinator" }),
  presetFromStaff("frontline",         "Frontline staff",            "Support Worker · East Cork",              "STAFF-LIAM",   "frontline", ["SITE-ECK"]),
  presetFromStaff("keyworker-emma",    "Frontline · Key worker",     "Emma Ryan · Key worker for Patrick",           "STAFF-EMMA",   "frontline", ["SITE-ECK"]),
  presetFromStaff("keyworker-aisling", "Frontline · Key worker",     "Aisling Doherty · Key worker for Mary",        "STAFF-AISLING","frontline", ["SITE-ECK"]),
  presetFromStaff("keyworker-niamh",   "Frontline · Key worker",     "Niamh Connolly · Riverside key worker",        "STAFF-NIAMH",  "frontline", ["SITE-WWD"]),
  presetFromStaff("keyworker-orla",    "Frontline · Key worker",     "Orla McCarthy · Elm Grove key worker",         "STAFF-ORLA",   "frontline", ["SITE-WWD"]),
  presetFromStaff("viewonly",          "View only",                  "Governance viewer · read-only, all sites",     "STAFF-CIARAN", "viewonly",  ["SITE-ECK", "SITE-WWD", "SITE-WWD"]),
  presetFromStaff("specialist-sarah",  "External specialist",        "Sarah Keane · Dietitian (linked to Mary)",     "STAFF-SARAH",  "external",  []),
  presetFromStaff("family-patrick",    "Family member",              "Mary Murphy · Daughter of Patrick (read-only)", "STAFF-FAMILY-MARY", "family", []),
  presetFromStaff("specialist-brian",  "External specialist",        "Brian O'Donnell · Physio (linked to Patrick)", "STAFF-BRIAN",  "external",  []),
];

// ---------- Store ----------

const STORAGE_KEY = "logup.role.v2";

function loadInitial(): RoleState {
  if (typeof window === "undefined") return { ...ROLE_PRESETS[0] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RoleState> & { presetId?: string };
      // If the persisted shape is stale, fall back to the preset by id.
      const preset = ROLE_PRESETS.find((p) => p.id === parsed.presetId);
      if (preset) return stripPreset(preset);
    }
  } catch { /* ignore */ }
  return stripPreset(ROLE_PRESETS[0]);
}

function stripPreset(p: RolePreset): RoleState {
  const { id: _id, label: _label, description: _desc, ...rest } = p;
  return { ...rest, scopeSiteIds: [...p.scopeSiteIds], scope: [...p.scope], keyWorkerFor: [...p.keyWorkerFor] };
}

let state: RoleState = loadInitial();
const listeners = new Set<(s: RoleState) => void>();

function persist() {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export const roleStore = {
  get(): RoleState { return state; },
  setPreset(id: string) {
    const p = ROLE_PRESETS.find((x) => x.id === id);
    if (!p) return;
    state = stripPreset(p);
    persist();
    listeners.forEach((l) => l(state));
  },
  subscribe(fn: (s: RoleState) => void): () => void {
    listeners.add(fn);
    fn(state);
    return () => { listeners.delete(fn); };
  },
};

// ---------- Capability matrix (module-level sidebar/route access) ----------

export type ModuleKey =
  | "visits.live"
  | "visits.today"
  | "visits.hours"
  | "family.portal"
  | "incidents.overview"
  | "incidents.board"
  | "incidents.capture"
  | "incidents.reporting"
  | "audits.overview"
  | "audits.my"
  | "audits.templates"
  | "audits.reporting"
  | "policies.library"
  | "policies.approvals"
  | "policies.chainTemplates"
  | "workforce.overview"
  | "workforce.qualifications"
  | "workforce.requirements"
  | "workforce.coverage"
  | "workforce.reporting"
  | "tasks.today"
  | "tasks.overview"
  | "tasks.register"
  | "tasks.recurring"
  | "tasks.reporting"
  | "insights.overview"
  | "carePlans.overview"
  | "carePlans.create"
  | "carePlans.people"
  | "carePlans.reviews"
  | "carePlans.contributions"
  | "carePlans.access"
  | "carePlans.templates"
  | "carePlans.reporting"
  | "admin.eventTypes"
  | "admin.workflows"
  | "admin.approvalChains"
  | "admin.dataHealth"
  | "admin.settings"
  | "team"
  | "org.sites"
  | "org.serviceUsers"
  | "debug.permissions";

const MATRIX: Record<Exclude<Role, "coordinator">, Set<ModuleKey>> = {
  admin: new Set<ModuleKey>([
    "visits.live","visits.hours",
    "incidents.overview","incidents.board","incidents.capture","incidents.reporting",
    "audits.overview","audits.my","audits.templates","audits.reporting",
    "policies.library","policies.approvals","policies.chainTemplates",
    "workforce.overview","workforce.qualifications","workforce.requirements","workforce.coverage","workforce.reporting",
    "tasks.today","tasks.overview","tasks.register","tasks.recurring","tasks.reporting",
    "insights.overview",
    "carePlans.overview","carePlans.create","carePlans.people","carePlans.reviews","carePlans.contributions","carePlans.access","carePlans.templates","carePlans.reporting",
    "admin.eventTypes","admin.workflows","admin.approvalChains","admin.dataHealth","admin.settings",
    "team",
    "org.sites","org.serviceUsers",
    "debug.permissions",
  ]),
  manager: new Set<ModuleKey>([
    "visits.live","visits.hours",
    "incidents.overview","incidents.board","incidents.capture","incidents.reporting",
    "audits.overview","audits.my","audits.templates","audits.reporting",
    "policies.library",
    "workforce.overview","workforce.qualifications","workforce.requirements","workforce.coverage","workforce.reporting",
    "tasks.today","tasks.overview","tasks.register","tasks.recurring","tasks.reporting",
    "insights.overview",
    "carePlans.overview","carePlans.create","carePlans.people","carePlans.reviews","carePlans.contributions","carePlans.access","carePlans.reporting",
    "admin.workflows",
    "team",
    "org.sites","org.serviceUsers",
  ]),
  frontline: new Set<ModuleKey>([
    "visits.today",
    "incidents.capture",
    "audits.my",
    "policies.library",
    "workforce.qualifications",
    "tasks.today",
    "carePlans.people",
    "team",
  ]),
  viewonly: new Set<ModuleKey>([
    "visits.hours",
    "incidents.overview",
    "audits.overview",
    "policies.library",
    "workforce.overview",
    "tasks.overview",
    "insights.overview",
    "carePlans.overview","carePlans.people","carePlans.reporting",
    "team",
    "org.sites","org.serviceUsers",
  ]),
  // External specialists have NO main-app module access. They can only reach
  // `/external/*` invited contribution routes (handled at the router level).
  external: new Set<ModuleKey>([]),
  // Family contacts only see the read-only family page for their linked client.
  family: new Set<ModuleKey>(["family.portal"]),
};

export function canAccess(key: ModuleKey, role: Role = state.role): boolean {
  return MATRIX[role === "coordinator" ? "manager" : role].has(key);
}

// ---------- Action-level capabilities ----------
export type Capability =
  | "edit" | "assign" | "delete"
  | "policy.approve" | "policy.publish" | "policy.editChainTemplates"
  | "audit.editTemplates"
  | "carePlan.editTemplates"
  | "team.edit" | "team.invite";

export function can(cap: Capability, role: Role = state.role): boolean {
  if (role === "viewonly" || role === "external" || role === "family") return false;
  if (role === "admin") return true;
  if (isManagerRole(role)) {
    if (cap === "policy.publish") return false;
    if (cap === "policy.approve") return false;
    if (cap === "policy.editChainTemplates") return false;
    if (cap === "audit.editTemplates") return false;
    if (cap === "carePlan.editTemplates") return !!state.grantedCapabilities?.includes(cap) && state.role === role; // managers only when granted
    if (cap === "team.invite") return false;
    return true;
  }
  // frontline
  if (cap === "edit") return true;
  return false;
}

// ============================================================================
// SCOPE HELPERS — SITE ID ONLY
// ============================================================================

/** True when the given siteId is in the current role's scope (admin = all). */
export function inScopeSite(
  siteId: SiteId | undefined | null,
  s: RoleState = state,
): boolean {
  if (s.role === "admin") return true;
  if (!siteId) return true; // unknown → don't hide
  return s.scopeSiteIds.includes(siteId);
}

/** All siteIds visible to the current role. */
export function scopedSiteIds(s: RoleState = state): SiteId[] {
  if (s.role === "admin") return SITES.map((x) => x.id);
  return [...s.scopeSiteIds];
}

/** Resolve a person's siteId and check scope. */
export function personInScope(
  personId: PersonSupportedId | string | undefined,
  s: RoleState = state,
): boolean {
  if (!personId) return false;
  const p = PERSON_BY_ID[personId as PersonSupportedId];
  if (!p) return false;
  // Specialists: only their linked people, ignore site scope.
  if (s.role === "external" || s.role === "family") {
    return (s.linkedPersonSupportedIds ?? []).includes(p.id);
  }
  return inScopeSite(p.siteId, s);
}

/** Live coordination is restricted to manager-level roles and known client areas. */
export function canCoordinateVisit(clientSiteId: SiteId | undefined, s: RoleState = state): boolean {
  return Boolean(clientSiteId && canAccess("visits.live", s.role) && inScopeSite(clientSiteId, s));
}

// ---------- Identity ----------

export function isKeyWorkerFor(personId: PersonSupportedId | string, s: RoleState = state): boolean {
  return s.keyWorkerFor.includes(personId as PersonSupportedId);
}

export function isLinkedSpecialistFor(personId: PersonSupportedId | string, s: RoleState = state): boolean {
  if (s.role !== "external") return false;
  return (s.linkedPersonSupportedIds ?? []).includes(personId as PersonSupportedId);
}

export function isSelfStaff(staffId: StaffId | string | undefined | null, s: RoleState = state): boolean {
  if (!staffId) return false;
  return s.staffId === staffId;
}

// ---------- Events ----------

export function canLogEvent(siteId: SiteId, s: RoleState = state): boolean {
  if (s.role === "viewonly" || s.role === "external") return false;
  return inScopeSite(siteId, s);
}
export function canReviewEvents(siteId: SiteId, s: RoleState = state): boolean {
  if (s.role !== "admin" && !isManagerRole(s.role)) return false;
  return inScopeSite(siteId, s);
}
export function canExportEvents(siteId: SiteId | undefined, s: RoleState = state): boolean {
  if (s.role !== "admin" && !isManagerRole(s.role)) return false;
  return inScopeSite(siteId, s);
}

// ---------- Audits ----------

export interface AuditLike {
  siteId?: SiteId | null;
  assignedStaffIds?: readonly StaffId[];
  completerStaffIds?: readonly StaffId[];
}
export function canCompleteAudit(audit: AuditLike, s: RoleState = state): boolean {
  if (s.role === "viewonly" || s.role === "external") return false;
  if (s.role === "admin") return true;
  if (isManagerRole(s.role)) return inScopeSite(audit.siteId ?? undefined, s);
  // frontline
  return Boolean(
    audit.assignedStaffIds?.includes(s.staffId) ||
    audit.completerStaffIds?.includes(s.staffId),
  );
}
export function canReviewAudit(siteId: SiteId, s: RoleState = state): boolean {
  if (s.role !== "admin" && !isManagerRole(s.role)) return false;
  return inScopeSite(siteId, s);
}
export function canEditAuditTemplates(s: RoleState = state): boolean {
  return s.role === "admin";
}

// ---------- Policy Hub ----------

export interface PolicyLike {
  status?: string;
  restrictedTo?: readonly StaffId[];
}
export function canViewPublishedPolicy(policy: PolicyLike | undefined, s: RoleState = state): boolean {
  if (s.role === "external") return false;
  if (!policy) return true;
  if (!policy.restrictedTo || policy.restrictedTo.length === 0) return true;
  return policy.restrictedTo.includes(s.staffId) || s.role === "admin";
}
export function canProposePolicyUpdate(s: RoleState = state): boolean {
  return s.role === "admin" || isManagerRole(s.role);
}
export function canApprovePolicy(s: RoleState = state): boolean { return s.role === "admin"; }
export function canPublishPolicy(s: RoleState = state): boolean { return s.role === "admin"; }

// ---------- Workforce ----------

export function canViewWorkforceForSite(siteId: SiteId, s: RoleState = state): boolean {
  if (s.role === "external") return false;
  if (s.role === "admin") return true;
  if (isManagerRole(s.role) || s.role === "viewonly") return inScopeSite(siteId, s);
  return false;
}
export function canViewOwnQualifications(staffId: StaffId, s: RoleState = state): boolean {
  if (s.role === "external") return false;
  if (isSelfStaff(staffId, s)) return true;
  if (s.role === "admin") return true;
  const target = STAFF_BY_ID[staffId];
  if (!target) return false;
  if (isManagerRole(s.role)) return target.scopeSiteIds.some((sid) => inScopeSite(sid, s));
  return false;
}
export function canEditWorkforce(siteId: SiteId, s: RoleState = state): boolean {
  if (s.role !== "admin" && !isManagerRole(s.role)) return false;
  return inScopeSite(siteId, s);
}

// ---------- Insights ----------

export function canViewInsightsForSite(siteId: SiteId, s: RoleState = state): boolean {
  if (s.role === "external" || s.role === "frontline") return false;
  if (s.role === "admin") return true;
  return inScopeSite(siteId, s);
}

// ---------- Tasks ----------

export interface TaskLike {
  siteId?: SiteId | null;
  assignedStaffIds?: readonly StaffId[];
  personSupportedId?: PersonSupportedId | string | null;
}
export function canViewTask(task: TaskLike, s: RoleState = state): boolean {
  if (s.role === "external") return false;
  if (s.role === "admin") return true;
  if (isManagerRole(s.role) || s.role === "viewonly") return inScopeSite(task.siteId ?? undefined, s);
  // frontline / key worker
  if (task.assignedStaffIds?.includes(s.staffId)) return true;
  if (task.personSupportedId && isKeyWorkerFor(task.personSupportedId, s)) return true;
  return false;
}
export function canCompleteTask(task: TaskLike, s: RoleState = state): boolean {
  if (s.role === "viewonly") return false;
  return canViewTask(task, s);
}
export function canAssignTask(siteId: SiteId, s: RoleState = state): boolean {
  if (s.role !== "admin" && !isManagerRole(s.role)) return false;
  return inScopeSite(siteId, s);
}

// ---------- Global ----------

export function canExport(_module: string, siteId?: SiteId, s: RoleState = state): boolean {
  if (s.role === "viewonly" || s.role === "frontline" || s.role === "external") return false;
  if (s.role === "admin") return true;
  return inScopeSite(siteId, s);
}

/** Central view-only guard used by callers that need a boolean assertion. */
export function assertReadOnly(s: RoleState = state): boolean {
  return s.role === "viewonly";
}

// ============================================================================
// LEGACY NAME-BASED HELPERS (back-compat — keep working, do not use in new code)
// ============================================================================

/** DEPRECATED: use `inScopeSite(siteId)` for permission checks. Site-name based. */
export function inScope(site: string | undefined | null, role: Role = state.role, scope: string[] = state.scope): boolean {
  if (role === "admin") return true;
  if (!site) return true;
  return scope.includes(site);
}

/** True when the current user is a frontline worker. */
export function isFrontline(role: Role = state.role): boolean { return role === "frontline"; }

/** DEPRECATED: use `scopedSiteIds()` for permission checks. Returns site NAMES for display. */
export function scopedSites(role: Role = state.role, scope: string[] = state.scope): string[] {
  if (role === "admin") return SITES.map((s) => s.name);
  return [...scope];
}

/** True when the given person name matches the current "Viewing as" identity. */
export function isMe(name: string | undefined | null, current: string = state.displayName): boolean {
  if (!name) return false;
  return name.trim().toLowerCase() === current.trim().toLowerCase();
}

export function useRole() {
  return useSyncExternalStore(roleStore.subscribe, roleStore.get, roleStore.get);
}
