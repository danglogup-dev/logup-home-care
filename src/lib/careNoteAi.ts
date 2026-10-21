import { createParser } from "eventsource-parser";
import { supabase } from "@/integrations/supabase/client";
import type { StructuredVisitNote } from "./visitNoteRules";
export async function careFunction(name: string, body: BodyInit, contentType?: string) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Sign in to use voice and save notes.");
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, { method: "POST", headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, ...(contentType ? { "Content-Type": contentType } : {}) }, body });
  if (!response.ok) {
    const text = await response.text(); let message = text;
    try { const error = JSON.parse(text); message = error.message ?? error.error?.message ?? text; } catch { /* preserve safe response */ }
    throw new Error(message || `Request failed (${response.status}).`);
  }
  return response;
}
export async function events(response: Response, receive: (data: Record<string, any>) => void) {
  const reader = response.body?.getReader(); if (!reader) throw new Error("No response received.");
  const parser = createParser({ onEvent(event) { if (event.data !== "[DONE]") receive(JSON.parse(event.data)); } });
  const decoder = new TextDecoder();
  try { while (true) { const { done, value } = await reader.read(); if (done) break; parser.feed(decoder.decode(value, { stream: true })); } parser.feed(decoder.decode()); } finally { reader.releaseLock(); }
}
export async function transcribeCareAudio(file: File) {
  const form = new FormData(); form.append("file", file);
  const response = await careFunction("transcribe-care-audio", form);
  let transcript = ""; let complete = false;
  await events(response, (data) => {
    if (data.type === "transcript.text.delta") transcript += data.delta;
    if (data.type === "transcript.text.done") { transcript = data.text; complete = true; }
    if (data.type === "error" || data.error) throw new Error(data.message ?? data.error?.message ?? "Transcription failed.");
  });
  if (!complete || !transcript.trim()) throw new Error("No complete transcript returned. Record again or type your note.");
  return transcript;
}
export async function draftVisitNote(input: { visitId: string; clientId: string; transcript: string; sourceKind: "voice" | "text" }) {
  const response = await careFunction("draft-visit-note", JSON.stringify(input), "application/json");
  let result: { draftId: string; note: StructuredVisitNote } | undefined;
  await events(response, (data) => { if (data.type === "error") throw new Error(data.message); if (data.type === "note.done") result = { draftId: data.draftId, note: data.note }; });
  if (!result) throw new Error("No complete note draft returned.");
  return result;
}export async function askPolicyHelp(question: string, sources: { sourceId: string; title: string; versionNumber: string; section: string; text: string }[]) {
  const response = await careFunction("policy-help", JSON.stringify({ question, sources }), "application/json");
  if ((response.headers.get("Content-Type") ?? "").includes("application/json")) return { found: false, primarySourceId: "", steps: [], alsoRelevantSourceIds: [], possibleConflict: false };
  let result: { found: boolean; primarySourceId: string; steps: { text: string; sourceId: string }[]; alsoRelevantSourceIds: string[]; possibleConflict: boolean } | undefined;
  await events(response, (data) => { if (data.type === "error") throw new Error(data.message); if (data.type === "help.done") result = data.result; });
  if (!result) throw new Error("Policy Help did not return an answer.");
  return result;
}
