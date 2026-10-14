import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
export { corsHeaders };
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
export async function authenticate(req: Request) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key || !serviceKey) throw new Error("Cloud configuration is unavailable.");
  const authorization = req.headers.get("Authorization") ?? "";
  const client = createClient(url, key, { global: { headers: { Authorization: authorization } } });
  const { data, error } = await client.auth.getUser(authorization.replace(/^Bearer\s+/i, ""));
  if (error || !data.user) return null;
  return { userId: data.user.id, db: createClient(url, serviceKey) };
}
export async function boundedBody(req: Request, limit: number) {
  if (Number(req.headers.get("Content-Length") ?? 0) > limit) throw new Error("Input is too large.");
  const reader = req.body?.getReader();
  if (!reader) throw new Error("Input is empty.");
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > limit) { await reader.cancel(); throw new Error("Input is too large."); } chunks.push(value); }
  return new Blob(chunks);
}
export async function preserveBlock(db: ReturnType<typeof createClient>, endpoint: string, response: Response) {
  if (response.status !== 403) return;
  const data = await response.clone().json().catch(() => ({}));
  const message = data.message ?? data.error?.message ?? "AI access is denied. Ask the workspace administrator to restore access.";
  const { error } = await db.from("ai_access_blocks").upsert({ endpoint, status: response.status, message });
  if (error) throw new Error("Could not record the AI access restriction.");
}