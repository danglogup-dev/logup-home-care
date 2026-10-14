import type { ReactNode } from "react";
import { useIsHomeSupportOrg } from "@/lib/sitesStore";

/** Renders the Home Care view for home_support orgs; residential view otherwise (kept, not deleted). */
export function HomeSupportSwitch({ home, residential }: { home: ReactNode; residential: ReactNode }) {
  return <>{useIsHomeSupportOrg() ? home : residential}</>;
}
