import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  BookOpen,
  Search,
  Plus,
  Upload,
  LayoutGrid,
  List as ListIcon,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Tag,
  User,
  History,
  ChevronRight,
  ChevronDown,
  Folder,
  ArrowUp,
  ArrowDown,
  Pencil,
  Trash2,
  MoreVertical,
  FolderPlus,
  GitBranch,
  ArrowUpDown,
  CalendarClock,
  X,
  FileSearch,
  Eye,
  
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import {
  policiesStore,
  PolicyCategory,
  PolicyDoc,
  TopicGroup,
  docStatusMeta,
} from "@/lib/policiesStore";
import { useRole } from "@/hooks/useRole";
import { can } from "@/lib/roleStore";
import ApprovalQueue from "./ApprovalQueue";
import { PolicyHelpPanel } from "@/components/policies/PolicyHelpPanel";

const categories: (PolicyCategory | "All")[] = [
  "All",
  "Policy",
  "Procedure",
  "Template",
  "Operational",
  "Guidance",
];

export default function PolicyLibrary() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "queue" ? "queue" : "library";

  const [, force] = useState(0);
  useEffect(() => policiesStore.subscribe(() => force((n) => n + 1)), []);

  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<TopicGroup | "All">("All");
  const [category, setCategory] = useState<PolicyCategory | "All">("All");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<"recent" | "az" | "review">("recent");
  const [view, setView] = useState<"list" | "grid">("list");
  // Viewer role — driven by the global demo role switcher.
  // Admin/Manager see governance metadata + queue tab; everyone else sees a clean library.
  const role = useRole();
  const adminView = role.role === "admin";
  const canCreate = role.role === "admin"; // upload + new document — admin only
  const canApprove = can("policy.approve", role.role);
  const canEditChains = can("policy.editChainTemplates", role.role);
  const [expanded, setExpanded] = useState<Set<TopicGroup>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem("policyLibrary.expandedTopics");
      if (raw) return new Set(JSON.parse(raw) as TopicGroup[]);
    } catch {}
    return new Set();
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "policyLibrary.expandedTopics",
        JSON.stringify(Array.from(expanded)),
      );
    } catch {}
  }, [expanded]);
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<PolicyCategory>("Policy");
  const [newTopic, setNewTopic] = useState<TopicGroup>("Governance");
  const [addTopicOpen, setAddTopicOpen] = useState(false);
  const [addTopicName, setAddTopicName] = useState("");
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const docs = policiesStore.list();
  const topicGroups = policiesStore.topicGroups();
  const queueCount =
    policiesStore.awaitingApproval().length +
    policiesStore.returnedForChanges().length +
    policiesStore.approvedPendingPublish().length;

  // Counts per category — used on the type chips.
  const categoryCounts = useMemo(() => {
    const c: Record<string, number> = { All: docs.length };
    docs.forEach((d) => {
      c[d.category] = (c[d.category] || 0) + 1;
    });
    return c;
  }, [docs]);

  // Sort helpers
  const parseDate = (s?: string) => (s ? new Date(s).getTime() || 0 : 0);
  const docLatestEdit = (d: PolicyDoc): string => {
    const vs = policiesStore.getVersions(d.id);
    return vs[0]?.editedAt || d.livePublishedAt || "";
  };

  const filtered = useMemo(() => {
    const out = docs.filter((d) => {
      if (category !== "All" && d.category !== category) return false;
      if (topic !== "All" && d.topicGroup !== topic) return false;
      if (tagFilter && !d.tags.includes(tagFilter)) return false;
      if (query) {
        const q = query.toLowerCase();
        const haystack = `${d.title} ${d.category} ${d.topicGroup} ${d.owner} ${d.tags.join(" ")} ${d.description || ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    if (sort === "az") {
      out.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sort === "review") {
      out.sort((a, b) => {
        const ad = parseDate(a.nextReviewDate);
        const bd = parseDate(b.nextReviewDate);
        if (ad === 0 && bd === 0) return 0;
        if (ad === 0) return 1;
        if (bd === 0) return -1;
        return ad - bd;
      });
    } else {
      out.sort((a, b) => parseDate(docLatestEdit(b)) - parseDate(docLatestEdit(a)));
    }
    return out;
  }, [docs, category, topic, tagFilter, query, sort]);

  const groupedDocs = useMemo(() => {
    const map = new Map<TopicGroup, PolicyDoc[]>();
    topicGroups.forEach((g) => map.set(g, []));
    filtered.forEach((d) => {
      if (!map.has(d.topicGroup)) map.set(d.topicGroup, []);
      map.get(d.topicGroup)!.push(d);
    });
    return map;
  }, [filtered, topicGroups]);

  const toggleExpand = (g: TopicGroup) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  };

  const handleAddTopic = () => {
    const name = addTopicName.trim();
    if (!name) return;
    const ok = policiesStore.addTopicGroup(name);
    if (!ok) {
      toast.error("Topic already exists", { description: `"${name}" is already a topic.` });
      return;
    }
    toast("Topic added", { description: `"${name}" is now available.` });
    setAddTopicName("");
    setAddTopicOpen(false);
    setExpanded((prev) => new Set(prev).add(name));
  };

  const handleRenameTopic = () => {
    if (!renameTarget) return;
    const ok = policiesStore.renameTopicGroup(renameTarget, renameValue);
    if (!ok) {
      toast.error("Could not rename", { description: "Name is empty or already in use." });
      return;
    }
    toast("Topic renamed");
    setRenameTarget(null);
  };

  const handleDeleteTopic = (g: TopicGroup) => {
    const items = groupedDocs.get(g) || [];
    const fallback = topicGroups.find((t) => t !== g);
    const msg = items.length > 0
      ? `Delete "${g}"? ${items.length} document${items.length === 1 ? "" : "s"} will be moved to "${fallback}".`
      : `Delete "${g}"?`;
    if (!window.confirm(msg)) return;
    const ok = policiesStore.removeTopicGroup(g);
    if (!ok) {
      toast.error("Could not delete", { description: "At least one topic must remain." });
      return;
    }
    toast("Topic deleted");
  };

  const handleMoveTopic = (g: TopicGroup, direction: "up" | "down") => {
    policiesStore.moveTopicGroup(g, direction);
  };

  const recentlyPublished = policiesStore.recentlyPublished();
  const draftsInProgress = policiesStore.draftsInProgress();
  const awaiting = policiesStore.awaitingApproval();

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    const { docId, versionId } = policiesStore.createDraft({
      title: newTitle.trim(),
      category: newCategory,
      topicGroup: newTopic,
      owner: "Áine Ryan, PIC",
      tags: [],
    });
    setNewOpen(false);
    setNewTitle("");
    navigate(`/app/policies/${docId}/edit?v=${versionId}`);
  };

  const handleUpload = (file: File) => {
    const docId = policiesStore.uploadDocument({
      filename: file.name,
      sizeKb: Math.max(1, Math.round(file.size / 1024)),
      uploadedBy: "Áine Ryan",
      suggestedTitle: file.name.replace(/\.[^.]+$/, ""),
      category: "Policy",
    });
    navigate(`/app/policies/${docId}`);
  };

  const totalCount = filtered.length;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <BookOpen className="h-4 w-4" />
            <span>Governed documents</span>
          </div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Policy Hub
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            The controlled home for your policies, procedures, templates and operational documents. Staff always see
            the current approved version — drafts and reviews stay behind the scenes until they're published.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.xlsx,.xls"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = "";
            }}
          />
          {/* Local viewer toggle removed — viewer perspective is now controlled by the global role switcher in the header. */}
          {canEditChains && (
            <Button variant="outline" size="sm" className="md:size-default" onClick={() => navigate("/app/policies/chain-templates")}>
              <GitBranch className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Chain templates</span>
              <span className="sm:hidden">Chains</span>
            </Button>
          )}
          {canCreate && (
            <Button variant="outline" size="sm" className="md:size-default" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Upload document</span>
              <span className="sm:hidden">Upload</span>
            </Button>
          )}
          {canCreate && (
            <Button size="sm" className="md:size-default" onClick={() => setNewOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">New document</span>
              <span className="sm:hidden">New</span>
            </Button>
          )}
        </div>
      </div>

      {tab === "library" && <PolicyHelpPanel onSearch={(q) => setQuery(q)} />}

      {/* Tabs — Approval Queue tab is admin-only (managers don't see it by default) */}
      {canApprove && (
        <Tabs
          value={tab}
          onValueChange={(v) => setSearchParams(v === "queue" ? { tab: "queue" } : {})}
        >
          <TabsList>
            <TabsTrigger value="library">Library</TabsTrigger>
            <TabsTrigger value="queue" className="gap-2">
              Approval Queue
              {queueCount > 0 && (
                <Badge variant="secondary" className="rounded-full px-2 py-0 text-xs">
                  {queueCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {canApprove && tab === "queue" ? (
        <ApprovalQueue />
      ) : (
        <>
          {/* Compact quick strip — governance signals, admin only */}
          {adminView && (
          <div className="grid gap-2 sm:grid-cols-3">
            <QuickStrip
              icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
              label="Recently published"
              count={recentlyPublished.length}
              onClick={() => recentlyPublished[0] && navigate(`/app/policies/${recentlyPublished[0].id}`)}
              hint={recentlyPublished[0]?.title}
            />
            <QuickStrip
              icon={<FileText className="h-3.5 w-3.5 text-muted-foreground" />}
              label="Drafts in progress"
              count={draftsInProgress.length}
              onClick={() => draftsInProgress[0] && navigate(`/app/policies/${draftsInProgress[0].doc.id}`)}
              hint={draftsInProgress[0]?.doc.title}
            />
            <QuickStrip
              icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
              label="Awaiting approval"
              count={awaiting.length}
              onClick={() => setSearchParams({ tab: "queue" })}
              hint={awaiting[0] ? policiesStore.get(awaiting[0].docId)?.title : undefined}
            />
          </div>
          )}

          {/* Search + filters (sticky on scroll) */}
          <Card className="sticky top-2 z-20 rounded-2xl border-border/60 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/85">
            <CardContent className="space-y-3 p-3 md:p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search policies, procedures, templates…"
                    className="pl-9"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-secondary"
                      aria-label="Clear search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={topic} onValueChange={(v) => setTopic(v as TopicGroup | "All")}>
                    <SelectTrigger className="w-[150px] md:w-44">
                      <SelectValue placeholder="Topic" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All">All topics</SelectItem>
                      {topicGroups.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
                    <SelectTrigger className="w-[150px] md:w-44">
                      <ArrowUpDown className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recent">Recently updated</SelectItem>
                      <SelectItem value="az">Title A–Z</SelectItem>
                      <SelectItem value="review">Review date</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex rounded-md border border-border bg-background p-0.5">
                    <button
                      type="button"
                      onClick={() => setView("list")}
                      className={`rounded px-2 py-1 ${view === "list" ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
                      aria-label="List view"
                    >
                      <ListIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setView("grid")}
                      className={`rounded px-2 py-1 ${view === "grid" ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
                      aria-label="Grid view"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
              {/* Document type chip row with counts */}
              <div className="-mx-1 flex flex-nowrap items-center gap-1.5 overflow-x-auto px-1 pb-0.5 md:flex-wrap md:overflow-visible">
                <span className="mr-1 shrink-0 text-xs text-muted-foreground">Type:</span>
                {categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                      category === c
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {c}
                    <span className="ml-1 text-[10px] opacity-70">{categoryCounts[c] ?? 0}</span>
                  </button>
                ))}
              </div>
              {/* Active filter chips — quick removal */}
              {(topic !== "All" || category !== "All" || tagFilter || query) && (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2">
                  <span className="text-xs text-muted-foreground">Filters:</span>
                  {query && (
                    <FilterChip label={`"${query}"`} onClear={() => setQuery("")} />
                  )}
                  {category !== "All" && (
                    <FilterChip label={`Type: ${category}`} onClear={() => setCategory("All")} />
                  )}
                  {topic !== "All" && (
                    <FilterChip label={`Topic: ${topic}`} onClear={() => setTopic("All")} />
                  )}
                  {tagFilter && (
                    <FilterChip label={`Tag: ${tagFilter}`} onClear={() => setTagFilter(null)} />
                  )}
                  <button
                    type="button"
                    onClick={() => { setQuery(""); setCategory("All"); setTopic("All"); setTagFilter(null); }}
                    className="ml-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Topic-grouped browser */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="font-heading text-lg font-semibold text-foreground">Browse by topic</h2>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAddTopicOpen(true)}
                  className="h-8 gap-1.5"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  Add topic
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">{totalCount} document{totalCount === 1 ? "" : "s"}</p>
            </div>

            {/* Rich empty state for zero search results */}
            {totalCount === 0 && (query || category !== "All" || topic !== "All" || tagFilter) ? (
              <Card className="rounded-2xl border-border/60 shadow-sm">
                <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                    <FileSearch className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-heading text-base font-semibold text-foreground">No documents match these filters</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Try clearing a filter or searching with a different keyword.
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setQuery(""); setCategory("All"); setTopic("All"); setTagFilter(null); }}
                    >
                      Clear all filters
                    </Button>
                    <Button size="sm" onClick={() => setNewOpen(true)}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" /> New document
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : topicGroups.length === 0 ? (
              <Card className="rounded-2xl border-border/60 shadow-sm">
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  No topics yet. Add one to start organising documents.
                </CardContent>
              </Card>
            ) : (
              topicGroups.map((g, idx) => {
                const items = groupedDocs.get(g) || [];
                // When user is searching/filtering, auto-expand topics that have results.
                const hasActiveFilter = !!query || category !== "All" || topic !== "All" || !!tagFilter;
                const isExpanded = hasActiveFilter ? items.length > 0 : expanded.has(g);
                return (
                  <Card key={g} className="rounded-2xl border-border/60 shadow-sm">
                    <div className="flex items-center gap-1 px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => toggleExpand(g)}
                        className="flex flex-1 items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-secondary/40"
                      >
                        <div className="flex items-center gap-2.5">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <Folder className="h-4 w-4 text-muted-foreground" />
                          <h3 className="font-heading text-sm font-semibold text-foreground">{g}</h3>
                          <Badge variant="secondary" className="rounded-full px-2 py-0 text-xs">
                            {items.length}
                          </Badge>
                        </div>
                      </button>
                      {/* Admin controls */}
                      <div className="flex items-center gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground"
                          aria-label="Move topic up"
                          disabled={idx === 0}
                          onClick={() => handleMoveTopic(g, "up")}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground"
                          aria-label="Move topic down"
                          disabled={idx === topicGroups.length - 1}
                          onClick={() => handleMoveTopic(g, "down")}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" aria-label="Topic actions">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-44 p-1">
                            <button
                              type="button"
                              onClick={() => {
                                setRenameTarget(g);
                                setRenameValue(g);
                              }}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary"
                            >
                              <Pencil className="h-3.5 w-3.5" /> Rename
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTopic(g)}
                              disabled={topicGroups.length <= 1}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </button>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-border/60">
                        {items.length === 0 ? (
                          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                            No documents in this topic yet.
                          </div>
                        ) : view === "list" ? (
                          <div className="divide-y divide-border/60">
                            {items.map((d) => (
                              <DocRow
                                key={d.id}
                                doc={d}
                                adminView={adminView}
                                onClick={() => navigate(`/app/policies/${d.id}`)}
                                onTagClick={(t) => setTagFilter(t)}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                            {items.map((d) => (
                              <DocCard
                                key={d.id}
                                doc={d}
                                adminView={adminView}
                                onClick={() => navigate(`/app/policies/${d.id}`)}
                                onTagClick={(t) => setTagFilter(t)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })
            )}
          </div>
        </>
      )}

      {/* Add topic dialog */}
      <Dialog open={addTopicOpen} onOpenChange={setAddTopicOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a new topic</DialogTitle>
            <DialogDescription>
              Topics group related documents together (e.g. "Infection Control", "Fire Safety").
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <label className="text-sm font-medium">Topic name</label>
            <Input
              value={addTopicName}
              onChange={(e) => setAddTopicName(e.target.value)}
              placeholder="e.g. Infection Control"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleAddTopic()}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddTopicOpen(false)}>Cancel</Button>
            <Button onClick={handleAddTopic} disabled={!addTopicName.trim()}>Add topic</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename topic dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename topic</DialogTitle>
            <DialogDescription>
              All documents currently in this topic will move with the new name.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <label className="text-sm font-medium">New name</label>
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleRenameTopic()}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button onClick={handleRenameTopic} disabled={!renameValue.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New document dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new document</DialogTitle>
            <DialogDescription>
              Start a blank draft. You'll move through draft → review → approval → publish before staff see it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Title</label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Hand Hygiene Policy"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Topic</label>
                <Select value={newTopic} onValueChange={(v) => setNewTopic(v as TopicGroup)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {topicGroups.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Type</label>
                <Select value={newCategory} onValueChange={(v) => setNewCategory(v as PolicyCategory)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.filter((c) => c !== "All").map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!newTitle.trim()}>
              Create draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuickStrip({
  icon,
  label,
  count,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5 text-left shadow-sm transition-colors hover:bg-secondary/40"
    >
      <div className="flex min-w-0 items-center gap-2">
        {icon}
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">
            {label} <span className="text-muted-foreground">· {count}</span>
          </p>
          {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
        </div>
      </div>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs text-primary">
      {label}
      <button
        type="button"
        onClick={onClear}
        className="rounded-full p-0.5 hover:bg-primary/20"
        aria-label={`Remove ${label}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

// --- Row helpers ---

// Returns days until next review; positive = future, negative = overdue.
function daysUntilReview(d?: string): number | null {
  if (!d) return null;
  const t = new Date(d).getTime();
  if (!t) return null;
  const ms = t - Date.now();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function ReviewBadge({ doc }: { doc: PolicyDoc }) {
  const days = daysUntilReview(doc.nextReviewDate);
  if (days === null) return null;
  if (days < 0) {
    return (
      <Badge variant="outline" className="gap-1 border-destructive/30 bg-destructive/10 text-destructive">
        <CalendarClock className="h-3 w-3" /> Review overdue
      </Badge>
    );
  }
  if (days <= 60) {
    return (
      <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-900">
        <CalendarClock className="h-3 w-3" /> Review due {days <= 7 ? `in ${days}d` : doc.nextReviewDate}
      </Badge>
    );
  }
  return null;
}

function InFlightBadge({ doc }: { doc: PolicyDoc }) {
  const draft = policiesStore.getActiveDraft(doc.id);
  if (!draft) return null;
  const labelMap: Record<string, string> = {
    in_review: "in review",
    returned: "returned",
    approved: "ready to publish",
    draft: "draft",
  };
  const stateLabel = labelMap[draft.status] || draft.status;
  return (
    <Badge variant="outline" className="gap-1 border-blue-200 bg-blue-50 text-blue-900">
      <Clock className="h-3 w-3" /> v{draft.versionNumber} {stateLabel}
    </Badge>
  );
}

function DocRow({ doc, onClick, onTagClick, adminView = true }: { doc: PolicyDoc; onClick: () => void; onTagClick?: (t: string) => void; adminView?: boolean }) {
  const live = policiesStore.getLiveVersion(doc.id);
  const status = policiesStore.docStatus(doc.id);
  const meta = docStatusMeta[status];
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
      className="flex w-full cursor-pointer items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-secondary/60 sm:gap-4 sm:px-4"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
        <FileText className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{doc.title}</p>
          {adminView && (
            <div className="flex flex-wrap items-center gap-1.5">
              <ReviewBadge doc={doc} />
              <InFlightBadge doc={doc} />
              {doc.sourceUpload && !live && (
                <Badge variant="outline" className="gap-1 border-blue-200 bg-blue-50 text-blue-900">
                  <Upload className="h-3 w-3" /> Uploaded
                </Badge>
              )}
            </div>
          )}
        </div>
        {doc.description && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{doc.description}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Tag className="h-3 w-3" />{doc.category}</span>
          <span className="hidden items-center gap-1 sm:flex"><User className="h-3 w-3" />{doc.owner}</span>
          {live && (
            <span className="flex items-center gap-1">
              <History className="h-3 w-3" />v{live.versionNumber} · {doc.livePublishedAt}
            </span>
          )}
          {adminView && doc.nextReviewDate && (
            <span className="hidden items-center gap-1 md:flex">
              <CalendarClock className="h-3 w-3" />Review {doc.nextReviewDate}
            </span>
          )}
        </div>
        {doc.tags.length > 0 && onTagClick && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {doc.tags.slice(0, 4).map((t) => (
              <button
                key={t}
                type="button"
                onClick={(e) => { e.stopPropagation(); onTagClick(t); }}
                className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
              >
                #{t}
              </button>
            ))}
          </div>
        )}
      </div>
      {adminView && (
        <Badge variant="outline" className={`shrink-0 ${meta.className}`}>
          {meta.label}
        </Badge>
      )}
    </div>
  );
}

function DocCard({ doc, onClick, onTagClick, adminView = true }: { doc: PolicyDoc; onClick: () => void; onTagClick?: (t: string) => void; adminView?: boolean }) {
  const live = policiesStore.getLiveVersion(doc.id);
  const status = policiesStore.docStatus(doc.id);
  const meta = docStatusMeta[status];
  return (
    <Card
      onClick={onClick}
      className="group cursor-pointer rounded-2xl border-border/60 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
            <FileText className="h-5 w-5" />
          </div>
          {adminView && (
            <Badge variant="outline" className={meta.className}>
              {meta.label}
            </Badge>
          )}
        </div>
        <div>
          <p className="line-clamp-2 text-sm font-semibold text-foreground">{doc.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{doc.category} · {doc.owner}</p>
        </div>
        {adminView && (
          <div className="flex flex-wrap items-center gap-1.5 empty:hidden">
            <ReviewBadge doc={doc} />
            <InFlightBadge doc={doc} />
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{live ? `v${live.versionNumber}` : doc.sourceUpload ? "Uploaded" : "No version"}</span>
          <span>{doc.livePublishedAt ?? "—"}</span>
        </div>
        {doc.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {doc.tags.slice(0, 3).map((t) => (
              <button
                key={t}
                type="button"
                onClick={(e) => { e.stopPropagation(); onTagClick?.(t); }}
                className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
              >
                #{t}
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
