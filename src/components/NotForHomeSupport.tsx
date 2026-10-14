import type { ReactNode } from "react";
import { useIsHomeSupportOrg } from "@/lib/sitesStore";
import { NoAccessPanel } from "./RoleContextBanner";

/** Hides residential-only modules for home support orgs without deleting their code. */
export function NotForHomeSupport({ moduleLabel, children }: { moduleLabel: string; children: ReactNode }) {
  if (useIsHomeSupportOrg()) return <div className="p-6 md:p-8"><NoAccessPanel moduleLabel={moduleLabel} notReleased /></div>;
  return <>{children}</>;
}
