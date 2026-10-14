/**
 * Shared service users store — the one record of service users used by
 * Events and Care Planning. Seeded from demoDataRegistry, persisted to
 * localStorage. No hard delete: status changes go through lifecycle events.
 */
import { useSyncExternalStore } from "react";
import {
  PEOPLE_SUPPORTED, getSiteName,
  type DemoPersonSupported, type ServiceUserId, type SiteId, type StaffId,
} from "./demoDataRegistry";
import { SCENARIO_LIFECYCLE } from "./demoScenario";
import { roleStore, scopedSiteIds, type RoleState } from "./roleStore";

export type ServiceUser = DemoPersonSupported;

export type LifecycleEventType =
  | "admitted" | "transferred" | "temporary_absence" | "returned" | "discharged" | "deceased";

export interface LifecycleEvent {
  id: string;
  serviceUserId: ServiceUserId;
  type: LifecycleEventType;
  date: string;
  siteId: SiteId;
  toSiteId?: SiteId;
  recordedByStaffId: StaffId;
  note: string;
}

export interface SiteHistoryEntry {
  siteId: SiteId;
  siteName: string;
  from: string;
  to?: string;
}

interface State {
  users: ServiceUser[];
  events: LifecycleEvent[];
}

const STORAGE_KEY = "logup.serviceUsers.v1";

function seed(): State {
  const users = PEOPLE_SUPPORTED.map((p) => ({ ...p, representatives: p.representatives.map((r) => ({ ...r })) }));
  const events: LifecycleEvent[] = users.map((u) => ({
    id: `LCE-${u.id}-ADM`,
    serviceUserId: u.id,
    type: "admitted",
    date: u.admissionDate,
    siteId: u.siteId,
    recordedByStaffId: u.createdByStaffId,
    note: "Admission recorded (demo seed).",
  }));
  for (const m of SCENARIO_LIFECYCLE) {
    events.push({ ...m });
    const u = users.find((x) => x.id === m.serviceUserId);
    if (u) u.status = m.type === "temporary_absence" ? "temporary_absence" : "active";
  }
  return { users, events };
}

function load(): State {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as State;
      if (Array.isArray(parsed.users) && Array.isArray(parsed.events)) return parsed;
    }
  } catch { /* ignore */ }
  return seed();
}

let state: State = load();
const listeners = new Set<() => void>();

