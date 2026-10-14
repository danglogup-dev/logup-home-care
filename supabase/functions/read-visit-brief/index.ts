import { authenticate, boundedBody, corsHeaders, json, preserveBlock } from "../_shared/note-auth.ts";
import { requestSpeech } from "./speech-request.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ message: "Use POST." }, 405);
  try {
    const auth = await authenticate(req); if (!auth) return json({ message: "Sign in to read the summary aloud." }, 401);
    const { data: block } = await auth.db.from("ai_access_blocks").select("status,message").eq("endpoint", "visit-brief-speech").maybeSingle();
    if (block) return json({ message: block.message }, block.status);
    const body = JSON.parse(await (await boundedBody(req, 16000)).text());
    if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 4000) return json({ message: "Provide a short visit summary." }, 400);
    const key = Deno.env.get("LOVABLE_API_KEY"); if (!key) return json({ message: "Speech is not configured." }, 401);
    const response = await requestSpeech({ baseURL: "https://ai.gateway.lovable.dev", apiKey: key, model: "google/gemini-3.1-flash-tts-preview", format: "gemini", voice: "Kore" }, body.text);
    await preserveBlock(auth.db, "visit-brief-speech", response);
    if (response.status === 402) { const data = await response.clone().json().catch(() => ({})); await auth.db.from("ai_access_blocks").upsert({ endpoint: "visit-brief-speech", status: 402, message: data.message ?? "AI credits are insufficient. Ask the workspace owner to restore credits." }); }
    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", response.headers.get("Content-Type") ?? "text/event-stream"); headers.set("Cache-Control", "no-cache");
    response.headers.forEach((v, k) => { if (k.toLowerCase().startsWith("x-lovable-aig-")) headers.set(k, v); });
    return new Response(response.body, { status: response.status, headers });
  } catch (e) { return json({ message: e instanceof Error ? e.message : "Speech failed." }, 400); }
});