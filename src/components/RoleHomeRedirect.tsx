import { Navigate } from "react-router-dom";
import { useRole } from "@/hooks/useRole";
import { canAccess, type ModuleKey } from "@/lib/roleStore";
import { featureFlags } from "@/lib/featureFlags";

/** App-level landing page per role (used when no module fallback is given). */
const ROLE_HOME: Record<string, string> = {
  admin: "/app/home",
  manager: "/app/home",
  coordinator: "/app/home",
  viewonly: "/app/home",
  frontline: "/app/visits/today",
  family: "/family",
};

/**
 * Sends users to a sensible landing page for their role. Without a `fallback`
 * it acts as the app home; with one it acts as a module-level redirect.
 */
export function RoleHomeRedirect({
  fallback,
  frontlinePath,
  managerPath,
  adminPath,
  viewonlyPath,
}: {
  fallback?: string;
  frontlinePath?: string;
  managerPath?: string;
  adminPath?: string;
  viewonlyPath?: string;
}) {
  const r = useRole();
  const explicit =
    (r.role === "frontline" && frontlinePath) ||
    ((r.role === "manager" || r.role === "coordinator") && managerPath) ||
    (r.role === "admin" && adminPath) ||
    (r.role === "viewonly" && viewonlyPath) ||
    undefined;
  if (explicit) return <Navigate to={explicit} replace />;
  if (fallback) {
    if (r.role === "frontline" && !canAccess("incidents.board", r.role) && fallback === "/app/incidents/board") {
      return <Navigate to="/app/incidents/capture" replace />;
    }
    return <Navigate to={fallback} replace />;
  }
  const home = !featureFlags.visits && r.role === "frontline" ? "/app/care-plans/plans" : ROLE_HOME[r.role];
  return <Navigate to={home ?? "/app/incidents/board"} replace />;
}

/** Pick the first sub-route the current role can access from a list. */
export function useFirstAllowed(routes: { key: ModuleKey; path: string }[], fallback: string) {
  const r = useRole();
  return routes.find((x) => canAccess(x.key, r.role))?.path ?? fallback;
}
