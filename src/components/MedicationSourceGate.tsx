import { createContext, useContext, type ReactNode } from "react";
import { useLogUpSession } from "@/hooks/useLogUpSession";
import { useRole } from "@/hooks/useRole";
import { REAL_AUTH_ENABLED } from "@/lib/featureFlags";
import { medicationStore } from "@/lib/medicationStore";
import { medicationDemoStore } from "@/lib/medicationDemoStore";

type Source = { store: typeof medicationStore; demo: boolean };
const SourceContext = createContext<Source>({ store: medicationDemoStore, demo: true });
export const useMedicationSource = () => useContext(SourceContext);

export const PROTOTYPE_DATA_NOTE = "Prototype data — resets on reload.";

/**
 * Prototype mode (REAL_AUTH_ENABLED false): eMAR always uses in-memory demo records,
 * permissions follow the demo view, and there is no extra login.
 * With real accounts on: signed-in users get backend records through the one LogUp session.
 */
export function MedicationSourceGate({ children }: { children: ReactNode }) {
  const role = useRole();
  if (!REAL_AUTH_ENABLED) return <SourceContext.Provider value={{ store: medicationDemoStore, demo: true }}><div key={role.presetId}>{children}</div></SourceContext.Provider>;
  return <RealGate>{children}</RealGate>;
}

function RealGate({ children }: { children: ReactNode }) {
  const { loading, session } = useLogUpSession(); const role = useRole();
  if (loading) return <p role="status">Loading…</p>;
  if (session) return <SourceContext.Provider value={{ store: medicationStore, demo: false }}><div key={session.user.id}>{children}</div></SourceContext.Provider>;
  return <SourceContext.Provider value={{ store: medicationDemoStore, demo: true }}><div key={role.presetId}>{children}</div></SourceContext.Provider>;
}
