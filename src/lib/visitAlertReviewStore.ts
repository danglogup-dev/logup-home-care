/**
 * Manager reviews of Live visits alerts — append-only, keyed by visit ID.
 * A review never changes the visit, its status or attendance record.
 * Fictional demo: in memory, resets on reload.
 */
import { useSyncExternalStore } from "react";
import { createTask, getTasks, type TaskRecord } from "./tasksStore";

export type DeliveryAssessment = "not_confirmed" | "delivered_discrepancy" | "missed";
export type AlertReviewKind = "acknowledged" | "investigation_note" | "confirmed_missed" | "assessment";
export interface AlertReview { id: string; visitId: string; alertId: string; kind: AlertReviewKind; note: string; byStaffId: string; at: string; assessment?: DeliveryAssessment; evidenceBasis?: string; findingsId?: string }
export const ASSESSMENT_LABELS: Record<DeliveryAssessment, string> = { not_confirmed: "Not yet confirmed", delivered_discrepancy: "Confirmed delivered, with attendance discrepancy", missed: "Confirmed missed" };

let reviews: AlertReview[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const visitAlertReviewStore = {
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  getState: () => reviews,
  add(input: Omit<AlertReview, "id" | "at">) {
    if (!input.byStaffId.trim()) throw new Error("A named manager is required.");
    if (input.kind !== "acknowledged" && !input.note.trim()) throw new Error("Write a note first.");
    if ((input.kind === "confirmed_missed" || (input.kind === "assessment" && input.assessment !== "not_confirmed")) && !input.evidenceBasis?.trim()) throw new Error("Record the evidence basis before confirming delivery or a missed visit.");
    const r: AlertReview = { ...input, note: input.note.trim(), id: `rev-${Date.now()}-${reviews.length}`, at: new Date().toISOString() };
    reviews = [...reviews, r]; emit(); return r;
  },
  saveReview(input: { visitId: string; alertId: string; byStaffId: string; note: string; assessment: DeliveryAssessment; evidenceBasis: string }) {
    if (!input.byStaffId.trim() || !input.note.trim()) throw new Error("Record factual review findings before saving.");
    if (input.assessment !== "not_confirmed" && !input.evidenceBasis.trim()) throw new Error("Record the evidence basis before confirming delivery or a missed visit.");
    const at = new Date().toISOString();
    const findings: AlertReview = { visitId: input.visitId, alertId: input.alertId, byStaffId: input.byStaffId, note: input.note.trim(), at, id: `rev-${Date.now()}-${reviews.length}`, kind: "investigation_note" };
    const assessment: AlertReview = { ...findings, id: `${findings.id}-assessment`, kind: "assessment", note: "", assessment: input.assessment, evidenceBasis: input.evidenceBasis.trim(), findingsId: findings.id };
    reviews = [...reviews, findings, assessment]; emit(); return assessment;
  },
  reset() { reviews = []; emit(); },
};

export const useAlertReviews = () => useSyncExternalStore(visitAlertReviewStore.subscribe, visitAlertReviewStore.getState, visitAlertReviewStore.getState);

export const reviewsForVisit = (all: readonly AlertReview[], visitId: string) => all.filter((r) => r.visitId === visitId);

export const tasksForVisit = (tasks: readonly TaskRecord[], visitId: string) => tasks.filter((t) => t.sourceRef === visitId || t.visitReviewLinks?.visitId === visitId || t.medicationLinks?.visitId === visitId);
const actionKey = (title: string) => title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function createVisitFollowUp(input: Omit<TaskRecord, "id" | "status" | "activity" | "createdAt" | "visitReviewLinks"> & { visitReviewLinks: Omit<NonNullable<TaskRecord["visitReviewLinks"]>, "actionKey"> }) {
  if (!input.title.trim() || !input.description?.trim() || !input.assigneeId || !Number.isFinite(new Date(input.dueAt).getTime())) throw new Error("Complete the title, responsible person, due date and action instructions.");
  const links = input.visitReviewLinks;
  if (!reviews.some((r) => r.id === links.reviewId && r.visitId === links.visitId && r.alertId === links.alertId && r.kind === "assessment")) throw new Error("Save the manager review before creating its follow-up.");
  const key = actionKey(input.title);
  const duplicate = tasksForVisit(getTasks(), links.visitId).find((t) => (t.status === "open" || t.status === "in_progress") && (t.visitReviewLinks?.actionKey === key || actionKey(t.title) === key));
  if (duplicate) throw new Error(`This action already has an open follow-up: ${duplicate.title}`);
  return createTask({ ...input, title: input.title.trim(), visitReviewLinks: { ...links, actionKey: key } });
}
