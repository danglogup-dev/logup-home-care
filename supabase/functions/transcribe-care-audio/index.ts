import { authenticate, boundedBody, corsHeaders, json, preserveBlock } from "../_shared/note-auth.ts";
import { transcribe } from "../_shared/transcribe.ts";
import { getLovableAiGatewayResponseHeaders } from "../_shared/run-id.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ message: "Use POST." }, 405);
  try {
    const auth = await authenticate(req); if (!auth) return json({ message: "Sign in to transcribe audio." }, 401);
    const { data: block } = await auth.db.from("ai_access_blocks").select("status,message").eq("endpoint", "transcription").maybeSingle();
    if (block) return json({ message: block.message }, block.status);
    const apiKey = Deno.env.get("LOVABLE_API_KEY"); if (!apiKey) return json({ message: "AI is not configured." }, 401);
    const blob = await boundedBody(req, 12 * 1024 * 1024);
    const form = await new Request(req.url, { method: "POST", headers: { "Content-Type": req.headers.get("Content-Type") ?? "" }, body: blob }).formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.type !== "audio/wav" || file.size < 2048) return json({ message: "Record a complete WAV audio clip." }, 400);
    const wav = new DataView(await file.arrayBuffer());
    const text = (offset: number, length: number) => Array.from({ length }, (_, i) => String.fromCharCode(wav.getUint8(offset + i))).join("");
    if (text(0, 4) !== "RIFF" || text(8, 4) !== "WAVE" || text(36, 4) !== "data" || wav.getUint16(20, true) !== 1 || wav.getUint16(22, true) !== 1 || wav.getUint16(34, true) !== 16) return json({ message: "Invalid WAV recording." }, 400);
    const rate = wav.getUint32(24, true); const bytes = wav.getUint32(40, true);
    if (!rate || bytes + 44 !== file.size || bytes / (rate * 2) > 90.01) return json({ message: "Record up to 90 seconds of audio." }, 400);
    const response = await transcribe({ baseURL: "https://ai.gateway.lovable.dev", apiKey, model: "openai/gpt-transcribe", maxFileBytes: 12 * 1024 * 1024, audioOnly: true }, file, { signal: req.signal });
    await preserveBlock(auth.db, "transcription", response);
    return new Response(response.body, { status: response.status, headers: getLovableAiGatewayResponseHeaders(response.headers, { ...corsHeaders, "Content-Type": response.headers.get("Content-Type") ?? "text/event-stream" }) });
  } catch (e) { return json({ message: e instanceof Error ? e.message : "Transcription failed." }, req.signal.aborted ? 499 : 400); }
});