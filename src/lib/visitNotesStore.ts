import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { careFunction } from "./careNoteAi";
import { accessibleVisit } from "./visitActions";
import type { RoleState } from "./roleStore";
import type { FieldProvenance } from "./incidentsStore";
import type { StructuredVisitNote } from "./visitNoteRules";
export interface VisitNote { id: string; visit_id: string; client_id: string; transcript: string; ai_draft: StructuredVisitNote; final_text: StructuredVisitNote; confirmed_by_staff_id: string; confirmed_at: string; provenance: FieldProvenance[]; /** Fictional demo only: in memory, never sent to the backend. */ demo?: boolean }
let notes: VisitNote[] = [];
let demoNotes: VisitNote[] = [];
let merged: VisitNote[] = [];
const listeners = new Set<() => void>();
const emit = () => { merged = [...notes, ...demoNotes]; listeners.forEach((listener) => listener()); };
export const visitNotesStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  getState: () => merged,
  async loadClient(visitId: string, role: RoleState) {
    const visit = accessibleVisit(visitId, role);
    if (!visit) throw new Error("Visit unavailable.");
    const { data, error } = await supabase.from("visit_notes").select("*").eq("client_id", visit.clientId).order("confirmed_at", { ascending: false }).limit(3);
    if (error) throw new Error(error.message);
    notes = [...notes.filter((note) => note.client_id !== visit.clientId), ...(data as unknown as VisitNote[])]; emit();
  },
  /** All confirmed notes for a client, for the client record's Visit History; requires an accessible visit for that client. */
  async loadForClient(clientId: string, visitIds: string[], role: RoleState) {
    if (!visitIds.some((id) => accessibleVisit(id, role)?.clientId === clientId)) throw new Error("Client unavailable.");
    const { data, error } = await supabase.from("visit_notes").select("*").eq("client_id", clientId).order("confirmed_at", { ascending: false });
    if (error) throw new Error(error.message);
    notes = [...notes.filter((note) => note.client_id !== clientId), ...(data as unknown as VisitNote[])]; emit();
  },
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
  /** Fictional demo: keeps a human-confirmed simulated note in memory only. */
  confirmDemo(visitId: string, transcript: string, draft: StructuredVisitNote, finalText: StructuredVisitNote, role: RoleState) {
    const visit = accessibleVisit(visitId, role);
    if (!visit || visit.status !== "in_progress") throw new Error("Confirm the note for your checked-in visit before saving.");
    const at = new Date().toISOString();
    const provenance: FieldProvenance[] = (Object.keys(finalText) as (keyof StructuredVisitNote)[]).map((key) => ({ key, label: key, origin: "source", originalValue: draft[key], value: finalText[key], state: "human_confirmed", edited: draft[key] !== finalText[key], confirmedByStaffId: role.staffId, confirmedAt: at } as FieldProvenance));
    const note: VisitNote = { id: `DEMO-NOTE-${crypto.randomUUID()}`, visit_id: visitId, client_id: visit.clientId, transcript, ai_draft: draft, final_text: finalText, confirmed_by_staff_id: role.staffId, confirmed_at: at, provenance, demo: true };
    demoNotes = [...demoNotes, note]; emit(); return note;
  },
};
supabase.auth.onAuthStateChange((_event, session) => { if (!session) { notes = []; emit(); } });
export const useVisitNotes = () => useSyncExternalStore(visitNotesStore.subscribe, visitNotesStore.getState, visitNotesStore.getState);