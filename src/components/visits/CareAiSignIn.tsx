import type { ReactNode } from "react";
import { useLogUpSession } from "@/hooks/useLogUpSession";

/**
 * Live AI runs only with a real LogUp account session. In the prototype there is
 * no login prompt here: it simply explains the feature is off.
 */
export function CareAiSignIn({ children, title = "Voice and AI features" }: { children: ReactNode; title?: string }) {
  const { loading, session } = useLogUpSession();
  if (loading) return null;
  if (session) return <>{children}</>;
  return <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{title} are switched off in this prototype.</p>;
}
