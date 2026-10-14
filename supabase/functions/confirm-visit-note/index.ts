import { authenticate, boundedBody, corsHeaders, json } from "../_shared/note-auth.ts";
import { sectionKeys, validNote } from "../_shared/note-schema.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ message: "Use POST." }, 405);
  try {
    const auth = await authenticate(req); if (!auth) return json({ message: "Sign in to confirm a note." }, 401);
    const body = JSON.parse(await (await boundedBody(req, 64000)).text());
    if (body.confirmed !== true || !validNote(body.finalText) || !/^STAFF-[\w-]+$/.test(body.staffId) || typeof body.draftId !== "string") return json({ message: "Confirm all sections before saving." }, 400);
    const { data: draft, error } = await auth.db.from("visit_note_drafts").select("*").eq("id", body.draftId).eq("user_id", auth.userId).single();
    if (error || !draft) return json({ message: "Note draft unavailable." }, 404);
    const { data: existing } = await auth.db.from("visit_notes").select("*").eq("draft_id", draft.id).eq("user_id", auth.userId).maybeSingle();
    if (existing) return json({ note: existing });
    const confirmedAt = new Date().toISOString();
    const provenance = [{ key: "transcript", label: "Source", origin: "source", originalValue: draft.transcript, value: draft.transcript, state: "source" }, ...sectionKeys.map((key) => ({ key, label: key, origin: "ai_draft", originalValue: draft.ai_draft[key], value: body.finalText[key], state: "human_confirmed", edited: draft.ai_draft[key] !== body.finalText[key], confirmedByStaffId: body.staffId, confirmedAt }))];
    const { data: note, error: saveError } = await auth.db.from("visit_notes").insert({ user_id: auth.userId, draft_id: draft.id, visit_id: draft.visit_id, client_id: draft.client_id, transcript: draft.transcript, ai_draft: draft.ai_draft, final_text: body.finalText, source_kind: draft.source_kind, confirmed_by_staff_id: body.staffId, confirmed_at: confirmedAt, provenance }).select("*").single();
    if (saveError) return json({ message: "Could not save the confirmed note." }, 500);
    return json({ note });
  } catch (e) { return json({ message: e instanceof Error ? e.message : "Could not save note." }, 400); }
});