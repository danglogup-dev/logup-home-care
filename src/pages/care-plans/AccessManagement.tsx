import { useTerms } from "@/hooks/useTerms";
import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/use-toast";
import {
  MapPin, ShieldCheck, Copy, Ban, UserPlus, Stethoscope, ArrowRight,
  MessageSquare, FileText, HelpCircle, XCircle, CheckCircle2, Clock, Users,
} from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { useCarePlans, getVisiblePeople, scopeLabel, formatDate, SECTION_LABELS } from "@/lib/carePlansStore";
import { ROLE_PRESETS, type Role } from "@/lib/roleStore";
import {
  useSpecialistContributions,
  specialistContributionsStore,
  canInviteSpecialists,
  CARE_PLAN_SECTIONS, ACCESS_LEVELS, REGISTRATION_BODIES, REGULATED_BODIES,
  CONTRIBUTION_STATUS_LABEL,
  type InviteStatus, type ContributionStatus, type SpecialistContribution,
  type AccessLevel, type AccessScopeType, type CarePlanSectionKey, type RegistrationBody,
} from "@/lib/specialistContributionsStore";

const INVITE_BADGE: Record<InviteStatus, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  expired: "bg-muted text-muted-foreground border-border",
  revoked: "bg-destructive/10 text-destructive border-destructive/20",
};

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

const PENDING_STATUSES: ContributionStatus[] = ["submitted", "under_manager_review"];
const CLARIFY_STATUSES: ContributionStatus[] = ["clarification_requested"];
const ACCEPTED_STATUSES: ContributionStatus[] = ["accepted_note_only", "accepted_into_draft", "partially_accepted"];
const REJECTED_STATUSES: ContributionStatus[] = ["rejected"];
const ARCHIVED_STATUSES: ContributionStatus[] = ["archived"];
const SOON_DAYS = 30;

type AccessView = "internal" | "active" | "invites_pending" | "sections" | "expiring" | "revoked" | "invite";
type ContribView = "pending" | "clarification" | "accepted" | "rejected" | "archived";

