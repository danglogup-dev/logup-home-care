import { useSyncExternalStore } from "react";
import { orgSettingsStore, getTerms, type Terms } from "@/lib/orgSettingsStore";

/** Ready-made wording for the people the organisation supports. */
export function useTerms(): Terms {
  return useSyncExternalStore(orgSettingsStore.subscribe, getTerms, getTerms);
}
