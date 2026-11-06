import { supabase } from "@/integrations/supabase/client";
const RETURN_KEY = "logup.auth.returnTo";
export function safeReturnPath(path: string | null): string {
  return path && /^\/app(?:\/|$)/.test(path) && !path.includes("\\") && !path.includes("//") ? path : "/app";
}
export function rememberSignInReturn(path: string) { sessionStorage.setItem(RETURN_KEY, safeReturnPath(path)); }
export function signInReturnPath() {
  const path = safeReturnPath(sessionStorage.getItem(RETURN_KEY));
  sessionStorage.removeItem(RETURN_KEY);
  return path;
}
export async function signInToLogUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.session) throw new Error("Sign-in did not complete. Please try again.");
}
export async function signOutOfLogUp() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}