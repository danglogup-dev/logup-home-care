import type { ReactNode } from "react";
import { useRole } from "@/hooks/useRole";
import { canAccess, type ModuleKey } from "@/lib/roleStore";
import { isModuleKeyReleased } from "@/lib/featureFlags";
import { NoAccessPanel } from "./RoleContextBanner";

interface Props {
  moduleKey: ModuleKey;
  moduleLabel: string;
  children: ReactNode;
}

/**
 * Route-level guard. If the module is switched off by a feature flag, or the
 * current role can't access this module key, render a friendly panel instead.
 */
export function Guarded({ moduleKey, moduleLabel, children }: Props) {
  const r = useRole();
  if (!isModuleKeyReleased(moduleKey)) {
    return (
      <div className="p-6 md:p-8">
        <NoAccessPanel moduleLabel={moduleLabel} notReleased />
      </div>
    );
  }
  if (!canAccess(moduleKey, r.role)) {
    return (
      <div className="p-6 md:p-8">
        <NoAccessPanel moduleLabel={moduleLabel} />
      </div>
    );
  }
  return <>{children}</>;
}
