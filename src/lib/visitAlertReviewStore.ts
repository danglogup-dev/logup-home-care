/**
 * Manager reviews of Live visits alerts — append-only, keyed by visit ID.
 * A review never changes the visit, its status or attendance record.
 * Fictional demo: in memory, resets on reload.
 */
import { useSyncExternalStore } from "react";

export type AlertReviewKind = "acknowledged" | "investigation_note" | "confirmed_missed";
export interface AlertReview { id: string; visitId: string; alertId: string; kind: AlertReviewKind; note: string; byStaffId: string; at: string }

let reviews: AlertReview[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const visitAlertReviewStore = {
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  getState: () => reviews,
  add(input: Omit<AlertReview, "id" | "at">) {
    if (input.kind !== "acknowledged" && !input.note.trim()) throw new Error("Write a note first.");
    const r: AlertReview = { ...input, note: input.note.trim(), id: `rev-${Date.now()}-${reviews.length}`, at: new Date().toISOString() };
    reviews = [...reviews, r]; emit(); return r;
  },
  reset() { reviews = []; emit(); },
};

export const useAlertReviews = () => useSyncExternalStore(visitAlertReviewStore.subscribe, visitAlertReviewStore.getState, visitAlertReviewStore.getState);

export const reviewsForVisit = (all: readonly AlertReview[], visitId: string) => all.filter((r) => r.visitId === visitId);
