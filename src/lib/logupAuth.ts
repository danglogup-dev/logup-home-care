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
/** Plain-language sign-in errors; never hides the real reason. */
export function signInErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : "";
  if (/invalid login credentials/i.test(message)) return "That email and password don't match a LogUp account. If you have never been given a LogUp login, use Explore fictional demo instead.";
  if (/email not confirmed/i.test(message)) return "This account's email address hasn't been confirmed yet. Check your inbox for the confirmation link.";
  if (/unsupported provider|provider is not enabled/i.test(message)) return "This sign-in method isn't switched on for LogUp yet.";
  if (/failed to fetch|network/i.test(message)) return "LogUp couldn't be reached. Check your connection and try again.";
  return message || "Could not sign in to LogUp. Please try again.";
}
