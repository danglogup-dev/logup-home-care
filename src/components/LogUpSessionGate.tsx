import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useLogUpSession } from "@/hooks/useLogUpSession";
import { rememberSignInReturn } from "@/lib/logupAuth";
export function LogUpSessionGate({ children }: { children: ReactNode }) {
  const { loading, session } = useLogUpSession(); const location = useLocation();
  if (loading) return <p role="status">Checking your LogUp session…</p>;
  if (!session) return <div className="space-y-3 border-t pt-4">
    <h2 className="text-lg font-semibold">LogUp account required</h2>
    <p className="text-muted-foreground">You are viewing the fictional demo, not a signed-in staff account. Medication records require an authorised LogUp account.</p>
    <Button asChild><Link to="/signin" onClick={() => rememberSignInReturn(location.pathname + location.search)}>Go to LogUp sign-in</Link></Button>
    <p className="text-sm text-muted-foreground">There is no separate eMAR account. Your organisation must link your LogUp account to your staff role and service areas.</p>
  </div>;
  return <div key={session.user.id}>{children}</div>;
}