export default function AccessManagement() {
  const role = useRole();
  const scopeInput = { role: role.role, scope: role.scope, unit: role.unit };
  const { people } = useCarePlans();
  const visiblePeople = useMemo(() => getVisiblePeople(people, scopeInput), [people, scopeInput]);
  const visibleIds = useMemo(() => new Set(visiblePeople.map((p) => p.id)), [visiblePeople]);
  const state = useSpecialistContributions();
  const canInvite = canInviteSpecialists(role.role);
  const canReview = role.role === "admin" || role.role === "manager";

  const invitesInScope = useMemo(
    () => state.invites.filter((i) =>
      i.personIds.length === 0 ? true : i.personIds.some((pid) => visibleIds.has(pid))
    ),
    [state.invites, visibleIds],
  );
  const contributionsInScope = useMemo(
    () => state.contributions.filter((c) => visibleIds.has(c.personId)),
    [state.contributions, visibleIds],
  );

  const now = Date.now();
  const active = invitesInScope.filter((i) => i.status === "active");
  const pendingInvites = invitesInScope.filter((i) => i.status === "pending");
  const expiringSoon = active.filter((i) => i.expiryDate && new Date(i.expiryDate).getTime() - now <= SOON_DAYS * 24 * 3600 * 1000);
  const revokedOrExpired = invitesInScope.filter((i) => i.status === "expired" || i.status === "revoked");

  const contribByStatus = (arr: ContributionStatus[]) => contributionsInScope.filter((c) => arr.includes(c.status));
  const pendingContribs = contribByStatus(PENDING_STATUSES);
  const clarifyContribs = contribByStatus(CLARIFY_STATUSES);
  const acceptedContribs = contribByStatus(ACCEPTED_STATUSES);
  const rejectedContribs = contribByStatus(REJECTED_STATUSES);
  const archivedContribs = contribByStatus(ARCHIVED_STATUSES);

  const doCopy = (link: string) => {
    const full = `${window.location.origin}${link.startsWith("/") ? link : `/${link}`}`;
    navigator.clipboard?.writeText(full);
    toast({ title: "Invite link copied" });
  };
  const doRevoke = (id: string) => {
    specialistContributionsStore.revoke(id);
    toast({ title: "Access revoked" });
  };
  const doExtend = (id: string, newDate: string) => {
    specialistContributionsStore.extendExpiry(id, newDate);
    toast({ title: "Expiry extended", description: `New expiry: ${formatDate(newDate)}` });
  };

  const [accessView, setAccessView] = useState<AccessView>("active");
  const [contribView, setContribView] = useState<ContribView>("pending");

  const accessSubTabs: { key: AccessView; label: string; count?: number }[] = [
    { key: "active", label: "Active external contributors", count: active.length },
    { key: "invites_pending", label: "Specialist invites (pending)", count: pendingInvites.length },
    { key: "internal", label: "Internal access" },
    { key: "sections", label: "Section-level access" },
    { key: "expiring", label: `Expiring ≤ ${SOON_DAYS}d`, count: expiringSoon.length },
    { key: "revoked", label: "Revoked / expired", count: revokedOrExpired.length },
    { key: "invite", label: "Invite contributor" },
  ];

  const contribSubTabs: { key: ContribView; label: string; count: number }[] = [
    { key: "pending", label: "Pending review", count: pendingContribs.length },
    { key: "clarification", label: "Clarification requested", count: clarifyContribs.length },
    { key: "accepted", label: "Accepted", count: acceptedContribs.length },
    { key: "rejected", label: "Rejected", count: rejectedContribs.length },
    { key: "archived", label: "Archived", count: archivedContribs.length },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Access &amp; Contributors</h1>
          <Badge variant="outline" className="gap-1 bg-secondary/60">
            <MapPin className="h-3 w-3" /> Viewing: {scopeLabel(scopeInput)}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Single place to manage who can access or contribute to care plans — internal staff and external specialists.
        </p>
      </div>

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertDescription className="text-sm space-y-0.5">
          <div><strong>Specialist contribution only</strong> — not part of the approved care plan until reviewed.</div>
          <div><strong>External contributors cannot approve or publish.</strong></div>
          <div>Professional registration details are recorded for audit.</div>
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Pending contributions" value={pendingContribs.length} tone="amber" />
        <Stat label="Active contributors" value={active.length} tone="emerald" />
        <Stat label="Pending invites" value={pendingInvites.length} tone="amber" />
        <Stat label={`Expiring ≤ ${SOON_DAYS}d`} value={expiringSoon.length} tone="amber" />
        <Stat label="Revoked / expired" value={revokedOrExpired.length} tone="muted" />
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="access">
            <TabsList>
              <TabsTrigger value="access">
                <Users className="h-4 w-4 mr-1" /> People &amp; Access
              </TabsTrigger>
              <TabsTrigger value="contributions">
                <Stethoscope className="h-4 w-4 mr-1" /> Contributions
                {pendingContribs.length > 0 && <Badge variant="secondary" className="ml-2">{pendingContribs.length}</Badge>}
              </TabsTrigger>
            </TabsList>

            {/* ===================== PEOPLE & ACCESS ===================== */}
            <TabsContent value="access" className="mt-4 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {accessSubTabs.map((t) => {
                    const disabled = t.key === "invite" && !canInvite;
                    const isActive = accessView === t.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        disabled={disabled}
                        onClick={() => setAccessView(t.key)}
                        className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                          isActive ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent/40"
                        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        {t.label}{typeof t.count === "number" ? ` (${t.count})` : ""}
                      </button>
                    );
                  })}
                </div>
                {canInvite && accessView !== "invite" && (
                  <Button size="sm" onClick={() => setAccessView("invite")}>
                    <UserPlus className="h-3.5 w-3.5 mr-1" /> Invite contributor
                  </Button>
                )}
              </div>

              <Separator />

              {accessView === "active" && (
                <ContributorsTable
                  invites={active}
                  people={visiblePeople}
                  onCopy={doCopy}
                  onRevoke={doRevoke}
                  onExtend={doExtend}
                  canManage={canInvite}
                  showExpiry
                />
              )}
              {accessView === "invites_pending" && (
                <ContributorsTable
                  invites={pendingInvites}
                  people={visiblePeople}
                  onCopy={doCopy}
                  onRevoke={doRevoke}
                  canManage={canInvite}
                />
              )}
              {accessView === "internal" && (
                <InternalAccessTable currentRole={role.role} currentScope={role.scope} />
              )}
              {accessView === "sections" && (
                <SectionAccessMatrix invites={active} />
              )}
              {accessView === "expiring" && (
                <div>
                  <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-amber-700" /> Active contributors whose access expires in the next {SOON_DAYS} days.
                  </div>
                  <ContributorsTable
                    invites={expiringSoon}
                    people={visiblePeople}
                    onCopy={doCopy}
                    onRevoke={doRevoke}
                    onExtend={doExtend}
                    canManage={canInvite}
                    showExpiry
                  />
                </div>
              )}
              {accessView === "revoked" && (
                <div>
                  <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
                    <Ban className="h-3.5 w-3.5 text-destructive" /> Historical access — no longer active. Extend expiry to reinstate an expired invite.
                  </div>
                  <ContributorsTable
                    invites={revokedOrExpired}
                    people={visiblePeople}
                    onCopy={doCopy}
                    onExtend={doExtend}
                    canManage={canInvite}
                    showExpiry
                  />
                </div>
              )}
              {accessView === "invite" && (
                canInvite
                  ? <InviteContributorForm
                      people={visiblePeople}
                      sites={Array.from(new Set(visiblePeople.map((p) => p.site))).sort()}
                      invitedBy={role.displayName}
                    />
                  : <EmptyState label="Only Admin, Manager or PIC can invite contributors." />
              )}
            </TabsContent>

            {/* ===================== CONTRIBUTIONS ===================== */}
            <TabsContent value="contributions" className="mt-4 space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {contribSubTabs.map((t) => {
                  const isActive = contribView === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setContribView(t.key)}
                      className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                        isActive ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent/40"
                      }`}
                    >
                      {t.label} ({t.count})
                    </button>
                  );
                })}
              </div>

              <Separator />

              {contribView === "pending" && (
                <ContributionsReviewList
                  contributions={pendingContribs}
                  people={visiblePeople}
                  canReview={canReview}
                  reviewer={{ name: role.displayName, role: role.role }}
                />
              )}
              {contribView === "clarification" && (
                <ContributionsReviewList
                  contributions={clarifyContribs}
                  people={visiblePeople}
                  canReview={canReview}
                  reviewer={{ name: role.displayName, role: role.role }}
                />
              )}
              {contribView === "accepted" && (
                <ContributionsHistoryList contributions={acceptedContribs} people={visiblePeople} tone="emerald" emptyLabel="No accepted contributions yet." />
              )}
              {contribView === "rejected" && (
                <ContributionsHistoryList contributions={rejectedContribs} people={visiblePeople} tone="destructive" emptyLabel="No rejected contributions." />
              )}
              {contribView === "archived" && (
                <ContributionsHistoryList contributions={archivedContribs} people={visiblePeople} tone="muted" emptyLabel="Nothing archived." />
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------- Contributions history (read-only) -------------------- */

function ContributionsHistoryList({
  contributions, people, tone, emptyLabel,
}: {
  contributions: SpecialistContribution[];
  people: ReturnType<typeof getVisiblePeople>;
  tone: "emerald" | "destructive" | "muted";
  emptyLabel: string;
}) {
  const terms = useTerms();
  if (contributions.length === 0) return <EmptyState label={emptyLabel} />;
  const toneCls =
    tone === "emerald" ? "border-emerald-200 bg-emerald-50/40"
    : tone === "destructive" ? "border-destructive/20 bg-destructive/5"
    : "border-border bg-muted/30";
  return (
    <div className="space-y-3">
      {contributions.map((c) => {
        const person = people.find((p) => p.id === c.personId);
        const lastDecision = c.decisions[c.decisions.length - 1];
        return (
          <div key={c.id} className={`rounded-lg border p-4 space-y-2 ${toneCls}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Stethoscope className="h-4 w-4 text-primary" />
                  <span className="font-medium">{c.contributorName}</span>
                  <span className="text-sm text-muted-foreground">
                    · {c.profession} · {c.registrationBody}{c.registrationNumber ? ` ${c.registrationNumber}` : ""}
                  </span>
                </div>
                <div className="text-sm mt-1">
                  <span className="text-muted-foreground">{terms.Singular}: </span>
                  {person
                    ? <Link to={`/app/care-plans/people/${c.personId}`} className="hover:underline font-medium">{person.name}</Link>
                    : c.personId}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Sections: {c.affectedSections.map((s) => SECTION_LABELS[s as keyof typeof SECTION_LABELS] ?? s).join(", ") || "—"} · submitted {formatDate(c.submittedAt)}
                </div>
              </div>
              <Badge variant="outline" className={STATUS_BADGE[c.status]}>{CONTRIBUTION_STATUS_LABEL[c.status]}</Badge>
            </div>
            {lastDecision?.note && (
              <div className="text-xs rounded-md border bg-background/60 p-2">
                <span className="uppercase text-[10px] text-muted-foreground mr-1">Reviewer note:</span>
                <span className="italic">"{lastDecision.note}"</span>
                <span className="text-muted-foreground"> — {lastDecision.reviewerName} · {formatDate(lastDecision.decidedAt)}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}



/* -------------------- Contributions to Review -------------------- */

function ContributionsReviewList({
  contributions, people, canReview, reviewer,
}: {
  contributions: SpecialistContribution[];
  people: ReturnType<typeof getVisiblePeople>;
  canReview: boolean;
  reviewer: { name: string; role: Role };
}) {
  if (contributions.length === 0) return <EmptyState label="No contributions awaiting review." />;
  return (
    <div className="space-y-3">
      {contributions.map((c) => {
        const person = people.find((p) => p.id === c.personId);
        return (
          <ContributionReviewRow key={c.id} c={c} person={person} canReview={canReview} reviewer={reviewer} />
        );
      })}
    </div>
  );
}

function ContributionReviewRow({
  c, person, canReview, reviewer,
}: {
  c: SpecialistContribution;
  person?: ReturnType<typeof getVisiblePeople>[number];
  canReview: boolean;
  reviewer: { name: string; role: Role };
}) {
  const terms = useTerms();
  const [note, setNote] = useState("");
  const [action, setAction] = useState<null | "reject" | "clarify">(null);
  const [reason, setReason] = useState("");

  const doAcceptNote = () => {
    specialistContributionsStore.acceptAsNote(c.id, reviewer, note || undefined);
    toast({ title: "Accepted as note", description: "Care plan text unchanged. Recorded in audit." });
    setNote("");
  };
  const doCreateDraft = async () => {
    await specialistContributionsStore.acceptIntoDraft(c.id, reviewer, { note: note || undefined });
    toast({ title: "Draft update created", description: "Approval chain required before publication." });
    setNote("");
  };
  const doClarify = () => {
    if (!reason.trim()) return;
    specialistContributionsStore.requestClarification(c.id, reviewer, reason.trim());
    toast({ title: "Clarification requested" });
    setReason(""); setAction(null);
  };
  const doReject = () => {
    if (!reason.trim()) return;
    specialistContributionsStore.rejectContribution(c.id, reviewer, reason.trim());
    toast({ title: "Contribution rejected" });
    setReason(""); setAction(null);
  };

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Stethoscope className="h-4 w-4 text-primary" />
            <span className="font-medium">{c.contributorName}</span>
            <span className="text-sm text-muted-foreground">
              · {c.profession} · {c.registrationBody}{c.registrationNumber ? ` ${c.registrationNumber}` : ""}
            </span>
          </div>
          <div className="text-sm mt-1">
            <span className="text-muted-foreground">{terms.Singular}: </span>
            {person
              ? <Link to={`/app/care-plans/people/${c.personId}`} className="hover:underline font-medium">{person.name}</Link>
              : c.personId}
            {person && <span className="text-muted-foreground"> · {person.site}{person.unit ? ` · ${person.unit}` : ""}</span>}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Sections: {c.affectedSections.map((s) => SECTION_LABELS[s as keyof typeof SECTION_LABELS] ?? s).join(", ") || "—"} · submitted {formatDate(c.submittedAt)}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={STATUS_BADGE[c.status]}>{CONTRIBUTION_STATUS_LABEL[c.status]}</Badge>
          <Button asChild size="sm" variant="ghost">
            <Link to={`/app/care-plans/people/${c.personId}?tab=contributors`}>
              Open <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>
      </div>

      {c.note && (
        <div className="text-sm rounded-md border p-2 bg-muted/30 whitespace-pre-wrap">{c.note}</div>
      )}
      {c.proposedText && (
        <div>
          <div className="text-[11px] uppercase text-muted-foreground mb-1">Proposed section wording</div>
          <div className="text-sm rounded-md border p-2 bg-muted/30 whitespace-pre-wrap">{c.proposedText}</div>
        </div>
      )}

      {canReview && (
        <>
          <Separator />
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={doAcceptNote}>
                <MessageSquare className="h-3.5 w-3.5 mr-1" /> Accept as note
              </Button>
              {c.proposedText && (
                <Button size="sm" onClick={doCreateDraft}>
                  <FileText className="h-3.5 w-3.5 mr-1" /> Create draft update
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => { setAction("clarify"); setReason(""); }}>
                <HelpCircle className="h-3.5 w-3.5 mr-1" /> Request clarification
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setAction("reject"); setReason(""); }}>
                <XCircle className="h-3.5 w-3.5 mr-1" /> Reject with reason
              </Button>
            </div>
            {action ? (
              <div className="rounded-md border p-2 space-y-2">
                <div className="text-xs">
                  {action === "reject" ? "Rejection reason (required, kept in audit)" : "Message to contributor"}
                </div>
                <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setAction(null)}>Cancel</Button>
                  <Button size="sm" onClick={action === "reject" ? doReject : doClarify} disabled={!reason.trim()}>
                    Confirm
                  </Button>
                </div>
              </div>
            ) : (
              <Textarea placeholder="Optional reviewer note (attached to decision)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------- Active Contributors table -------------------- */

function ContributorsTable({
  invites, people, onCopy, onRevoke, onExtend, canManage, showExpiry,
}: {
  invites: any[];
  people: ReturnType<typeof getVisiblePeople>;
  onCopy: (link: string) => void;
  onRevoke?: (id: string) => void;
  onExtend?: (id: string, newDate: string) => void;
  canManage: boolean;
  showExpiry?: boolean;
}) {
  const [extendingId, setExtendingId] = useState<string | null>(null);
  const [extendDate, setExtendDate] = useState<string>("");
  if (invites.length === 0) return <EmptyState label="No contributors in this group." />;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Contributor</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Profession</TableHead>
            <TableHead>Registration</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead>Sections</TableHead>
            <TableHead>Access level</TableHead>
            <TableHead>{showExpiry ? "Expires" : "Expiry"}</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invites.map((i) => {
            const scopedPeople = people.filter((p) => i.personIds.includes(p.id));
            const isInternal = i.organisation === "Internal";
            const isExtending = extendingId === i.id;
            return (
              <Fragment key={i.id}>
                <TableRow key={i.id}>
                  <TableCell className="font-medium whitespace-nowrap">
                    <div>{i.contributorName}</div>
                    <div className="text-[10px] text-muted-foreground">{i.contributorEmail}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={isInternal ? "bg-secondary" : "bg-primary/5 text-primary border-primary/20"}>
                      {isInternal ? "Internal" : "External"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{i.profession}</TableCell>
                  <TableCell className="text-xs">{i.registrationBody}{i.registrationNumber ? ` ${i.registrationNumber}` : ""}</TableCell>
                  <TableCell className="text-sm">
                    {scopedPeople.length > 0
                      ? scopedPeople.map((p) => <div key={p.id}>{p.name}</div>)
                      : <span className="text-muted-foreground">{i.accessScopeLabel}</span>}
                  </TableCell>
                  <TableCell className="text-xs">{i.sectionAccess.length === 0 ? "All permitted" : `${i.sectionAccess.length} sections`}</TableCell>
                  <TableCell className="text-xs">
                    {(i.accessLevel as AccessLevel[]).map((l) => l.split("_").join(" ")).join(" · ")}
                  </TableCell>
                  <TableCell className="text-xs">{i.expiryDate ? formatDate(i.expiryDate) : "—"}</TableCell>
                  <TableCell><Badge variant="outline" className={INVITE_BADGE[i.status as InviteStatus]}>{i.status}</Badge></TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {(i.status === "active" || i.status === "pending") && (
                      <Button size="sm" variant="ghost" onClick={() => onCopy(i.inviteLink)}>
                        <Copy className="h-3.5 w-3.5 mr-1" /> Copy link
                      </Button>
                    )}
                    {canManage && onExtend && (i.status === "active" || i.status === "expired") && (
                      <Button size="sm" variant="ghost" onClick={() => {
                        setExtendingId(isExtending ? null : i.id);
                        setExtendDate(i.expiryDate ?? "");
                      }}>
                        <Clock className="h-3.5 w-3.5 mr-1" /> Extend
                      </Button>
                    )}
                    {canManage && onRevoke && (i.status === "active" || i.status === "pending") && (
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onRevoke(i.id)}>
                        <Ban className="h-3.5 w-3.5 mr-1" /> Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
                {isExtending && onExtend && (
                  <TableRow key={`${i.id}-extend`} className="bg-muted/30">
                    <TableCell colSpan={10}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Label className="text-xs">New expiry date</Label>
                        <Input
                          type="date"
                          value={extendDate}
                          onChange={(e) => setExtendDate(e.target.value)}
                          className="max-w-[180px] h-8"
                        />
                        <Button
                          size="sm"
                          disabled={!extendDate}
                          onClick={() => {
                            onExtend(i.id, extendDate);
                            setExtendingId(null);
                          }}
                        >
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setExtendingId(null)}>Cancel</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/* -------------------- Invite Contributor form -------------------- */

type ContributorType = "internal" | "external";

function InviteContributorForm({
  people, sites, invitedBy,
}: {
  people: ReturnType<typeof getVisiblePeople>;
  sites: string[];
  invitedBy: string;
}) {
  const terms = useTerms();
  const [type, setType] = useState<ContributorType>("external");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [profession, setProfession] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [registrationBody, setRegistrationBody] = useState<RegistrationBody>("CORU");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [scopeType, setScopeType] = useState<AccessScopeType>("person");
  const [personId, setPersonId] = useState<string>(people[0]?.id ?? "");
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [siteId, setSiteId] = useState<string>(sites[0] ?? "");
  const [unitId, setUnitId] = useState<string>("");
  const [sections, setSections] = useState<CarePlanSectionKey[]>([]);
  const [levels, setLevels] = useState<AccessLevel[]>(["view_only"]);
  const [expiryDate, setExpiryDate] = useState("");
  const [reason, setReason] = useState("");

  const isRegulated = type === "external" && REGULATED_BODIES.includes(registrationBody);
  const toggleSection = (k: CarePlanSectionKey) =>
    setSections((p) => p.includes(k) ? p.filter((x) => x !== k) : [...p, k]);
  const toggleLevel = (l: AccessLevel) =>
    setLevels((p) => p.includes(l) ? p.filter((x) => x !== l) : [...p, l]);
  const togglePerson = (id: string) =>
    setSelectedPeople((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  const scopeLabelText = useMemo(() => {
    switch (scopeType) {
      case "person": return people.find((p) => p.id === personId)?.name ?? "Selected person";
      case "selected_people": return `${selectedPeople.length} ${terms.plural}`;
      case "unit": return unitId || "Selected unit";
      case "site": return siteId || "Selected site";
    }
  }, [scopeType, personId, selectedPeople, siteId, unitId, people]);

  const canSubmit =
    name.trim() && email.trim() && profession.trim() &&
    (type === "internal" || (organisation.trim() && (!isRegulated || registrationNumber.trim()))) &&
    sections.length > 0 && levels.length > 0 && reason.trim() &&
    (scopeType !== "person" || personId) &&
    (scopeType !== "selected_people" || selectedPeople.length > 0) &&
    (scopeType !== "site" || siteId);

  const submit = () => {
    if (!canSubmit) return;
    const invite = specialistContributionsStore.createInvite({
      contributorName: name.trim(),
      contributorEmail: email.trim(),
      profession: profession.trim(),
      organisation: type === "internal" ? "Internal" : organisation.trim(),
      registrationBody: type === "internal" ? "Not applicable / family advocate / non-registered contributor" : registrationBody,
      registrationNumber: isRegulated ? registrationNumber.trim() : "",
      invitedBy,
      accessScopeType: scopeType,
      accessScopeLabel: scopeLabelText,
      personIds: scopeType === "person" ? [personId]
        : scopeType === "selected_people" ? selectedPeople : [],
      siteId: scopeType === "site" ? siteId : undefined,
      unitId: scopeType === "unit" ? unitId : undefined,
      sectionAccess: sections,
      accessLevel: levels,
      expiryDate: expiryDate || undefined,
      reasonForAccess: reason.trim(),
    });
    toast({
      title: "Invite created",
      description: `${invite.contributorName} — ${scopeLabelText}. Copy link from Active Contributors.`,
    });
    // reset
    setName(""); setEmail(""); setProfession(""); setOrganisation("");
    setRegistrationNumber(""); setSections([]); setLevels(["view_only"]);
    setExpiryDate(""); setReason(""); setSelectedPeople([]);
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Contributors cannot approve or publish care plans. All proposed changes go through the normal approval chain.
        </AlertDescription>
      </Alert>

      <div>
        <Label className="text-xs uppercase text-muted-foreground">Contributor type</Label>
        <div className="mt-2 grid grid-cols-2 gap-2 max-w-md">
          {(["internal", "external"] as ContributorType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-lg border p-3 text-left text-sm transition-colors ${type === t ? "border-primary bg-primary/5" : "hover:bg-accent/40"}`}
            >
              <div className="font-medium capitalize">{t === "internal" ? "Internal staff" : "External specialist"}</div>
              <div className="text-xs text-muted-foreground">
                {t === "internal" ? "Colleague within your organisation." : "Regulated professional or family/advocate outside the organisation."}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Profession / role"><Input value={profession} onChange={(e) => setProfession(e.target.value)} placeholder={type === "internal" ? "e.g. Staff Nurse" : "e.g. Dietitian"} /></Field>
        {type === "external" && (
          <Field label="Organisation"><Input value={organisation} onChange={(e) => setOrganisation(e.target.value)} /></Field>
        )}
        {type === "external" && (
          <>
            <Field label="Registration body">
              <Select value={registrationBody} onValueChange={(v) => setRegistrationBody(v as RegistrationBody)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REGISTRATION_BODIES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            {isRegulated && (
              <Field label="Registration number"><Input value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} /></Field>
            )}
          </>
        )}
      </div>

      <div>
        <Label className="text-xs uppercase text-muted-foreground">Scope</Label>
        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
          {(["person", "selected_people", "unit", "site"] as AccessScopeType[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScopeType(s)}
              className={`rounded-md border px-3 py-2 text-xs text-center transition-colors ${scopeType === s ? "border-primary bg-primary/5" : "hover:bg-accent/40"}`}
            >
              {s === "person" && "One person"}
              {s === "selected_people" && "Selected people"}
              {s === "unit" && "Unit / house"}
              {s === "site" && "Whole site"}
            </button>
          ))}
        </div>
        <div className="mt-2">
          {scopeType === "person" && (
            <Select value={personId} onValueChange={setPersonId}>
              <SelectTrigger className="max-w-md"><SelectValue placeholder="Select person" /></SelectTrigger>
              <SelectContent>
                {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — {p.site}{p.unit ? ` · ${p.unit}` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {scopeType === "selected_people" && (
            <div className="rounded-md border p-3 max-h-56 overflow-y-auto space-y-1">
              {people.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={selectedPeople.includes(p.id)} onCheckedChange={() => togglePerson(p.id)} />
                  <span>{p.name} <span className="text-muted-foreground text-xs">· {p.site}{p.unit ? ` · ${p.unit}` : ""}</span></span>
                </label>
              ))}
            </div>
          )}
          {scopeType === "unit" && (
            <Input className="max-w-md" placeholder="Unit / house name" value={unitId} onChange={(e) => setUnitId(e.target.value)} />
          )}
          {scopeType === "site" && (
            <Select value={siteId} onValueChange={setSiteId}>
              <SelectTrigger className="max-w-md"><SelectValue /></SelectTrigger>
              <SelectContent>
                {sites.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div>
        <Label className="text-xs uppercase text-muted-foreground">Sections</Label>
        <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-1.5">
          {CARE_PLAN_SECTIONS.map((s) => (
            <label key={s.key} className="flex items-center gap-2 text-sm rounded-md border px-2 py-1.5">
              <Checkbox checked={sections.includes(s.key)} onCheckedChange={() => toggleSection(s.key)} />
              <span>{s.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-xs uppercase text-muted-foreground">Access level</Label>
        <div className="mt-2 space-y-1.5">
          {ACCESS_LEVELS.map((l) => (
            <label key={l.value} className="flex items-start gap-2 text-sm rounded-md border p-2">
              <Checkbox checked={levels.includes(l.value)} onCheckedChange={() => toggleLevel(l.value)} className="mt-0.5" />
              <div>
                <div className="font-medium">{l.label}</div>
                <div className="text-xs text-muted-foreground">{l.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Expiry (optional)"><Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></Field>
        <Field label="Reason for access"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this contributor needs access" /></Field>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button onClick={submit} disabled={!canSubmit}>
          <UserPlus className="h-4 w-4 mr-1" /> Create invite
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs uppercase text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/* -------------------- Internal Access -------------------- */

function InternalAccessTable({ currentRole, currentScope }: { currentRole: Role; currentScope: string[] }) {
  const users = ROLE_PRESETS.filter((p) =>
    currentRole === "admin" || p.role === "admin"
      ? currentRole === "admin"
      : (p.scope ?? []).some((s) => currentScope.includes(s))
  );
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <Users className="h-3.5 w-3.5" /> Internal access is governed by the role and scope assigned to each user. Frontline staff cannot approve or publish care plans.
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>User</TableHead><TableHead>Role</TableHead><TableHead>Scope</TableHead><TableHead>Care plan capability</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="font-medium">{u.displayName}</div>
                  <div className="text-xs text-muted-foreground">{u.title}</div>
                </TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{u.role}</Badge></TableCell>
                <TableCell className="text-sm">{u.scope?.join(", ") ?? "—"}{u.unit ? ` · ${u.unit}` : ""}</TableCell>
                <TableCell className="text-xs">
                  {u.role === "admin" && "Full access across all sites"}
                  {u.role === "manager" && "Review, approve, publish within scope"}
                  {u.role === "frontline" && "View approved plan, complete tasks"}
                  {u.role === "viewonly" && "Read-only within scope"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* -------------------- Section Access matrix -------------------- */

function SectionAccessMatrix({ invites }: { invites: any[] }) {
  if (invites.length === 0) return <EmptyState label="No active contributors with section access." />;
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">Which sections each active contributor can view or propose updates to.</div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contributor</TableHead>
              {CARE_PLAN_SECTIONS.map((s) => (
                <TableHead key={s.key} className="text-xs">{s.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {invites.map((i) => (
              <TableRow key={i.id}>
                <TableCell>
                  <div className="font-medium text-sm">{i.contributorName}</div>
                  <div className="text-xs text-muted-foreground">{i.profession}</div>
                </TableCell>
                {CARE_PLAN_SECTIONS.map((s) => {
                  const has = i.sectionAccess.length === 0 || i.sectionAccess.includes(s.key);
                  return (
                    <TableCell key={s.key} className="text-center">
                      {has ? <CheckCircle2 className="h-4 w-4 text-emerald-600 inline" /> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* -------------------- Shared -------------------- */

function EmptyState({ label }: { label: string }) {
  return <div className="text-sm text-muted-foreground text-center border border-dashed rounded-lg py-10">{label}</div>;
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "amber" | "emerald" | "rose" | "muted" }) {
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
