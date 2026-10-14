// Care Plan Approval Chains store.
//
// Admin-configured, human-only approval workflow attached to care plan drafts.
// AI never approves or publishes; every approval decision records a person
// (name + email) and is preserved as audit history.

import { useSyncExternalStore } from "react";
import type { Role } from "./roleStore";

// ---------- Types ----------

export type ApprovalScopeType = "organisation" | "site" | "house" | "unit";
export type ApprovalLevelRule = "any_one" | "all_required";
export type ApprovalChainStatus = "active" | "inactive" | "draft";

export interface ApprovalPerson {
  id: string;
  name: string;
  email: string;
  roleLabel?: string;
  /** Canonical staff ID from demoDataRegistry — the only field used for permission checks. */
  staffId?: string;
}

export interface ApprovalLevel {
  id: string;
  levelNumber: number;
  levelName: string;
  rule: ApprovalLevelRule;
  approvers: ApprovalPerson[];
}

export interface CarePlanApprovalChain {
  id: string;
  name: string;
  description?: string;
  status: ApprovalChainStatus;
  scopeType: ApprovalScopeType;
  scopeId: string;      // free-form identifier ("East Cork", "Rose Wing", etc.)
  scopeLabel: string;   // display label
  levels: ApprovalLevel[];
  createdAt: string;
  updatedAt: string;
}

export type CarePlanApprovalInstanceStatus =
  | "not_started"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "cancelled";

export interface CarePlanApprovalDecision {
  id: string;
  levelId: string;
  levelNumber: number;
  approverName: string;
  approverEmail: string;
  decision: "approved" | "rejected" | "override";
  note?: string;
  decidedAt: string;
}

export interface CarePlanApprovalInstance {
  id: string;
  carePlanId: string;     // versionId
  personId: string;
  carePlanVersion: number;
  chainId: string;
  chainName: string;
  chainSnapshot: CarePlanApprovalChain; // preserved copy at time of start
  currentLevelNumber: number;
  status: CarePlanApprovalInstanceStatus;
  decisions: CarePlanApprovalDecision[];
  startedAt: string;
  completedAt?: string;
}

interface State {
  chains: CarePlanApprovalChain[];
  instances: CarePlanApprovalInstance[];
}

// ---------- Seed ----------

function nowIso() { return new Date().toISOString(); }

function seed(): State {
  const t = nowIso();
  const chains: CarePlanApprovalChain[] = [
    {
      id: "CHAIN-OAKFIELD",
      name: "East Cork Care Plan Approval Chain",
      description: "Default approval chain for care plan changes at East Cork.",
      status: "active",
      scopeType: "site",
      scopeId: "East Cork",
      scopeLabel: "East Cork",
      createdAt: t,
      updatedAt: t,
      levels: [
        {
          id: "LVL-OAK-1",
          levelNumber: 1,
          levelName: "PIC / Deputy PIC Review",
          rule: "any_one",
          approvers: [
            { id: "AP-OAK-1a", staffId: "STAFF-SIOBHAN", name: "Siobhán Kelly", email: "siobhan.kelly@oakfield.example", roleLabel: "Person in Charge" },
            { id: "AP-OAK-1b", staffId: "STAFF-DANIEL", name: "Daniel Walsh", email: "daniel.walsh@oakfield.example", roleLabel: "Deputy Person in Charge" },
          ],
        },
        {
          id: "LVL-OAK-2",
          levelNumber: 2,
          levelName: "Regional Manager Approval",
          rule: "any_one",
          approvers: [
            { id: "AP-OAK-2a", staffId: "STAFF-AOIFE", name: "Aoife Brennan", email: "aoife.brennan@oakfield.example", roleLabel: "Regional Manager" },
          ],
        },
      ],
    },
    {
      id: "CHAIN-RIVERSIDE",
      name: "West Waterford Care Plan Approval Chain",
      description: "Default approval chain for care plan changes at West Waterford.",
      status: "active",
      scopeType: "site",
      scopeId: "West Waterford",
      scopeLabel: "West Waterford",
      createdAt: t,
      updatedAt: t,
      levels: [
        {
          id: "LVL-RIV-1",
          levelNumber: 1,
          levelName: "Manager Review",
          rule: "any_one",
          approvers: [
            { id: "AP-RIV-1a", staffId: "STAFF-CLAIRE", name: "Claire Nolan", email: "claire.nolan@riverside.example", roleLabel: "House Manager" },
          ],
        },
      ],
    },
  ];

  // Seed an in-progress approval instance for Patrick Murphy's Care Plan v4
  // so the demo shows the Oakfield chain awaiting Level 1 approval.
  const oakfield = chains[0];
  const instances: CarePlanApprovalInstance[] = [
    {
      id: "APP-PS001-V4",
      carePlanId: "CP-PS001-V4",
      personId: "PS-001",
      carePlanVersion: 4,
      chainId: oakfield.id,
      chainName: oakfield.name,
      chainSnapshot: oakfield,
      currentLevelNumber: 1,
      status: "awaiting_approval",
      decisions: [],
      startedAt: t,
    },
  ];

  return { chains, instances };
}

