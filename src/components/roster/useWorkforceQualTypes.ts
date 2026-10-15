import { useSyncExternalStore } from "react";
import { workforceStore } from "@/lib/workforceStore";

/** Qualification types from the existing Workforce store (no copy). */
export function useWorkforceQualTypes() {
  return useSyncExternalStore(workforceStore.subscribe, workforceStore.getQualificationTypes, workforceStore.getQualificationTypes);
}
