// Daily family summaries. AI drafts are stored as "pending" and are never shown
// to family until a coordinator (manager-level, in scope) approves them by staffId.
import { useSyncExternalStore } from "react";
import type { StaffId } from "./demoDataRegistry";
import { canCoordinateVisit, type RoleState } from "./roleStore";
import { serviceUsersStore } from "./serviceUsersStore";
import { visitsStore, type Visit } from "./visitsStore";
import { careFunction } from "./careNoteAi";

export type FamilySummaryStatus = "pending" | "approved" | "rejected";
export interface FamilySummary {
  id: string;
  clientId: string;
  date: string; // YYYY-MM-DD
  aiDraft: string[]; // never rewritten
  sourceVisitIds: string[];
  notedVisitIds: string[];
  draftedByStaffId: StaffId;
  draftedAt: string;
  status: FamilySummaryStatus;
  decidedByStaffId?: StaffId;
  decidedAt?: string;
}

let items: FamilySummary[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const pad = (n: number) => String(n).padStart(2, "0");
export const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function visitsForDay(clientId: string, date: string): Visit[] {
  return visitsStore.visitsForClient(clientId as Visit["clientId"])
    .filter((v) => localDate(new Date(v.scheduledStart)) === date && v.status !== "cancelled")
    .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
}

function assertCoordinator(clientId: string, role: RoleState) {
  const client = serviceUsersStore.getById(clientId);
  if (!client || !canCoordinateVisit(client.siteId, role)) throw new Error("Only a coordinator for this service area can do this.");
}

export const familySummariesStore = {
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  getState: () => items,
  latestFor: (clientId: string, date: string) => items.filter((s) => s.clientId === clientId && s.date === date).at(-1),
  /** Only approved summaries are ever exposed to family. */
  approvedFor: (clientId: string) => items.filter((s) => s.clientId === clientId && s.status === "approved").sort((a, b) => b.date.localeCompare(a.date)),
  async draft(clientId: string, date: string, role: RoleState) {
    assertCoordinator(clientId, role);
    const templates = visitsStore.getState().templates;
    const visits = visitsForDay(clientId, date);
    if (!visits.length) throw new Error("No visits on this day to summarise.");
    const body = {
      clientId, date,
      visits: visits.map((v) => ({
        id: v.id, callType: templates.find((t) => t.id === v.templateId)?.callType ?? "call",
        scheduledStart: v.scheduledStart, scheduledEnd: v.scheduledEnd, checkInAt: v.checkInAt ?? null, checkOutAt: v.checkOutAt ?? null, status: v.status,
        tasks: (v.log?.tasks ?? v.taskRecords ?? []).map((t) => ({ task: t.task, outcome: t.outcome })),
      })),
    };
    const response = await careFunction("family-daily-summary", JSON.stringify(body), "application/json");
    const data = await response.json() as { lines: string[]; notedVisitIds: string[] };
    const summary: FamilySummary = { id: crypto.randomUUID(), clientId, date, aiDraft: [...data.lines], sourceVisitIds: visits.map((v) => v.id), notedVisitIds: data.notedVisitIds ?? [], draftedByStaffId: role.staffId, draftedAt: new Date().toISOString(), status: "pending" };
    items = [...items, summary]; emit();
    return summary;
  },
  decide(id: string, decision: "approved" | "rejected", role: RoleState) {
    const s = items.find((x) => x.id === id);
    if (!s || s.status !== "pending") throw new Error("This summary has already been decided.");
    assertCoordinator(s.clientId, role);
    items = items.map((x) => x.id === id ? { ...x, status: decision, decidedByStaffId: role.staffId, decidedAt: new Date().toISOString() } : x);
    emit();
  },
};

export const useFamilySummaries = () => useSyncExternalStore(familySummariesStore.subscribe, familySummariesStore.getState, familySummariesStore.getState);
