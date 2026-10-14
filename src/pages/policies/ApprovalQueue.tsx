import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  CornerUpLeft,
  Send,
  Eye,
  AlertCircle,
  Clock,
  FileText,
  ChevronDown,
  Inbox,
  Sparkles,
  Filter,
  Search,
  ArrowRight,
  Hourglass,
  ShieldCheck,
  History,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  policiesStore,
  PolicyVersion,
  ApprovalStep,
  DEFAULT_APPROVERS,
  versionStatusMeta,
} from "@/lib/policiesStore";
import { ChainList } from "./PolicyDocument";
import { toast } from "sonner";

// ---------------- Helpers ----------------

const ADMIN_PERSONA = "Áine Ryan"; // The PIC / admin who publishes
const APPROVER_PERSONAS = DEFAULT_APPROVERS.map((a) => a.name);
// "Acting as" options — every approver plus the admin/PIC.
const PERSONAS = Array.from(new Set([...APPROVER_PERSONAS, ADMIN_PERSONA]));

/** Parse a stored display date like "9 Apr 2025" or "9 Apr · 14:30" into a Date. */
function parseDisplayDate(s?: string): Date | null {
  if (!s) return null;
  const cleaned = s.split("·")[0].trim();
  const parts = cleaned.split(" ");
  if (parts.length < 2) return null;
  const day = parseInt(parts[0], 10);
  const monthIdx = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    .findIndex((m) => parts[1].startsWith(m));
  if (Number.isNaN(day) || monthIdx < 0) return null;
  const year = parts[2] ? parseInt(parts[2], 10) : new Date().getFullYear();
  return new Date(year, monthIdx, day);
}

function daysSince(s?: string): number | null {
  const d = parseDisplayDate(s);
  if (!d) return null;
  const ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function ageBadge(days: number | null) {
  if (days === null) return null;
  let tone = "bg-secondary text-muted-foreground";
  let label = `${days}d waiting`;
  if (days === 0) {
    label = "Today";
    tone = "bg-emerald-50 text-emerald-700 border-emerald-200";
  } else if (days <= 2) {
    tone = "bg-secondary text-foreground";
  } else if (days <= 5) {
    tone = "bg-amber-50 text-amber-800 border-amber-200";
  } else {
    tone = "bg-red-50 text-red-700 border-red-200";
    label = `${days}d overdue`;
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${tone}`}>
      <Hourglass className="h-3 w-3" />
      {label}
    </span>
  );
}

/** Compact horizontal chain pill — shows status of each step at a glance. */
function ChainStrip({ chain, highlightName }: { chain?: ApprovalStep[]; highlightName?: string }) {
  if (!chain || chain.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {chain.map((s, idx) => {
        const isApproved = s.status === "approved";
        const isReturned = s.status === "returned";
        const isPending = s.status === "pending";
        const namesAtStep = [s.name, ...(s.coApprovers?.map((c) => c.name) || [])];
        const isYou = !!highlightName && namesAtStep.includes(highlightName) && isPending;
        const Icon = isApproved ? CheckCircle2 : isReturned ? CornerUpLeft : Clock;
        const cls = isApproved
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : isReturned
          ? "bg-red-50 text-red-700 border-red-200"
          : isYou
          ? "bg-primary/10 text-primary border-primary/30 ring-1 ring-primary/20"
          : isPending
          ? "bg-amber-50 text-amber-800 border-amber-200"
          : "bg-secondary text-muted-foreground border-border";
        return (
          <div key={s.id} className="flex items-center gap-1">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${cls}`}>
              <Icon className="h-3 w-3" />
              <span className="font-medium">{s.name.split(" ")[0]}</span>
              {s.coApprovers && s.coApprovers.length > 0 && (
                <span className="opacity-70">+{s.coApprovers.length}</span>
              )}
            </span>
            {idx < chain.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
          </div>
        );
      })}
    </div>
  );
}

/** Determine if a given persona is the active approver for a version. */
function isActionableFor(v: PolicyVersion, persona: string): { actionable: boolean; step?: ApprovalStep } {
  const step = v.approvalChain?.find((s) => s.status === "pending");
  if (!step) return { actionable: false };
  const names = [step.name, ...(step.coApprovers?.map((c) => c.name) || [])];
  return { actionable: names.includes(persona), step };
}

// ---------------- Component ----------------

