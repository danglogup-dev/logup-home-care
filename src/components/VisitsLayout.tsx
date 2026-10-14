import { Navigate, NavLink, Outlet, useLocation, useParams } from "react-router-dom";
import { useEffect } from "react";
import { CalendarDays, Users, BookOpen, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Guarded } from "@/components/Guarded";
import { useRole } from "@/hooks/useRole";
import { useTerms } from "@/hooks/useTerms";
import { visitsStore } from "@/lib/visitsStore";
import { accessibleVisit } from "@/lib/visitActions";
import VisitSos from "@/components/visits/VisitSos";

export default function VisitsLayout() {
  const role = useRole();
  const terms = useTerms();
  const { pathname } = useLocation();
  const { id } = useParams();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  useEffect(() => {
    visitsStore.refreshStatuses();
    const timer = window.setInterval(() => visitsStore.refreshStatuses(), 15000);
    const refresh = () => visitsStore.refreshStatuses();
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  if (role.role === "external") return <Navigate to="/signin" replace />;
  if (role.role === "family") return <Navigate to="/family" replace />;
  const tabs = [
    { path: "today", label: "Today", icon: CalendarDays },
    { path: "clients", label: terms.Plural, icon: Users },
    { path: "policy-help", label: "Policy Help", icon: BookOpen },
    { path: "me", label: "Me", icon: UserRound },
  ];
  return (
    <Guarded moduleKey="visits.today" moduleLabel="My visits">
      <div className="min-h-dvh bg-background text-foreground">
        <header className="border-b bg-card px-4 pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex min-h-16 max-w-xl items-center justify-between gap-4">
            <span className="font-heading text-2xl font-bold text-primary">LogUp</span>
            {id && accessibleVisit(id, role) ? <VisitSos key={id} visitId={id} /> : <span className="text-sm font-semibold">Home Care</span>}
          </div>
        </header>
        <main className="mx-auto max-w-xl pb-[calc(6rem+env(safe-area-inset-bottom))]">
          <Outlet />
        </main>
        <nav aria-label="Carer navigation" className="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto grid max-w-xl grid-cols-4 gap-1 px-2 py-2">
            {tabs.map(({ path, label, icon: Icon }) => (
              <Button key={path} asChild variant="ghost" className={`h-auto min-h-16 min-w-0 flex-col gap-1 whitespace-normal rounded-md p-1 text-center text-sm font-semibold ${pathname === `/app/visits/${path}` ? "bg-accent text-accent-foreground" : "text-foreground"}`}>
                <NavLink to={`/app/visits/${path}`}>
                  <Icon className="!h-6 !w-6" aria-hidden="true" />
                  <span className="break-words leading-tight">{label}</span>
                </NavLink>
              </Button>
            ))}
          </div>
        </nav>
      </div>
    </Guarded>
  );
}