// In-memory store for audit walkthrough results and PIC sign-off queue.
// Prototype-only: persists for the session, not across reloads.

import { useSyncExternalStore } from "react";

export type ItemOutcome = "pass" | "fail" | "na" | "pending";
export type Severity = "Low" | "Medium" | "High";

export interface WalkthroughItem {
  item: string;
  outcome: ItemOutcome;
  note?: string;
  // Inline data-URL photos captured during the walkthrough
  photos: string[];
  // For Fail: severity and finding description
  severity?: Severity;
  findingDescription?: string;
  // Optional follow-up action set during walkthrough
  actionDescription?: string;
  actionOwner?: string;
  actionDue?: string;
  // For N/A: short reason
  naReason?: string;
}

export type WalkthroughStatus = "in_progress" | "awaiting_signoff" | "signed_off";

export interface WalkthroughRun {
  id: string;            // matches AuditRecord id (e.g. AUD-001)
  templateName: string;
  site: string;
  category: string;
  conductedBy: string;
  pic: string;
  startedAt: string;
  completedAt?: string;
  signedOffAt?: string;
  signedOffBy?: string;
  picSignedOffAt?: string;
  picSignedOffBy?: string;
  status: WalkthroughStatus;
  items: WalkthroughItem[];
}

let runs: Record<string, WalkthroughRun> = {};
let runsList: WalkthroughRun[] = [];
const listeners = new Set<() => void>();
const emit = () => {
  runsList = Object.values(runs);
  listeners.forEach((l) => l());
};

export const auditsStore = {
  get(id: string): WalkthroughRun | undefined {
    return runs[id];
  },
  all(): WalkthroughRun[] {
    return runsList;
  },
  startOrResume(input: {
    id: string;
    templateName: string;
    site: string;
    category: string;
    conductedBy: string;
    pic: string;
    items: string[];
  }): WalkthroughRun {
    const existing = runs[input.id];
    if (existing && existing.status !== "signed_off") return existing;
    const run: WalkthroughRun = {
      id: input.id,
      templateName: input.templateName,
      site: input.site,
      category: input.category,
      conductedBy: input.conductedBy,
      pic: input.pic,
      startedAt: new Date().toISOString(),
      status: "in_progress",
      items: input.items.map((it) => ({ item: it, outcome: "pending", photos: [] })),
    };
    runs = { ...runs, [input.id]: run };
    emit();
    return run;
  },
  updateItem(id: string, index: number, patch: Partial<WalkthroughItem>): void {
    const run = runs[id];
    if (!run) return;
    const items = run.items.slice();
    items[index] = { ...items[index], ...patch };
    runs = { ...runs, [id]: { ...run, items } };
    emit();
  },
  submitForSignoff(id: string, signedOffBy: string): WalkthroughRun | undefined {
    const run = runs[id];
    if (!run) return undefined;
    const updated: WalkthroughRun = {
      ...run,
      status: "awaiting_signoff",
      completedAt: new Date().toISOString(),
      signedOffAt: new Date().toISOString(),
      signedOffBy,
    };
    runs = { ...runs, [id]: updated };
    emit();
    return updated;
  },
  picSignOff(id: string, picName: string): WalkthroughRun | undefined {
    const run = runs[id];
    if (!run) return undefined;
    const updated: WalkthroughRun = {
      ...run,
      status: "signed_off",
      picSignedOffAt: new Date().toISOString(),
      picSignedOffBy: picName,
    };
    runs = { ...runs, [id]: updated };
    emit();
    return updated;
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useAuditRun(id: string | undefined): WalkthroughRun | undefined {
  return useSyncExternalStore(
    (cb) => auditsStore.subscribe(cb),
    () => (id ? auditsStore.get(id) : undefined),
    () => (id ? auditsStore.get(id) : undefined),
  );
}

export function useAllAuditRuns(): WalkthroughRun[] {
  return useSyncExternalStore(
    (cb) => auditsStore.subscribe(cb),
    () => auditsStore.all(),
    () => auditsStore.all(),
  );
}

/** Demo "logged-in" user for the Audits module. */
export const CURRENT_AUDIT_USER = {
  name: "Siobhán Kelly",
  role: "Person in Charge",
  onShiftSites: ["Oakfield Manor"],
};

export const progressOf = (r: WalkthroughRun) => {
  const done = r.items.filter((i) => i.outcome !== "pending").length;
  return { done, total: r.items.length, pct: r.items.length ? Math.round((done / r.items.length) * 100) : 0 };
};