export default function ApprovalQueue() {
  const navigate = useNavigate();
  const [, force] = useState(0);
  useEffect(() => policiesStore.subscribe(() => force((n) => n + 1)), []);

  // Persona / filters
  const [persona, setPersona] = useState<string>("Marie Doherty");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"forYou" | "inFlight" | "returned" | "publish" | "history">("forYou");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Dialog state
  const [returnTarget, setReturnTarget] = useState<PolicyVersion | null>(null);
  const [returnNote, setReturnNote] = useState("");
  const [expandedChain, setExpandedChain] = useState<Set<string>>(new Set());

  const inReview = policiesStore.awaitingApproval();
  const returned = policiesStore.returnedForChanges();
  const readyToPublish = policiesStore.approvedPendingPublish();
  const recent = policiesStore.recentlyApproved();

  // Split inReview into "for you" vs. "awaiting others"
  const forYou = useMemo(
    () => inReview.filter((v) => isActionableFor(v, persona).actionable),
    [inReview, persona],
  );
  const awaitingOthers = useMemo(
    () => inReview.filter((v) => !isActionableFor(v, persona).actionable),
    [inReview, persona],
  );

  const isAdmin = persona === ADMIN_PERSONA;

  // Search filter
  const filterByQuery = (list: PolicyVersion[]) => {
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter((v) => {
      const doc = policiesStore.get(v.docId);
      if (!doc) return false;
      return (
        doc.title.toLowerCase().includes(q) ||
        doc.category.toLowerCase().includes(q) ||
        doc.topicGroup.toLowerCase().includes(q) ||
        v.editedBy.toLowerCase().includes(q)
      );
    });
  };

  // Selection helpers (only for "forYou" tab — bulk approve)
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const clearSelection = () => setSelected(new Set());
  useEffect(() => {
    clearSelection();
  }, [persona, tab]);

  const toggleChain = (id: string) =>
    setExpandedChain((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Actions
  const handleApprove = (v: PolicyVersion, asName?: string) => {
    const next = v.approvalChain?.find((s) => s.status === "pending");
    const approver = asName || (isActionableFor(v, persona).actionable ? persona : next?.name) || persona;
    policiesStore.approve(v.id, approver);
    const remainingPending = (v.approvalChain || []).filter(
      (s) => s.status === "pending" && s.id !== next?.id,
    ).length;
    toast(remainingPending > 0 ? "Step approved" : "Fully approved", {
      description:
        remainingPending > 0
          ? `${approver} approved · awaiting next approver.`
          : `v${v.versionNumber} is ready for an admin to publish.`,
    });
  };

  const handleBulkApprove = () => {
    const items = forYou.filter((v) => selected.has(v.id));
    items.forEach((v) => handleApprove(v, persona));
    clearSelection();
  };

  const handlePublish = (v: PolicyVersion) => {
    policiesStore.publish(v.id, persona === ADMIN_PERSONA ? persona : ADMIN_PERSONA);
    toast("Published", { description: `v${v.versionNumber} is now the live version.` });
  };

  const handleBulkPublish = () => {
    const items = readyToPublish.filter((v) => selected.has(v.id));
    items.forEach((v) => handlePublish(v));
    clearSelection();
  };

  const handleReturn = () => {
    if (!returnTarget || !returnNote.trim()) return;
    const currentApprover = returnTarget.approvalChain?.find((s) => s.status === "pending");
    const actor = isActionableFor(returnTarget, persona).actionable ? persona : currentApprover?.name || persona;
    policiesStore.returnForChanges(returnTarget.id, returnNote.trim(), actor);
    toast("Returned for changes", { description: "Owner has been notified." });
    setReturnTarget(null);
    setReturnNote("");
  };

  // ---------------- Render ----------------

  // KPI counts (always reflect ALL items, not filtered by query — gives stable picture)
  const kpis = [
    {
      key: "forYou",
      label: "Awaiting you",
      count: forYou.length,
      icon: <Sparkles className="h-4 w-4" />,
      tone: "text-primary",
      ring: "ring-primary/20 bg-primary/5",
      onClick: () => setTab("forYou"),
    },
    {
      key: "inFlight",
      label: "Awaiting others",
      count: awaitingOthers.length,
      icon: <Clock className="h-4 w-4" />,
      tone: "text-amber-700",
      ring: "ring-amber-200/60 bg-amber-50/40",
      onClick: () => setTab("inFlight"),
    },
    {
      key: "returned",
      label: "Returned",
      count: returned.length,
      icon: <CornerUpLeft className="h-4 w-4" />,
      tone: "text-red-700",
      ring: "ring-red-200/60 bg-red-50/40",
      onClick: () => setTab("returned"),
    },
    {
      key: "publish",
      label: "Ready to publish",
      count: readyToPublish.length,
      icon: <ShieldCheck className="h-4 w-4" />,
      tone: "text-blue-700",
      ring: "ring-blue-200/60 bg-blue-50/40",
      onClick: () => setTab("publish"),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Acting-as bar + filters */}
      <Card className="rounded-2xl border-border/60 shadow-sm">
        <CardContent className="flex flex-col gap-3 p-3 md:flex-row md:items-center">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="rounded-full bg-secondary text-foreground">
              <Filter className="mr-1 h-3 w-3" />
              Acting as
            </Badge>
            <Select value={persona} onValueChange={setPersona}>
              <SelectTrigger className="h-9 w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERSONAS.map((p) => {
                  const role =
                    DEFAULT_APPROVERS.find((a) => a.name === p)?.role ||
                    (p === ADMIN_PERSONA ? "Person in Charge / Admin" : "Approver");
                  return (
                    <SelectItem key={p} value={p}>
                      <div className="flex flex-col">
                        <span>{p}</span>
                        <span className="text-[11px] text-muted-foreground">{role}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, topic, owner…"
              className="h-9 pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* KPI tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => {
          const active = tab === k.key;
          return (
            <button
              key={k.key}
              type="button"
              onClick={k.onClick}
              className={`flex items-center justify-between rounded-2xl border p-4 text-left shadow-sm transition-all hover:shadow-md ${
                active ? `ring-2 ${k.ring}` : "bg-card"
              }`}
            >
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {k.label}
                </p>
                <p className={`mt-1 font-heading text-3xl font-semibold ${k.tone}`}>{k.count}</p>
              </div>
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-secondary ${k.tone}`}>
                {k.icon}
              </div>
            </button>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="forYou" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            For {persona.split(" ")[0]}
            {forYou.length > 0 && (
              <Badge variant="secondary" className="ml-1 rounded-full px-1.5 py-0 text-[10px]">
                {forYou.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="inFlight">
            Awaiting others
            {awaitingOthers.length > 0 && (
              <Badge variant="secondary" className="ml-1 rounded-full px-1.5 py-0 text-[10px]">
                {awaitingOthers.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="returned">
            Returned
            {returned.length > 0 && (
              <Badge variant="secondary" className="ml-1 rounded-full px-1.5 py-0 text-[10px]">
                {returned.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="publish">
            Ready to publish
            {readyToPublish.length > 0 && (
              <Badge variant="secondary" className="ml-1 rounded-full px-1.5 py-0 text-[10px]">
                {readyToPublish.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-3.5 w-3.5" />
            Recently published
          </TabsTrigger>
        </TabsList>

        {/* For you — actionable */}
        <TabsContent value="forYou" className="mt-4">
          <SectionHeader
            title={`Waiting on ${persona}`}
            description="Drafts where you are the active approver. Approve to advance the chain, or return with feedback."
          />
          {selected.size > 0 && (
            <div className="mb-3 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-2">
              <span className="text-sm font-medium text-foreground">
                {selected.size} selected
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={clearSelection}>
                  Clear
                </Button>
                <Button size="sm" onClick={handleBulkApprove}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Approve {selected.size}
                </Button>
              </div>
            </div>
          )}
          <QueueList
            items={filterByQuery(forYou)}
            emptyTitle={`You're all caught up, ${persona.split(" ")[0]} 🎉`}
            emptyHint="Nothing is waiting on your sign-off right now."
            renderRow={(v) => (
              <ActionableRow
                key={v.id}
                v={v}
                persona={persona}
                selected={selected.has(v.id)}
                onToggleSelect={() => toggleSelect(v.id)}
                onReview={() =>
                  navigate(`/app/policies/${v.docId}/edit?v=${v.id}`)
                }
                onApprove={(asName) => handleApprove(v, asName)}
                onReturn={() => {
                  setReturnTarget(v);
                  setReturnNote("");
                }}
                expandedChain={expandedChain.has(v.id)}
                onToggleChain={() => toggleChain(v.id)}
              />
            )}
          />
        </TabsContent>

        {/* Awaiting others */}
        <TabsContent value="inFlight" className="mt-4">
          <SectionHeader
            title="In flight with other approvers"
            description="Drafts moving through the chain. You can review or step in if you're a delegated co-approver."
          />
          <QueueList
            items={filterByQuery(awaitingOthers)}
            emptyTitle="Nothing waiting on others"
            emptyHint="Every in-flight draft is currently with you or fully decided."
            renderRow={(v) => (
              <PassiveRow
                key={v.id}
                v={v}
                persona={persona}
                onReview={() => navigate(`/app/policies/${v.docId}/edit?v=${v.id}`)}
                expandedChain={expandedChain.has(v.id)}
                onToggleChain={() => toggleChain(v.id)}
              />
            )}
          />
        </TabsContent>

        {/* Returned */}
        <TabsContent value="returned" className="mt-4">
          <SectionHeader
            title="Returned for changes"
            description="Sent back to the owner with feedback. The owner needs to revise and resubmit."
          />
          <QueueList
            items={filterByQuery(returned)}
            emptyTitle="No returns"
            emptyHint="No drafts have been returned for changes."
            renderRow={(v) => (
              <ReturnedRow
                key={v.id}
                v={v}
                persona={persona}
                onReview={() => navigate(`/app/policies/${v.docId}/edit?v=${v.id}`)}
                expandedChain={expandedChain.has(v.id)}
                onToggleChain={() => toggleChain(v.id)}
              />
            )}
          />
        </TabsContent>

        {/* Ready to publish */}
        <TabsContent value="publish" className="mt-4">
          <SectionHeader
            title="Ready to publish"
            description={
              isAdmin
                ? "Fully approved versions waiting for you to publish them live."
                : `Fully approved — ${ADMIN_PERSONA} (admin) needs to publish these.`
            }
          />
          {isAdmin && selected.size > 0 && (
            <div className="mb-3 flex items-center justify-between rounded-xl border border-blue-300/50 bg-blue-50/50 px-4 py-2">
              <span className="text-sm font-medium text-foreground">
                {selected.size} selected
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={clearSelection}>
                  Clear
                </Button>
                <Button size="sm" onClick={handleBulkPublish}>
                  <Send className="mr-2 h-4 w-4" />
                  Publish {selected.size}
                </Button>
              </div>
            </div>
          )}
          <QueueList
            items={filterByQuery(readyToPublish)}
            emptyTitle="Nothing to publish"
            emptyHint="No fully approved versions are queued for publication."
            renderRow={(v) => (
              <PublishRow
                key={v.id}
                v={v}
                isAdmin={isAdmin}
                selected={selected.has(v.id)}
                onToggleSelect={() => toggleSelect(v.id)}
                onReview={() => navigate(`/app/policies/${v.docId}/edit?v=${v.id}`)}
                onPublish={() => handlePublish(v)}
                expandedChain={expandedChain.has(v.id)}
                onToggleChain={() => toggleChain(v.id)}
              />
            )}
          />
        </TabsContent>

        {/* Recently published */}
        <TabsContent value="history" className="mt-4">
          <SectionHeader
            title="Recently published"
            description="The latest live versions across the policy library."
          />
          <QueueList
            items={filterByQuery(recent)}
            emptyTitle="No recent publications"
            emptyHint="Nothing has been published recently."
            renderRow={(v) => (
              <PassiveRow
                key={v.id}
                v={v}
                persona={persona}
                onReview={() => navigate(`/app/policies/${v.docId}/edit?v=${v.id}`)}
                expandedChain={expandedChain.has(v.id)}
                onToggleChain={() => toggleChain(v.id)}
                publishedTone
              />
            )}
          />
        </TabsContent>
      </Tabs>

      {/* Return-for-changes dialog */}
      <Dialog open={!!returnTarget} onOpenChange={(o) => !o && setReturnTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return for changes</DialogTitle>
            <DialogDescription>
              Add a note for the owner explaining what needs to change before this version can be approved.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={returnNote}
            onChange={(e) => setReturnNote(e.target.value)}
            placeholder="e.g. Please reference the latest HIQA guidance and add a section on resident consent."
            className="min-h-[120px]"
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReturnTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleReturn} disabled={!returnNote.trim()}>
              Return for changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------- Subcomponents ----------------

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-3">
      <h2 className="font-heading text-lg font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function QueueList({
  items,
  emptyTitle,
  emptyHint,
  renderRow,
}: {
  items: PolicyVersion[];
  emptyTitle: string;
  emptyHint: string;
  renderRow: (v: PolicyVersion) => React.ReactNode;
}) {
  if (items.length === 0) {
    return (
      <Card className="rounded-2xl border-dashed">
        <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <Inbox className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
          <p className="text-xs text-muted-foreground">{emptyHint}</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="rounded-2xl border-border/60 shadow-sm">
      <div className="divide-y divide-border/60">{items.map(renderRow)}</div>
    </Card>
  );
}

function RowShell({
  v,
  persona,
  highlightYou,
  selectable,
  selected,
  onToggleSelect,
  expandedChain,
  onToggleChain,
  rightActions,
  publishedTone,
}: {
  v: PolicyVersion;
  persona: string;
  highlightYou?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  expandedChain: boolean;
  onToggleChain: () => void;
  rightActions: React.ReactNode;
  publishedTone?: boolean;
}) {
  const doc = policiesStore.get(v.docId);
  if (!doc) return null;
  const meta = versionStatusMeta[v.status];
  const currentApprover = v.approvalChain?.find((s) => s.status === "pending");
  const approvedCount = v.approvalChain?.filter((s) => s.status === "approved").length || 0;
  const totalSteps = v.approvalChain?.length || 0;
  const days = daysSince(v.submittedAt || v.editedAt);

  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {selectable && (
            <input
              type="checkbox"
              checked={!!selected}
              onChange={onToggleSelect}
              className="mt-2 h-4 w-4 cursor-pointer rounded border-border accent-primary"
              aria-label="Select for bulk action"
            />
          )}
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              publishedTone ? "bg-emerald-50 text-emerald-700" : "bg-secondary text-muted-foreground"
            }`}
          >
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => (window.location.hash = "")}
                className="truncate text-sm font-semibold text-foreground"
              >
                {doc.title}
              </button>
              <Badge variant="outline" className="bg-secondary text-foreground">
                {doc.category}
              </Badge>
              <Badge variant="outline" className="text-muted-foreground">
                {doc.topicGroup}
              </Badge>
              <Badge variant="outline" className={meta.className}>
                {meta.label}
              </Badge>
              <span className="text-xs text-muted-foreground">v{v.versionNumber}</span>
              {totalSteps > 0 && (
                <span className="text-xs text-muted-foreground">
                  · {approvedCount}/{totalSteps} approved
                </span>
              )}
              {!publishedTone && ageBadge(days)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Owner: {v.editedBy} · Submitted {v.submittedAt ?? v.editedAt}
              {currentApprover && (
                <>
                  {" · "}
                  <span className="font-medium text-foreground">
                    {highlightYou ? "Waiting on you" : `Waiting on ${currentApprover.name.split(" ")[0]}`}
                  </span>
                  {currentApprover.coApprovers && currentApprover.coApprovers.length > 0 && (
                    <span> (or {currentApprover.coApprovers.map((c) => c.name.split(" ")[0]).join(", ")})</span>
                  )}
                </>
              )}
            </p>
            {v.changeSummary && (
              <p className="mt-1.5 line-clamp-2 max-w-2xl text-sm text-foreground/80">
                {v.changeSummary}
              </p>
            )}
            {v.returnedNote && (
              <p className="mt-1.5 rounded-md bg-red-50 px-2 py-1 text-xs text-red-900">
                Returned: {v.returnedNote}
              </p>
            )}
            {v.approvalChain && v.approvalChain.length > 0 && (
              <div className="mt-2">
                <ChainStrip chain={v.approvalChain} highlightName={persona} />
                <button
                  type="button"
                  onClick={onToggleChain}
                  className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${expandedChain ? "rotate-180" : ""}`}
                  />
                  {expandedChain ? "Hide chain detail" : "Show chain detail"}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:shrink-0">{rightActions}</div>
      </div>
      {expandedChain && v.approvalChain && (
        <div className="ml-12 max-w-2xl">
          <ChainList steps={v.approvalChain} />
        </div>
      )}
    </div>
  );
}

function ActionableRow({
  v,
  persona,
  selected,
  onToggleSelect,
  onReview,
  onApprove,
  onReturn,
  expandedChain,
  onToggleChain,
}: {
  v: PolicyVersion;
  persona: string;
  selected: boolean;
  onToggleSelect: () => void;
  onReview: () => void;
  onApprove: (asName?: string) => void;
  onReturn: () => void;
  expandedChain: boolean;
  onToggleChain: () => void;
}) {
  const { step } = isActionableFor(v, persona);
  const hasCo = step?.coApprovers && step.coApprovers.length > 0;
  return (
    <RowShell
      v={v}
      persona={persona}
      highlightYou
      selectable
      selected={selected}
      onToggleSelect={onToggleSelect}
      expandedChain={expandedChain}
      onToggleChain={onToggleChain}
      rightActions={
        <>
          <Button size="sm" variant="ghost" onClick={onReview}>
            <Eye className="mr-2 h-4 w-4" /> Review
          </Button>
          <Button size="sm" variant="outline" onClick={onReturn}>
            <CornerUpLeft className="mr-2 h-4 w-4" /> Return
          </Button>
          {hasCo ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Approve as…
                  <ChevronDown className="ml-1 h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-1">
                <button
                  type="button"
                  onClick={() => onApprove(persona)}
                  className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <span className="font-medium">{persona} (you)</span>
                  <span className="text-xs text-muted-foreground">
                    {step?.name === persona
                      ? step.role
                      : step?.coApprovers?.find((c) => c.name === persona)?.role || "Approver"}
                  </span>
                </button>
                {step?.name !== persona && step?.name && (
                  <button
                    type="button"
                    onClick={() => onApprove(step!.name)}
                    className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <span className="font-medium">{step!.name}</span>
                    <span className="text-xs text-muted-foreground">{step!.role} · primary</span>
                  </button>
                )}
                {step?.coApprovers
                  ?.filter((c) => c.name !== persona)
                  .map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onApprove(c.name)}
                      className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.role} · co-approver</span>
                    </button>
                  ))}
              </PopoverContent>
            </Popover>
          ) : (
            <Button size="sm" onClick={() => onApprove(persona)}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Approve
            </Button>
          )}
        </>
      }
    />
  );
}

