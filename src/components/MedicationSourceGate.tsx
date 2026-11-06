import { createContext, useContext, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { FlaskConical } from "lucide-react";
import { useLogUpSession } from "@/hooks/useLogUpSession";
import { useRole } from "@/hooks/useRole";
import { rememberSignInReturn } from "@/lib/logupAuth";
import { medicationStore } from "@/lib/medicationStore";
import { medicationDemoStore, DEMO_MEDICATION_NOTICE } from "@/lib/medicationDemoStore";

type Source = { store: typeof medicationStore; demo: boolean };
const SourceContext = createContext<Source>({ store: medicationStore, demo: false });
export const useMedicationSource = () => useContext(SourceContext);

/**
 * Signed in: real medication records through the shared LogUp session (no second login).
 * Signed out (fictional demo): a simulated, in-memory eMAR that never touches the backend.
 */
export function MedicationSourceGate({ children }: { children: ReactNode }) {
  const { loading, session } = useLogUpSession(); const role = useRole(); const location = useLocation();
  if (loading) return <p role="status">Checking your LogUp session…</p>;
  if (session) return <SourceContext.Provider value={{ store: medicationStore, demo: false }}><div key={session.user.id}>{children}</div></SourceContext.Provider>;
  return <SourceContext.Provider value={{ store: medicationDemoStore, demo: true }}>
    <div className="mb-4 flex flex-wrap items-start gap-2 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
      <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="flex-1"><strong>{DEMO_MEDICATION_NOTICE}</strong> Real medication records need a signed-in LogUp account.{" "}
        <Link className="underline" to="/signin" onClick={() => rememberSignInReturn(location.pathname + location.search)}>Staff sign-in</Link></p>
    </div>
    <div key={role.presetId}>{children}</div>
  </SourceContext.Provider>;
}
