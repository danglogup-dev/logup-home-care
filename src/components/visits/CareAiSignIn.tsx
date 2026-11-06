import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useLogUpSession } from "@/hooks/useLogUpSession";
import { rememberSignInReturn } from "@/lib/logupAuth";

/**
 * Shows AI features only to a signed-in LogUp account (the one shared session).
 * Never shows a second login form: in the fictional demo it explains what is
 * unavailable and links to the single LogUp sign-in page.
 */
export function CareAiSignIn({ children, title = "Voice and AI features" }: { children: ReactNode; title?: string }) {
  const { loading, session } = useLogUpSession(); const location = useLocation();
  if (loading) return null;
  if (session) return <>{children}</>;
  return <div className="space-y-2 rounded-md border border-dashed p-3 text-sm">
    <p className="font-semibold">{title}: not available in the fictional demo</p>
    <p className="text-muted-foreground">Live AI runs only for signed-in LogUp accounts, so demo visitors never use real services.{" "}
      <Link className="underline" to="/signin" onClick={() => rememberSignInReturn(location.pathname + location.search)}>Staff sign-in</Link></p>
  </div>;
}