function PassiveRow({
  v,
  persona,
  onReview,
  expandedChain,
  onToggleChain,
  publishedTone,
}: {
  v: PolicyVersion;
  persona: string;
  onReview: () => void;
  expandedChain: boolean;
  onToggleChain: () => void;
  publishedTone?: boolean;
}) {
  return (
    <RowShell
      v={v}
      persona={persona}
      expandedChain={expandedChain}
      onToggleChain={onToggleChain}
      publishedTone={publishedTone}
      rightActions={
        <Button size="sm" variant="outline" onClick={onReview}>
          <Eye className="mr-2 h-4 w-4" /> Review
        </Button>
      }
    />
  );
}

function ReturnedRow({
  v,
  persona,
  onReview,
  expandedChain,
  onToggleChain,
}: {
  v: PolicyVersion;
  persona: string;
  onReview: () => void;
  expandedChain: boolean;
  onToggleChain: () => void;
}) {
  return (
    <RowShell
      v={v}
      persona={persona}
      expandedChain={expandedChain}
      onToggleChain={onToggleChain}
      rightActions={
        <>
          <Button size="sm" variant="outline" onClick={onReview}>
            <Eye className="mr-2 h-4 w-4" /> Review
          </Button>
          <Button size="sm" onClick={onReview}>
            <AlertCircle className="mr-2 h-4 w-4" /> Open for owner
          </Button>
        </>
      }
    />
  );
}

function PublishRow({
  v,
  isAdmin,
  selected,
  onToggleSelect,
  onReview,
  onPublish,
  expandedChain,
  onToggleChain,
}: {
  v: PolicyVersion;
  isAdmin: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onReview: () => void;
  onPublish: () => void;
  expandedChain: boolean;
  onToggleChain: () => void;
}) {
  return (
    <RowShell
      v={v}
      persona={ADMIN_PERSONA}
      selectable={isAdmin}
      selected={selected}
      onToggleSelect={onToggleSelect}
      expandedChain={expandedChain}
      onToggleChain={onToggleChain}
      rightActions={
        <>
          <Button size="sm" variant="outline" onClick={onReview}>
            <Eye className="mr-2 h-4 w-4" /> Review
          </Button>
          {isAdmin ? (
            <Button size="sm" onClick={onPublish}>
              <Send className="mr-2 h-4 w-4" /> Publish
            </Button>
          ) : (
            <Badge variant="outline" className="bg-blue-50 text-blue-700">
              Awaiting admin
            </Badge>
          )}
        </>
      }
    />
  );
}
