import { useTerms } from "@/hooks/useTerms";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Stethoscope, ArrowRight, MapPin, ShieldCheck } from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { useCarePlans, getVisiblePeople, scopeLabel, formatDate, SECTION_LABELS } from "@/lib/carePlansStore";
import {
  useSpecialistContributions,
  CONTRIBUTION_STATUS_LABEL,
  type ContributionStatus,
  type SpecialistContribution,
} from "@/lib/specialistContributionsStore";

const STATUS_BADGE: Record<ContributionStatus, string> = {
  submitted: "bg-amber-100 text-amber-800 border-amber-200",
  under_manager_review: "bg-amber-100 text-amber-800 border-amber-200",
  accepted_note_only: "bg-blue-100 text-blue-800 border-blue-200",
  accepted_into_draft: "bg-emerald-100 text-emerald-800 border-emerald-200",
  partially_accepted: "bg-emerald-100 text-emerald-800 border-emerald-200",
  clarification_requested: "bg-primary/10 text-primary border-primary/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
  archived: "bg-muted text-muted-foreground border-border",
};

const GROUPS = {
  pending: ["submitted", "under_manager_review", "clarification_requested"] as ContributionStatus[],
  accepted: ["accepted_into_draft", "accepted_note_only", "partially_accepted"] as ContributionStatus[],
  rejected: ["rejected"] as ContributionStatus[],
  archived: ["archived"] as ContributionStatus[],
};

export default function SpecialistContributionsIndex() {
  const terms = useTerms();
  const role = useRole();
  const scopeInput = { role: role.role, scope: role.scope, unit: role.unit };
  const { people } = useCarePlans();
  const visiblePeople = useMemo(() => getVisiblePeople(people, scopeInput), [people, scopeInput]);
  const visibleIds = useMemo(() => new Set(visiblePeople.map((p) => p.id)), [visiblePeople]);
  const state = useSpecialistContributions();

  const [siteFilter, setSiteFilter] = useState("all");
  const [professionFilter, setProfessionFilter] = useState("all");
  const [search, setSearch] = useState("");

  const inScope = useMemo(
    () => state.contributions.filter((c) => visibleIds.has(c.personId)),
    [state.contributions, visibleIds],
  );

  const sites = Array.from(new Set(visiblePeople.map((p) => p.site))).sort();
  const professions = Array.from(new Set(inScope.map((c) => c.profession))).sort();

  const filtered = useMemo(() => inScope.filter((c) => {
    const person = visiblePeople.find((p) => p.id === c.personId);
    if (siteFilter !== "all" && person?.site !== siteFilter) return false;
    if (professionFilter !== "all" && c.profession !== professionFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!c.contributorName.toLowerCase().includes(q) &&
          !(person?.name.toLowerCase().includes(q))) return false;
    }
    return true;
  }), [inScope, visiblePeople, siteFilter, professionFilter, search]);

  const byGroup = {
    pending: filtered.filter((c) => GROUPS.pending.includes(c.status)),
    accepted: filtered.filter((c) => GROUPS.accepted.includes(c.status)),
    rejected: filtered.filter((c) => GROUPS.rejected.includes(c.status)),
    archived: filtered.filter((c) => GROUPS.archived.includes(c.status)),
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Specialist Contributions</h1>
          <Badge variant="outline" className="gap-1 bg-secondary/60">
            <MapPin className="h-3 w-3" /> Viewing: {scopeLabel(scopeInput)}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Review notes, specialist recommendations and documents submitted by external professionals. Contributions are specialist contribution only and are never added to the approved care plan without Manager/PIC review.
        </p>
      </div>

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Specialist contribution only — not yet part of the approved care plan. Manager/PIC review required. Professional registration details recorded for audit.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Pending review" value={byGroup.pending.length} tone="amber" />
        <Stat label="Accepted" value={byGroup.accepted.length} tone="emerald" />
        <Stat label="Rejected" value={byGroup.rejected.length} tone="rose" />
        <Stat label="Archived" value={byGroup.archived.length} tone="muted" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[180px]">
              <div className="text-xs text-muted-foreground mb-1">Search</div>
              <Input placeholder={`${terms.Singular} or contributor`} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Site</div>
              <Select value={siteFilter} onValueChange={setSiteFilter}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sites</SelectItem>
                  {sites.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Profession</div>
              <Select value={professionFilter} onValueChange={setProfessionFilter}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All professions</SelectItem>
                  {professions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="pending">
            <TabsList>
              <TabsTrigger value="pending">Pending ({byGroup.pending.length})</TabsTrigger>
              <TabsTrigger value="accepted">Accepted ({byGroup.accepted.length})</TabsTrigger>
              <TabsTrigger value="rejected">Rejected ({byGroup.rejected.length})</TabsTrigger>
              <TabsTrigger value="archived">Archived ({byGroup.archived.length})</TabsTrigger>
            </TabsList>
            {(["pending","accepted","rejected","archived"] as const).map((k) => (
              <TabsContent key={k} value={k} className="space-y-2 mt-3">
                {byGroup[k].length === 0 && (
                  <div className="text-sm text-muted-foreground text-center border border-dashed rounded-lg py-8">
                    Nothing to show.
                  </div>
                )}
                {byGroup[k].map((c) => {
                  const person = visiblePeople.find((p) => p.id === c.personId);
                  return (
                    <div key={c.id} className="rounded-lg border p-3 hover:bg-accent/30 transition-colors">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Stethoscope className="h-4 w-4 text-primary" />
                            <span className="font-medium">{c.contributorName}</span>
                            <span className="text-sm text-muted-foreground">· {c.profession} · {c.registrationBody}{c.registrationNumber ? ` ${c.registrationNumber}` : ""}</span>
                          </div>
                          <div className="text-sm mt-1">
                            <Link to={`/app/care-plans/people/${c.personId}`} className="hover:underline font-medium">{person?.name ?? c.personId}</Link>
                            {person && <span className="text-muted-foreground"> · {person.site}{person.unit ? ` · ${person.unit}` : ""}</span>}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Sections: {c.affectedSections.map((s) => SECTION_LABELS[s as keyof typeof SECTION_LABELS] ?? s).join(", ") || "—"} · submitted {formatDate(c.submittedAt)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={STATUS_BADGE[c.status]}>{CONTRIBUTION_STATUS_LABEL[c.status]}</Badge>
                          {c.linkedDraftVersionNumber && (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200">Draft v{c.linkedDraftVersionNumber}</Badge>
                          )}
                          <Button asChild size="sm" variant="outline">
                            <Link to={`/app/care-plans/people/${c.personId}?tab=contributions`}>
                              Review <ArrowRight className="ml-1 h-3 w-3" />
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "amber"|"emerald"|"rose"|"muted" }) {
  const cls = {
    amber: "text-amber-800",
    emerald: "text-emerald-800",
    rose: "text-destructive",
    muted: "text-foreground",
  }[tone];
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-3xl font-semibold mt-2 ${cls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