function emit() {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

const now = () => new Date().toISOString();

export type NewServiceUserInput = Omit<
  ServiceUser,
  "id" | "siteName" | "createdAt" | "createdByStaffId" | "updatedAt" | "updatedByStaffId"
> & { id?: ServiceUserId };

const STATUS_FOR_EVENT: Partial<Record<LifecycleEventType, ServiceUser["status"]>> = {
  admitted: "active",
  returned: "active",
  transferred: "active",
  temporary_absence: "temporary_absence",
  discharged: "discharged",
  deceased: "deceased",
};

export const serviceUsersStore = {
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  getState(): State { return state; },
  /** All records, unscoped. For internal joins only (e.g. labelling by id). */
  all(): ServiceUser[] { return state.users; },

  /** Service users within the role's site scope. */
  list(role: RoleState = roleStore.get()): ServiceUser[] {
    const sites = new Set(scopedSiteIds(role));
    return state.users.filter((u) => sites.has(u.siteId));
  },

  getById(id: string | undefined): ServiceUser | undefined {
    return id ? state.users.find((u) => u.id === id) : undefined;
  },

  add(input: NewServiceUserInput, actorStaffId: StaffId): ServiceUser {
    const ts = now();
    const id = (input.id ?? `PS-${String(state.users.length + 1).padStart(3, "0")}`) as ServiceUserId;
    const user: ServiceUser = {
      ...input, id, siteName: getSiteName(input.siteId),
      createdAt: ts, createdByStaffId: actorStaffId, updatedAt: ts, updatedByStaffId: actorStaffId,
    };
    state = {
      users: [...state.users, user],
      events: [...state.events, {
        id: `LCE-${id}-${Date.now()}`, serviceUserId: id, type: "admitted",
        date: input.admissionDate, siteId: input.siteId, recordedByStaffId: actorStaffId, note: "Admission recorded.",
      }],
    };
    emit();
    return user;
  },

  update(id: ServiceUserId, patch: Partial<Omit<ServiceUser, "id" | "createdAt" | "createdByStaffId">>, actorStaffId: StaffId): ServiceUser | undefined {
    const existing = state.users.find((u) => u.id === id);
    if (!existing) return undefined;
    const next: ServiceUser = {
      ...existing, ...patch,
      siteName: getSiteName(patch.siteId ?? existing.siteId),
      updatedAt: now(), updatedByStaffId: actorStaffId,
    };
    state = { ...state, users: state.users.map((u) => (u.id === id ? next : u)) };
    emit();
    return next;
  },

  /** Record a movement. Updates status/site on the record with stamps. */
  recordLifecycleEvent(ev: Omit<LifecycleEvent, "id">): LifecycleEvent {
    const event: LifecycleEvent = { ...ev, id: `LCE-${ev.serviceUserId}-${Date.now()}` };
    state = { ...state, events: [...state.events, event] };
    const status = STATUS_FOR_EVENT[ev.type];
    const newSite = ev.type === "transferred" && ev.toSiteId ? ev.toSiteId : undefined;
    const existing = state.users.find((u) => u.id === ev.serviceUserId);
    if (existing) {
      this.update(ev.serviceUserId, { ...(status ? { status } : {}), ...(newSite ? { siteId: newSite } : {}) }, ev.recordedByStaffId);
    } else {
      emit();
    }
    return event;
  },

  lifecycleEvents(serviceUserId: ServiceUserId): LifecycleEvent[] {
    return state.events
      .filter((e) => e.serviceUserId === serviceUserId)
      .sort((a, b) => a.date.localeCompare(b.date));
  },
};

// ---------- Unfinished admissions (drafts) ----------

export interface AdmissionDraft {
  id: string;
  /** Free-form form state of the Admit flow. */
  data: Record<string, unknown>;
  label: string;
  siteId?: SiteId;
  savedAt: string;
  savedByStaffId: StaffId;
}
const DRAFTS_KEY = "logup.admissionDrafts.v1";
let drafts: AdmissionDraft[] = (() => {
  if (typeof window === "undefined") return [];
  try { const raw = window.localStorage.getItem(DRAFTS_KEY); return raw ? JSON.parse(raw) as AdmissionDraft[] : []; } catch { return []; }
})();
const draftListeners = new Set<() => void>();
function emitDrafts() {
  try { window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts)); } catch { /* ignore */ }
  draftListeners.forEach((l) => l());
}
export const admissionDraftsStore = {
  subscribe(l: () => void) { draftListeners.add(l); return () => { draftListeners.delete(l); }; },
  getAll(): AdmissionDraft[] { return drafts; },
  get(id: string | null | undefined) { return id ? drafts.find((d) => d.id === id) : undefined; },
  save(d: Omit<AdmissionDraft, "id" | "savedAt"> & { id?: string }): AdmissionDraft {
    const id = d.id ?? `ADM-DRAFT-${Date.now()}`;
    const next: AdmissionDraft = { ...d, id, savedAt: now() };
    drafts = [...drafts.filter((x) => x.id !== id), next];
    emitDrafts();
    return next;
  },
  /** Removed once the admission is completed (the resident record then holds the data). */
  remove(id: string) { drafts = drafts.filter((x) => x.id !== id); emitDrafts(); },
};
export function useAdmissionDrafts(): AdmissionDraft[] {
  return useSyncExternalStore(admissionDraftsStore.subscribe, admissionDraftsStore.getAll, admissionDraftsStore.getAll);
}

/** Next service user code for a site, e.g. "OAK-0004". */
export function nextServiceUserCode(siteId: SiteId, siteName: string): string {
  const prefix = siteName.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "SU";
  const n = state.users.filter((u) => u.serviceUserCode.startsWith(prefix + "-")).length + 1;
  void siteId;
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

/** Site history derived from lifecycle events (the authoritative movement log). */
export function getSiteHistory(serviceUserId: ServiceUserId): SiteHistoryEntry[] {
  const out: SiteHistoryEntry[] = [];
  const close = (date: string) => { const last = out[out.length - 1]; if (last && !last.to) last.to = date; };
  for (const e of serviceUsersStore.lifecycleEvents(serviceUserId)) {
    if (e.type === "admitted") {
      close(e.date);
      out.push({ siteId: e.siteId, siteName: getSiteName(e.siteId), from: e.date });
    } else if (e.type === "transferred" && e.toSiteId) {
      close(e.date);
      out.push({ siteId: e.toSiteId, siteName: getSiteName(e.toSiteId), from: e.date });
    } else if (e.type === "discharged" || e.type === "deceased") {
      close(e.date);
    }
  }
  return out;
}

/** Display name for a service user id, or the given fallback. */
export function serviceUserName(id: string | undefined, fallback = "No service user linked"): string {
  return serviceUsersStore.getById(id)?.name ?? fallback;
}

export function useServiceUsers(): State {
  return useSyncExternalStore(serviceUsersStore.subscribe, serviceUsersStore.getState, serviceUsersStore.getState);
}
