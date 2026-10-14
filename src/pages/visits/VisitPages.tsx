import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Navigation, MapPin, Clock3, ChevronRight, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRole } from "@/hooks/useRole";
import { useTerms } from "@/hooks/useTerms";
import { useServiceUsers, type ServiceUser } from "@/lib/serviceUsersStore";
import { useVisits, VISIT_STATUS_LABELS, type VisitStatus } from "@/lib/visitsStore";
import { canAccess } from "@/lib/roleStore";
import { isModuleKeyReleased } from "@/lib/featureFlags";
import { clientDisplayName, clientTown, directionsUrl, myVisits, visitsOnDate } from "@/lib/visitPresentation";

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit", hour12: false });
const STATUS_TONES: Record<VisitStatus, string> = {
  scheduled: "border-border bg-secondary text-foreground",
  in_progress: "border-primary bg-accent text-accent-foreground",
  completed: "border-border bg-card text-foreground",
  late: "border-destructive bg-destructive text-destructive-foreground",
  missed: "border-destructive bg-destructive text-destructive-foreground",
  cancelled: "border-border bg-secondary text-foreground",
};

function Directions({ client }: { client: ServiceUser }) {
  const url = directionsUrl(client);
  return url ? (
    <Button asChild variant="outline" className="min-h-12 w-full border-primary text-base font-semibold text-primary">
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Directions to ${clientDisplayName(client)}`}>
        <Navigation aria-hidden="true" /> Directions
      </a>
    </Button>
  ) : <p className="text-base">Address not recorded</p>;
}

export function VisitsToday() {
  const role = useRole();
  const { visits, templates } = useVisits();
  const { users } = useServiceUsers();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  const today = visitsOnDate(myVisits(visits, users, role), now);
  const completed = today.filter((v) => v.status === "completed").length;
  return (
    <section className="space-y-5 px-4 py-6" aria-labelledby="today-heading">
      <div>
        <p className="text-base font-medium">{now.toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 id="today-heading" className="mt-1 text-3xl font-heading font-bold">Today</h1>
        <p className="mt-2 text-lg">{today.length} visits · {completed} completed</p>
      </div>
      {today.length === 0 && <p className="border-t py-8 text-lg">No visits assigned to you today.</p>}
      <ol className="space-y-4" aria-label="Today's visits">
        {today.map((visit) => {
          const client = users.find((u) => u.id === visit.clientId);
          if (!client) return null;
          const template = templates.find((t) => t.id === visit.templateId);
          const windowLabel = template ? `${template.windowStart}–${template.windowEnd}` : `${time(visit.scheduledStart)}–${time(visit.scheduledEnd)}`;
          const town = clientTown(client);
          return (
            <li key={visit.id} className="rounded-lg border bg-card p-4">
              <Link to={`/app/visits/${visit.id}`} className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Open visit for ${clientDisplayName(client)} at ${time(visit.scheduledStart)}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-lg font-bold tabular-nums"><Clock3 className="h-5 w-5" aria-hidden="true" />{windowLabel}</p>
                <span className={`rounded-md border px-2 py-1 text-sm font-semibold ${STATUS_TONES[visit.status]}`}>{VISIT_STATUS_LABELS[visit.status]}</span>
              </div>
              <h2 className="mt-3 break-words text-2xl font-heading font-bold">{clientDisplayName(client)}</h2>
              {client.preferredName && client.preferredName !== client.name && <p className="mt-1 text-base">{client.name}</p>}
              <p className="mt-2 flex items-start gap-2 text-base"><MapPin className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />{town || client.homeAddress || "Town not recorded"}</p>
              <p className="mt-2 text-base">{time(visit.scheduledStart)} scheduled · {template?.durationMinutes ?? Math.round((Date.parse(visit.scheduledEnd) - Date.parse(visit.scheduledStart)) / 60000)} min</p>
              </Link>
              <div className="mt-4"><Directions client={client} /></div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function VisitClients() {
  const terms = useTerms();
  const role = useRole();
  const { visits } = useVisits();
  const { users } = useServiceUsers();
  const assigned = new Set(myVisits(visits, users, role).map((v) => v.clientId));
  const clients = users.filter((u) => assigned.has(u.id)).sort((a, b) => clientDisplayName(a).localeCompare(clientDisplayName(b)));
  return (
    <section className="space-y-5 px-4 py-6" aria-labelledby="clients-heading">
      <h1 id="clients-heading" className="text-3xl font-heading font-bold">{terms.Plural}</h1>
      {clients.length === 0 && <p className="text-lg">No {terms.plural} assigned to your visits.</p>}
      <ul className="space-y-4">
        {clients.map((client) => (
          <li key={client.id} className="rounded-lg border bg-card p-4">
            <h2 className="break-words text-2xl font-heading font-bold">{clientDisplayName(client)}</h2>
            <p className="mt-2 text-base">{client.homeAddress || "Address not recorded"}</p>
            {client.eircode && <p className="mt-1 text-base font-semibold">{client.eircode}</p>}
            {client.accessNotes && <p className="mt-3 text-base leading-relaxed">{client.accessNotes}</p>}
            <div className="mt-4 space-y-2">
              <Directions client={client} />
              <Button asChild variant="secondary" className="min-h-12 w-full text-base"><Link to={`/app/care-plans/people/${client.id}`}>Care plan <ChevronRight aria-hidden="true" /></Link></Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function VisitsMe() {
  const role = useRole();
  const links = [
    { key: "tasks.today", label: "My tasks", path: "/app/tasks/today" },
    { key: "audits.my", label: "My audits", path: "/app/audits/my" },
    { key: "policies.library", label: "Policies", path: "/app/policies/library" },
    { key: "workforce.qualifications", label: "My qualifications", path: "/app/workforce/qualifications" },
    { key: "incidents.capture", label: "My reports", path: "/app/incidents/mine" },
    { key: "team", label: "Team & service areas", path: "/app/team" },
  ] as const;
  return (
    <section className="px-4 py-6" aria-labelledby="me-heading">
      <h1 id="me-heading" className="text-3xl font-heading font-bold">Me</h1>
      <h2 className="mt-5 break-words text-2xl font-semibold">{role.displayName}</h2>
      <p className="mt-2 text-lg">{role.title}</p>
      <p className="mt-1 text-base">{role.scope.join(" · ")}</p>
      <div className="mt-6 space-y-2 border-t pt-4">
        {links.filter((l) => canAccess(l.key, role.role) && isModuleKeyReleased(l.key)).map((link) => (
          <Button asChild key={link.key} variant="outline" className="min-h-14 w-full justify-between whitespace-normal text-left text-base">
            <Link to={link.path}>{link.label}<ChevronRight aria-hidden="true" /></Link>
          </Button>
        ))}
        <Button asChild variant="secondary" className="mt-4 min-h-14 w-full text-base"><Link to="/signin"><LogOut aria-hidden="true" /> Sign out</Link></Button>
      </div>
    </section>
  );
}