// ---------- Store plumbing ----------

const STORAGE_KEY = "logup.carePlanApprovalChains.v2";

function loadInitial(): State {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch { /* ignore */ }
  return seed();
}

let state: State = loadInitial();
const listeners = new Set<() => void>();

function persist() {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}
function emit() { persist(); listeners.forEach((l) => l()); }
function subscribe(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

// ---------- Selectors ----------

/**
 * Find the active chain that best matches a person's site / unit.
 * Matching priority: unit > house > site > organisation.
 */
export function findChainForPerson(
  chains: CarePlanApprovalChain[],
  person: { site: string; unit?: string },
): CarePlanApprovalChain | undefined {
  const active = chains.filter((c) => c.status === "active");
  return (
    active.find((c) => c.scopeType === "unit" && person.unit && c.scopeId === person.unit) ||
    active.find((c) => c.scopeType === "house" && person.unit && c.scopeId === person.unit) ||
    active.find((c) => c.scopeType === "site" && c.scopeId === person.site) ||
    active.find((c) => c.scopeType === "organisation")
  );
}

// ---------- Actions ----------

export const carePlanApprovalChainsStore = {
  getState: (): State => state,
  subscribe,
  reset() { state = seed(); emit(); },

  // ----- Chains CRUD -----
  createChain(input: Omit<CarePlanApprovalChain, "id" | "createdAt" | "updatedAt" | "levels"> & { levels?: ApprovalLevel[] }): CarePlanApprovalChain {
    const chain: CarePlanApprovalChain = {
      ...input,
      id: uid("CHAIN"),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      levels: input.levels ?? [],
    };
    state = { ...state, chains: [...state.chains, chain] };
    emit();
    return chain;
  },

  updateChain(id: string, patch: Partial<Omit<CarePlanApprovalChain, "id" | "createdAt">>) {
    state = {
      ...state,
      chains: state.chains.map((c) => c.id === id ? { ...c, ...patch, updatedAt: nowIso() } : c),
    };
    emit();
  },

  deleteChain(id: string) {
    state = { ...state, chains: state.chains.filter((c) => c.id !== id) };
    emit();
  },

  setChainStatus(id: string, status: ApprovalChainStatus) {
    this.updateChain(id, { status });
  },

  // ----- Level / approver helpers (used by the editor) -----
  addLevel(chainId: string, levelName: string, rule: ApprovalLevelRule = "any_one") {
    const chain = state.chains.find((c) => c.id === chainId);
    if (!chain) return;
    const nextNumber = (chain.levels[chain.levels.length - 1]?.levelNumber ?? 0) + 1;
    const level: ApprovalLevel = {
      id: uid("LVL"), levelNumber: nextNumber, levelName, rule, approvers: [],
    };
    this.updateChain(chainId, { levels: [...chain.levels, level] });
  },
  removeLevel(chainId: string, levelId: string) {
    const chain = state.chains.find((c) => c.id === chainId);
    if (!chain) return;
    const levels = chain.levels
      .filter((l) => l.id !== levelId)
      .map((l, i) => ({ ...l, levelNumber: i + 1 }));
    this.updateChain(chainId, { levels });
  },
  updateLevel(chainId: string, levelId: string, patch: Partial<Omit<ApprovalLevel, "id" | "levelNumber">>) {
    const chain = state.chains.find((c) => c.id === chainId);
    if (!chain) return;
    const levels = chain.levels.map((l) => l.id === levelId ? { ...l, ...patch } : l);
    this.updateChain(chainId, { levels });
  },
  addApprover(chainId: string, levelId: string, approver: Omit<ApprovalPerson, "id">) {
    const chain = state.chains.find((c) => c.id === chainId);
    if (!chain) return;
    const levels = chain.levels.map((l) => l.id === levelId
      ? { ...l, approvers: [...l.approvers, { id: uid("AP"), ...approver }] }
      : l);
    this.updateChain(chainId, { levels });
  },
  removeApprover(chainId: string, levelId: string, approverId: string) {
    const chain = state.chains.find((c) => c.id === chainId);
    if (!chain) return;
    const levels = chain.levels.map((l) => l.id === levelId
      ? { ...l, approvers: l.approvers.filter((a) => a.id !== approverId) }
      : l);
    this.updateChain(chainId, { levels });
  },

  // ----- Approval instances -----

  getInstanceForVersion(versionId: string): CarePlanApprovalInstance | undefined {
    return state.instances.find((i) => i.carePlanId === versionId);
  },

  /**
   * Start (or reuse) an approval instance for a care plan draft.
   * Returns undefined if no chain is configured for the person's scope.
   */
  startApprovalForDraft(input: {
    personId: string;
    versionId: string;
    versionNumber: number;
    person: { site: string; unit?: string };
  }): CarePlanApprovalInstance | undefined {
    const existing = state.instances.find((i) => i.carePlanId === input.versionId);
    if (existing) return existing;
    const chain = findChainForPerson(state.chains, input.person);
    if (!chain) return undefined;
    const instance: CarePlanApprovalInstance = {
      id: uid("APP"),
      carePlanId: input.versionId,
      personId: input.personId,
      carePlanVersion: input.versionNumber,
      chainId: chain.id,
      chainName: chain.name,
      chainSnapshot: chain,
      currentLevelNumber: 1,
      status: "awaiting_approval",
      decisions: [],
      startedAt: nowIso(),
    };
    state = { ...state, instances: [...state.instances, instance] };
    emit();
    return instance;
  },

  /** Record an approval decision at the current level and progress if satisfied. */
  approve(instanceId: string, approver: { name: string; email: string }, note?: string): CarePlanApprovalInstance | undefined {
    const inst = state.instances.find((i) => i.id === instanceId);
    if (!inst || inst.status !== "awaiting_approval") return inst;
    const level = inst.chainSnapshot.levels.find((l) => l.levelNumber === inst.currentLevelNumber);
    if (!level) return inst;
    // Prevent duplicate approvals from same email at same level
    if (inst.decisions.some((d) => d.levelId === level.id && d.approverEmail.toLowerCase() === approver.email.toLowerCase() && d.decision === "approved")) {
      return inst;
    }
    const decision: CarePlanApprovalDecision = {
      id: uid("DEC"),
      levelId: level.id,
      levelNumber: level.levelNumber,
      approverName: approver.name,
      approverEmail: approver.email,
      decision: "approved",
      note,
      decidedAt: nowIso(),
    };
    const levelDecisions = [...inst.decisions.filter((d) => d.levelId === level.id && d.decision === "approved"), decision];
    const levelSatisfied = level.rule === "any_one"
      ? levelDecisions.length >= 1
      : levelDecisions.length >= level.approvers.length;
    const isLastLevel = level.levelNumber === inst.chainSnapshot.levels.length;
    const updated: CarePlanApprovalInstance = {
      ...inst,
      decisions: [...inst.decisions, decision],
      currentLevelNumber: levelSatisfied && !isLastLevel ? inst.currentLevelNumber + 1 : inst.currentLevelNumber,
      status: levelSatisfied && isLastLevel ? "approved" : "awaiting_approval",
      completedAt: levelSatisfied && isLastLevel ? nowIso() : inst.completedAt,
    };
    state = { ...state, instances: state.instances.map((i) => i.id === instanceId ? updated : i) };
    emit();
    return updated;
  },

  reject(instanceId: string, approver: { name: string; email: string }, note?: string): CarePlanApprovalInstance | undefined {
    const inst = state.instances.find((i) => i.id === instanceId);
    if (!inst) return inst;
    const level = inst.chainSnapshot.levels.find((l) => l.levelNumber === inst.currentLevelNumber);
    const decision: CarePlanApprovalDecision = {
      id: uid("DEC"),
      levelId: level?.id ?? "",
      levelNumber: level?.levelNumber ?? 0,
      approverName: approver.name,
      approverEmail: approver.email,
      decision: "rejected",
      note,
      decidedAt: nowIso(),
    };
    const updated: CarePlanApprovalInstance = {
      ...inst, decisions: [...inst.decisions, decision], status: "rejected", completedAt: nowIso(),
    };
    state = { ...state, instances: state.instances.map((i) => i.id === instanceId ? updated : i) };
    emit();
    return updated;
  },

  /** Admin override — completes the instance with a mandatory reason. */
  adminOverride(instanceId: string, admin: { name: string; email: string }, reason: string): CarePlanApprovalInstance | undefined {
    const inst = state.instances.find((i) => i.id === instanceId);
    if (!inst) return inst;
    const decision: CarePlanApprovalDecision = {
      id: uid("DEC"),
      levelId: "override",
      levelNumber: inst.currentLevelNumber,
      approverName: admin.name,
      approverEmail: admin.email,
      decision: "override",
      note: reason,
      decidedAt: nowIso(),
    };
    const updated: CarePlanApprovalInstance = {
      ...inst, decisions: [...inst.decisions, decision], status: "approved", completedAt: nowIso(),
    };
    state = { ...state, instances: state.instances.map((i) => i.id === instanceId ? updated : i) };
    emit();
    return updated;
  },

  cancelInstance(instanceId: string) {
    state = {
      ...state,
      instances: state.instances.map((i) => i.id === instanceId ? { ...i, status: "cancelled", completedAt: nowIso() } : i),
    };
    emit();
  },
};

// ---------- Hooks ----------

export function useCarePlanApprovalChains(): State {
  return useSyncExternalStore(subscribe, carePlanApprovalChainsStore.getState, carePlanApprovalChainsStore.getState);
}

// ---------- Permission helpers ----------

export function canManageApprovalChains(role: Role): boolean {
  return role === "admin";
}

/**
 * True if the person (identified by name/email) is a listed approver at the
 * current level and therefore may cast an approve/reject decision.
 */
export function canDecideAtCurrentLevel(
  instance: CarePlanApprovalInstance,
  staffId: string | undefined,
): boolean {
  if (!staffId) return false;
  const level = instance.chainSnapshot.levels.find((l) => l.levelNumber === instance.currentLevelNumber);
  if (!level) return false;
  return level.approvers.some((a) => a.staffId === staffId);
}

export function currentLevel(instance: CarePlanApprovalInstance): ApprovalLevel | undefined {
  return instance.chainSnapshot.levels.find((l) => l.levelNumber === instance.currentLevelNumber);
}

export function pendingApproversAtLevel(instance: CarePlanApprovalInstance): ApprovalPerson[] {
  const level = currentLevel(instance);
  if (!level) return [];
  if (level.rule === "any_one") return level.approvers;
  const alreadyApproved = new Set(
    instance.decisions
      .filter((d) => d.levelId === level.id && d.decision === "approved")
      .map((d) => d.approverEmail.toLowerCase())
  );
  return level.approvers.filter((a) => !alreadyApproved.has(a.email.toLowerCase()));
}

export function ruleLabel(r: ApprovalLevelRule): string {
  return r === "any_one" ? "Any one approver can approve" : "All approvers required";
}

export function instanceStatusLabel(s: CarePlanApprovalInstanceStatus): string {
  switch (s) {
    case "not_started": return "Not started";
    case "awaiting_approval": return "Awaiting approval";
    case "approved": return "Approved";
    case "rejected": return "Rejected";
    case "cancelled": return "Cancelled";
  }
}
