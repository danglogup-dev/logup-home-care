import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PolicyHelpPanel } from "@/components/policies/PolicyHelpPanel";
import { useRole } from "@/hooks/useRole";
import { accessibleVisit } from "@/lib/visitActions";
import { useServiceUsers } from "@/lib/serviceUsersStore";
import { clientDisplayName } from "@/lib/visitPresentation";
import { SITES } from "@/lib/demoDataRegistry";
import { scopedSiteIds } from "@/lib/roleStore";
import { telephoneHref } from "@/lib/liveVisitRules";

/** Frontline Policy Help: quick question → approved-policy answer → source → next action. */
export default function PolicyHelpPage() {
  const role = useRole();
  const [params] = useSearchParams();
  const { users } = useServiceUsers();
  const visitId = params.get("visit");
  const visit = visitId ? accessibleVisit(visitId, role) : undefined;
  const client = visit ? users.find((u) => u.id === visit.clientId) : undefined;
  const siteId = visit?.serviceAreaId ?? client?.siteId ?? scopedSiteIds(role)[0];
  const office = SITES.find((s) => s.id === siteId);
  const contactHref = telephoneHref(office?.phone);
  return (
    <section className="space-y-4 px-4 py-4">
      {visit && <Button asChild variant="ghost" className="min-h-12 px-0 text-base"><Link to={`/app/visits/${visit.id}`}><ArrowLeft aria-hidden="true" /> Back to visit</Link></Button>}
      <h1 className="text-2xl font-heading font-bold">Policy Help</h1>
      <PolicyHelpPanel variant="frontline" contactHref={contactHref} contactLabel={office ? `Call ${office.name} office` : "Contact coordinator"}
        visit={visit && client ? { visitId: visit.id, clientId: client.id, label: clientDisplayName(client) } : undefined} />
      <Button asChild variant="outline" className="min-h-12 w-full"><Link to="/app/policies/library"><Library aria-hidden="true" /> Browse Policy Library</Link></Button>
    </section>
  );
}
