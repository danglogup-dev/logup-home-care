import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { careFunction } from "./careNoteAi";
import { accessibleVisit } from "./visitActions";
import type { RoleState } from "./roleStore";
import type { FieldProvenance } from "./incidentsStore";
import type { StructuredVisitNote } from "./visitNoteRules";
export interface VisitNote { id: string; visit_id: string; client_id: string; transcript: string; ai_draft: StructuredVisitNote; final_text: StructuredVisitNote; confirmed_by_staff_id: string; confirmed_at: string; provenance: FieldProvenance[] }
let notes: VisitNote[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
export const visitNotesStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  getState: () => notes,
  async load(visitId: string, role: RoleState) {
    if (!accessibleVisit(visitId, role)) throw new Error("Visit unavailable.");
    const { data, error } = await supabase.from("visit_notes").select("*").eq("visit_id", visitId).order("confirmed_at");
    if (error) throw new Error(error.message);
    notes = [...notes.filter((note) => note.visit_id !== visitId), ...(data as unknown as VisitNote[])]; emit();
  },
  async confirm(visitId: string, draftId: string, finalText: StructuredVisitNote, confirmed: boolean, role: RoleState) {
    const visit = accessibleVisit(visitId, role);
    if (!confirmed || !visit || visit.status !== "in_progress") throw new Error("Confirm the note for your checked-in visit before saving.");
    const response = await careFunction("confirm-visit-note", JSON.stringify({ draftId, finalText, staffId: role.staffId, confirmed: true }), "application/json");
    const { note } = await response.json() as { note: VisitNote };
    if (note.visit_id !== visitId || note.client_id !== visit.clientId) throw new Error("The note does not match this visit.");
    notes = [...notes.filter((item) => item.id !== note.id), note]; emit(); return note;
  },
};
supabase.auth.onAuthStateChange((_event, session) => { if (!session) { notes = []; emit(); } });
export const useVisitNotes = () => useSyncExternalStore(visitNotesStore.subscribe, visitNotesStore.getState, visitNotesStore.getState);