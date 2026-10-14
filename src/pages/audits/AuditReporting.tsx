import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ClipboardList, Calendar, User as UserIcon, AlertTriangle, ArrowLeft, Camera,
  FileText, Download, CheckCircle2, Search, Filter, Flame, Clock, Image as ImageIcon, X,
  Plus, Upload, Trash2, Play, ShieldCheck, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  audits as seedAudits, statusColor, progressColor, auditTemplatesSeed, sitePICs,
  type AuditRecord, type AuditStatus, type AuditAttachment, type AuditAction,
} from "@/lib/auditsData";
import { auditsStore, useAuditRun, progressOf } from "@/lib/auditsStore";
import { notificationsStore } from "@/lib/notifications";
import { useRole } from "@/hooks/useRole";
import { inScope } from "@/lib/roleStore";
import { RoleContextBanner } from "@/components/RoleContextBanner";

const fade = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };

type StatusFilter = "all" | "in_progress" | "overdue" | "completed";

const matchesStatus = (a: AuditRecord, f: StatusFilter) => {
  if (f === "all") return true;
  if (f === "completed") return a.status === "Complete";
  if (f === "overdue") return a.status === "Overdue";
  // in_progress = anything live and not yet complete
  return a.status === "On Track" || a.status === "Due Soon";
};

const AuditReporting = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [picSignOffName, setPicSignOffName] = useState("");
  const [selected, setSelected] = useState<AuditRecord | null>(null);
  // Editable in-session copy of the selected audit (photos, actions added live).
  const [draft, setDraft] = useState<AuditRecord | null>(null);
  useEffect(() => {
    setDraft(selected ? { ...selected, attachments: [...(selected.attachments ?? [])], actions: [...(selected.actions ?? [])] } : null);
  }, [selected]);

  // ---- Action form state ----
  const [actionDesc, setActionDesc] = useState("");
  const [actionOwner, setActionOwner] = useState("");
  const [actionDue, setActionDue] = useState("");

  // Hidden file inputs for photo capture/upload
  const generalPhotoRef = useRef<HTMLInputElement>(null);
  const itemPhotoRef = useRef<HTMLInputElement>(null);
  const itemPhotoTargetRef = useRef<string | null>(null);

  // Roster of staff that can be assigned actions.
  const staffRoster = useMemo(() => {
    return Array.from(new Set([
      ...seedAudits.map((a) => a.assignedTo),
      "Brendan Tierney", "Maintenance", "Marie Doherty", "Áine Ryan",
    ])).sort();
  }, []);

  const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const handlePhotoFiles = async (files: FileList | null, linkedItem?: string) => {
    if (!files || !draft) return;
    const newAtts: AuditAttachment[] = [];
    for (const file of Array.from(files)) {
      try {
        const dataUrl = await fileToDataUrl(file);
        newAtts.push({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name || `photo-${Date.now()}.jpg`,
          type: file.type.startsWith("image/") ? "photo" : "document",
          dataUrl,
          linkedItem,
          addedBy: draft.assignedTo,
          addedAt: new Date().toLocaleString("en-IE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
        });
      } catch {
        // ignore individual file errors
      }
    }
    if (newAtts.length === 0) return;
    setDraft((d) => d ? { ...d, attachments: [...(d.attachments ?? []), ...newAtts], photos: (d.photos ?? 0) + newAtts.filter(a => a.type === "photo").length } : d);
    toast(`${newAtts.length} photo${newAtts.length === 1 ? "" : "s"} added`, { description: linkedItem ? `Attached to "${linkedItem}".` : "Saved to this audit." });
  };

  const removeAttachment = (id: string) => {
    setDraft((d) => {
      if (!d) return d;
      const att = d.attachments?.find((a) => a.id === id);
      const remaining = (d.attachments ?? []).filter((a) => a.id !== id);
      return { ...d, attachments: remaining, photos: Math.max(0, (d.photos ?? 0) - (att?.type === "photo" ? 1 : 0)) };
    });
  };

  const addAction = () => {
    if (!draft || !actionDesc.trim() || !actionOwner || !actionDue) {
      toast.error("Missing details", { description: "Description, assignee and due date are required." });
      return;
    }
    const formattedDue = new Date(actionDue).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
    const newAction: AuditAction = {
      id: `A-${Date.now()}`,
      description: actionDesc.trim(),
      owner: actionOwner,
      due: formattedDue,
      status: "Open",
    };
    setDraft((d) => d ? { ...d, actions: [...(d.actions ?? []), newAction] } : d);
    setActionDesc(""); setActionOwner(""); setActionDue("");
    toast("Follow-up action added", { description: `Assigned to ${actionOwner}, due ${formattedDue}.` });
  };

  const updateActionStatus = (id: string, status: AuditAction["status"]) => {
    setDraft((d) => d ? { ...d, actions: (d.actions ?? []).map((a) => a.id === id ? { ...a, status } : a) } : d);
  };

  const removeAction = (id: string) => {
    setDraft((d) => d ? { ...d, actions: (d.actions ?? []).filter((a) => a.id !== id) } : d);
  };

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [site, setSite] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [owner, setOwner] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortBy, setSortBy] = useState<"due-asc" | "due-desc" | "status">("due-asc");
  const [findingsFilter, setFindingsFilter] = useState<"all" | "with" | "open">("all");
  const [actionsFilter, setActionsFilter] = useState<"all" | "open">("all");

  const role = useRole();
  const scoped = useMemo(() => seedAudits.filter((a) => inScope(a.site, role.role, role.scope)), [role.role, role.scope]);
  const sites = useMemo(() => Array.from(new Set(scoped.map((a) => a.site))), [scoped]);
  const categories = useMemo(() => Array.from(new Set(scoped.map((a) => a.category))), [scoped]);
  const owners = useMemo(() => Array.from(new Set(scoped.map((a) => a.assignedTo))), [scoped]);

  // Read URL params on mount / change to support drill-downs from Overview
  useEffect(() => {
    const status = searchParams.get("status") as StatusFilter | null;
    if (status && ["all", "in_progress", "overdue", "completed"].includes(status)) {
      setStatusFilter(status);
    }
    const qSite = searchParams.get("site");
    if (qSite) setSite(qSite);
    const qCategory = searchParams.get("category");
    if (qCategory) setCategory(qCategory);
    const qOwner = searchParams.get("owner");
    if (qOwner) setOwner(qOwner);
    const qFindings = searchParams.get("findings");
    if (qFindings === "with" || qFindings === "open") setFindingsFilter(qFindings);
    const qActions = searchParams.get("actions");
    if (qActions === "open") setActionsFilter("open");
    const openId = searchParams.get("openId");
    if (openId) {
      const rec = seedAudits.find((a) => a.id === openId);
      if (rec) setSelected(rec);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const list = scoped.filter((a) => {
      if (!matchesStatus(a, statusFilter)) return false;
      if (site !== "all" && a.site !== site) return false;
      if (category !== "all" && a.category !== category) return false;
      if (owner !== "all" && a.assignedTo !== owner) return false;
      if (findingsFilter === "with" && (a.findings ?? 0) === 0) return false;
      if (findingsFilter === "open" && !(a.findingsList && a.findingsList.length > 0)) return false;
      if (actionsFilter === "open" && !(a.actions?.some((ac) => ac.status !== "Closed"))) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${a.id} ${a.templateName} ${a.assignedTo} ${a.site}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (from || to) {
        const d = new Date(a.dueDate);
        if (from && d < new Date(from)) return false;
        if (to && d > new Date(to)) return false;
      }
      return true;
    });
    const statusOrder: Record<AuditStatus, number> = { Overdue: 0, "Due Soon": 1, "On Track": 2, Complete: 3 };
    return list.sort((a, b) => {
      if (sortBy === "status") return statusOrder[a.status] - statusOrder[b.status];
      const da = new Date(a.dueDate).getTime();
      const db = new Date(b.dueDate).getTime();
      return sortBy === "due-asc" ? da - db : db - da;
    });
  }, [scoped, statusFilter, search, site, category, owner, from, to, sortBy, findingsFilter, actionsFilter]);

  // Counts derive from the same `scoped` base used to render rows so the
  // tab number always reflects what the user could see if they cleared
  // secondary filters. (Secondary-filter narrowing is communicated via the
  // "X of Y" banner below.)
  const counts = useMemo(() => ({
    all: scoped.length,
    in_progress: scoped.filter((a) => a.status === "On Track" || a.status === "Due Soon").length,
    overdue: scoped.filter((a) => a.status === "Overdue").length,
    completed: scoped.filter((a) => a.status === "Complete").length,
  }), [scoped]);

  // How many records match the active status tab alone (no secondary filters)?
  const tabTotal = counts[statusFilter];
  // Secondary filters = everything except the status tab itself.
  const secondaryFilterCount =
    (site !== "all" ? 1 : 0) +
    (category !== "all" ? 1 : 0) +
    (owner !== "all" ? 1 : 0) +
    (findingsFilter !== "all" ? 1 : 0) +
    (actionsFilter !== "all" ? 1 : 0) +
    (search ? 1 : 0) + (from ? 1 : 0) + (to ? 1 : 0);
  const statusTabLabel =
    statusFilter === "all" ? "audit" :
    statusFilter === "in_progress" ? "in-progress audit" :
    statusFilter === "overdue" ? "overdue audit" : "completed audit";

  const activeFilterCount =
    (statusFilter !== "all" ? 1 : 0) +
    (site !== "all" ? 1 : 0) +
    (category !== "all" ? 1 : 0) +
    (owner !== "all" ? 1 : 0) +
    (findingsFilter !== "all" ? 1 : 0) +
    (actionsFilter !== "all" ? 1 : 0) +
    (search ? 1 : 0) + (from ? 1 : 0) + (to ? 1 : 0);

  const clearAllFilters = () => {
    setStatusFilter("all"); setSite("all"); setCategory("all"); setOwner("all");
    setSearch(""); setFrom(""); setTo(""); setSortBy("due-asc");
    setFindingsFilter("all"); setActionsFilter("all");
    setSearchParams({}, { replace: true });
  };

  // ---- DETAIL VIEW ----
  if (selected && draft) {
    const template = auditTemplatesSeed.find((t) => t.name === draft.templateName);
    const sc = statusColor(draft.status);
    const run = auditsStore.get(draft.id);
    const runProgress = run ? progressOf(run) : null;
    const isAwaitingSignoff = run?.status === "awaiting_signoff";
    const isComplete = draft.status === "Complete" || run?.status === "signed_off";
    const startLabel = !run ? "Start audit" : run.status === "in_progress" ? "Continue audit" : "Reopen walkthrough";

    const handlePicSignOff = () => {
      if (!run) return;
      if (!picSignOffName.trim()) {
        toast.error("Please type your name to sign off as PIC.");
        return;
      }
      auditsStore.picSignOff(run.id, picSignOffName.trim());
      notificationsStore.add({
        kind: "audit",
        tone: "success",
        title: `Audit signed off: ${run.templateName}`,
        body: `${run.site} · PIC ${picSignOffName.trim()}`,
        href: `/app/audits/reporting?openId=${run.id}`,
        createdAt: new Date().toLocaleString("en-IE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
      });
      toast.success("Audit signed off", { description: "Closed and added to records." });
      setPicSignOffName("");
    };

    return (
      <div className="max-w-4xl mx-auto px-4 py-8 pb-20">
        {/* Hidden inputs for native camera/file picker */}
        <input
          ref={generalPhotoRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => { handlePhotoFiles(e.target.files); e.target.value = ""; }}
        />
        <input
          ref={itemPhotoRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => { handlePhotoFiles(e.target.files, itemPhotoTargetRef.current ?? undefined); e.target.value = ""; itemPhotoTargetRef.current = null; }}
        />

        <motion.div {...fade}>
          <Button variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground" onClick={() => setSelected(null)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to register
          </Button>
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-muted-foreground">{draft.id}</span>
                <Badge variant="outline" className={`${sc.bg} ${sc.text} ${sc.border} font-semibold text-[10px]`}>{draft.status}</Badge>
                <Badge variant="outline" className="text-[10px] bg-secondary text-muted-foreground border-border">{draft.category}</Badge>
                {isAwaitingSignoff && (
                  <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/20 font-semibold">Awaiting PIC sign-off</Badge>
                )}
                {run?.status === "signed_off" && (
                  <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/20 font-semibold">Signed off</Badge>
                )}
              </div>
              <h1 className="font-heading text-xl font-bold text-foreground mt-1">{draft.templateName}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{draft.site}</p>
            </div>
            <div className="flex items-center gap-2">
              {!isComplete && !isAwaitingSignoff && (
                <Button
                  size="sm"
                  className="h-9 rounded-xl text-sm font-semibold"
                  onClick={() => navigate(`/app/audits/conduct/${draft.id}`)}
                >
                  <Play className="h-4 w-4 mr-1" /> {startLabel}
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-9 rounded-xl text-sm" onClick={() => toast("Audit pack exported", { description: `${draft.id} export prepared for download.` })}>
                <Download className="h-4 w-4 mr-1" /> Export pack
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Walkthrough progress strip */}
        {run && run.status !== "signed_off" && runProgress && (
          <motion.div {...fade} className="mt-4 bg-card rounded-2xl border border-border shadow-soft p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Walkthrough progress</span>
              </div>
              <span className="text-sm font-semibold text-foreground tabular-nums">
                {runProgress.done}/{runProgress.total}
              </span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${runProgress.pct}%` }} />
            </div>
            <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
              <span><span className="text-success font-semibold">{run.items.filter(i => i.outcome === "pass").length}</span> Pass</span>
              <span><span className="text-destructive font-semibold">{run.items.filter(i => i.outcome === "fail").length}</span> Fail</span>
              <span><span className="text-foreground font-semibold">{run.items.filter(i => i.outcome === "na").length}</span> N/A</span>
              {run.signedOffBy && (
                <span className="ml-auto">Submitted by <span className="text-foreground font-medium">{run.signedOffBy}</span></span>
              )}
            </div>
          </motion.div>
        )}

        {/* PIC sign-off panel */}
        {isAwaitingSignoff && run && (
          <motion.div {...fade} className="mt-4 bg-warning/5 rounded-2xl border border-warning/20 p-5">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="h-5 w-5 text-warning" />
              <h3 className="font-heading font-semibold text-foreground">PIC sign-off required</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {run.signedOffBy} submitted this audit on {new Date(run.signedOffAt ?? "").toLocaleString("en-IE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.
              Review the items below and sign off as PIC ({sitePICs[run.site] ?? "PIC"}).
            </p>
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <Input
                value={picSignOffName}
                onChange={(e) => setPicSignOffName(e.target.value)}
                placeholder={`Type your name to sign off (${sitePICs[run.site] ?? "PIC"})`}
                className="h-10 rounded-xl bg-background flex-1"
              />
              <Button className="h-10 rounded-xl font-semibold" onClick={handlePicSignOff}>
                <Send className="h-4 w-4 mr-1.5" /> Sign off audit
              </Button>
            </div>
          </motion.div>
        )}

        <div className="mt-6 grid lg:grid-cols-3 gap-4">
          {/* Main */}
          <div className="lg:col-span-2 space-y-4">
            {/* Progress + checklist */}
            <div className="bg-card rounded-2xl border border-border shadow-soft p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">Progress</span>
                <span className="text-sm font-semibold text-foreground">{draft.completedItems}/{draft.totalItems}</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div className={`h-full ${progressColor(draft.status)} rounded-full`} style={{ width: `${draft.progress}%` }} />
              </div>
              <div className="mt-4 space-y-2">
                {template?.items.map((item, i) => {
                  const done = i < draft.completedItems;
                  const itemPhotos = (draft.attachments ?? []).filter((a) => a.linkedItem === item && a.type === "photo");
                  return (
                    <div key={i} className={`rounded-lg border ${done ? "bg-success/5 border-success/10" : "bg-background border-border"}`}>
                      <div className="flex items-center gap-3 p-2.5">
                        {done
                          ? <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                          : <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />}
                        <span className={`text-sm flex-1 ${done ? "text-muted-foreground line-through" : "text-foreground"}`}>{item}</span>
                        {itemPhotos.length > 0 && (
                          <Badge variant="outline" className="text-[10px] bg-secondary text-muted-foreground border-border gap-1">
                            <ImageIcon className="h-3 w-3" /> {itemPhotos.length}
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            itemPhotoTargetRef.current = item;
                            itemPhotoRef.current?.click();
                          }}
                        >
                          <Camera className="h-3.5 w-3.5 mr-1" /> Photo
                        </Button>
                      </div>
                      {itemPhotos.length > 0 && (
                        <div className="px-2.5 pb-2.5 flex flex-wrap gap-1.5">
                          {itemPhotos.map((p) => (
                            <div key={p.id} className="relative group">
                              {p.dataUrl ? (
                                <img src={p.dataUrl} alt={p.name} className="h-14 w-14 rounded-md object-cover border border-border" />
                              ) : (
                                <div className="h-14 w-14 rounded-md bg-secondary border border-border grid place-items-center">
                                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => removeAttachment(p.id)}
                                className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity"
                                aria-label="Remove photo"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Findings */}
            <div className="bg-card rounded-2xl border border-border shadow-soft p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <h3 className="font-heading font-semibold text-sm text-foreground">Findings</h3>
              </div>
              {draft.findingsList && draft.findingsList.length > 0 ? (
                <div className="space-y-2">
                  {draft.findingsList.map((f) => (
                    <div key={f.id} className="rounded-lg border border-border p-3 bg-background">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">{f.title}</p>
                        <Badge variant="outline" className={`text-[10px] font-semibold ${
                          f.severity === "High" ? "bg-destructive/10 text-destructive border-destructive/20"
                          : f.severity === "Medium" ? "bg-warning/10 text-warning border-warning/20"
                          : "bg-secondary text-muted-foreground border-border"
                        }`}>{f.severity}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Raised {f.raisedAt} by {f.raisedBy}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No findings recorded.</p>
              )}
            </div>

            {/* Actions */}
            <div className="bg-card rounded-2xl border border-border shadow-soft p-5">
              <div className="flex items-center gap-2 mb-3">
                <ClipboardList className="h-4 w-4 text-primary" />
                <h3 className="font-heading font-semibold text-sm text-foreground">Follow-up actions</h3>
              </div>

              {draft.actions && draft.actions.length > 0 ? (
                <div className="space-y-2 mb-4">
                  {draft.actions.map((a) => (
                    <div key={a.id} className="rounded-lg border border-border p-3 bg-background">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm text-foreground flex-1">{a.description}</p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Select value={a.status} onValueChange={(v) => updateActionStatus(a.id, v as AuditAction["status"])}>
                            <SelectTrigger className={`h-7 px-2 rounded-md text-[10px] font-semibold border w-auto ${
                              a.status === "Closed" ? "bg-success/10 text-success border-success/20"
                              : a.status === "In Progress" ? "bg-warning/10 text-warning border-warning/20"
                              : "bg-secondary text-muted-foreground border-border"
                            }`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Open">Open</SelectItem>
                              <SelectItem value="In Progress">In Progress</SelectItem>
                              <SelectItem value="Closed">Closed</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeAction(a.id)} aria-label="Remove action">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        <span className="inline-flex items-center gap-1"><UserIcon className="h-3 w-3" /> {a.owner}</span>
                        <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> Due {a.due}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mb-4">No follow-up actions.</p>
              )}

              {/* Add action form */}
              <div className="rounded-lg border border-dashed border-border p-3 bg-secondary/30 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add action</p>
                <Textarea
                  value={actionDesc}
                  onChange={(e) => setActionDesc(e.target.value)}
                  placeholder="What needs to be done?"
                  className="min-h-[60px] text-sm bg-background"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Select value={actionOwner} onValueChange={setActionOwner}>
                    <SelectTrigger className="h-9 rounded-lg bg-background text-xs">
                      <SelectValue placeholder="Assign to staff member…" />
                    </SelectTrigger>
                    <SelectContent>
                      {staffRoster.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="date"
                    value={actionDue}
                    onChange={(e) => setActionDue(e.target.value)}
                    className="h-9 rounded-lg bg-background text-xs"
                  />
                </div>
                <div className="flex justify-end">
                  <Button size="sm" className="h-8 text-xs" onClick={addAction}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add action
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="bg-card rounded-2xl border border-border shadow-soft p-5 space-y-3">
              <h3 className="font-heading font-semibold text-sm text-foreground">Audit details</h3>
              <Meta label="Site" value={draft.site} />
              <Meta label="Category" value={draft.category} />
              <Meta label="Assigned to" value={draft.assignedTo} icon={<UserIcon className="h-3.5 w-3.5" />} />
              <Meta label="Due date" value={draft.dueDate} icon={<Calendar className="h-3.5 w-3.5" />} />
              {draft.completedAt && <Meta label="Completed" value={draft.completedAt} icon={<CheckCircle2 className="h-3.5 w-3.5 text-success" />} />}
              {draft.signedOffBy && <Meta label="Signed off by" value={draft.signedOffBy} />}
            </div>

            {/* Timeline */}
            <div className="bg-card rounded-2xl border border-border shadow-soft p-5">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-heading font-semibold text-sm text-foreground">Chronology</h3>
              </div>
              {draft.timeline && draft.timeline.length > 0 ? (
                <ol className="relative border-l border-border ml-1.5 space-y-3">
                  {draft.timeline.map((t, i) => (
                    <li key={i} className="ml-3">
                      <span className="absolute -left-1.5 mt-1 h-2.5 w-2.5 rounded-full bg-primary border-2 border-card" />
                      <p className="text-xs font-medium text-foreground">{t.event}</p>
                      <p className="text-[11px] text-muted-foreground">{t.at} · {t.by}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-muted-foreground">No events recorded.</p>
              )}
            </div>

            {/* Attachments */}
            <div className="bg-card rounded-2xl border border-border shadow-soft p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Camera className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-heading font-semibold text-sm text-foreground">Attachments</h3>
                </div>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => generalPhotoRef.current?.click()}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add photo
                </Button>
              </div>
              {draft.attachments && draft.attachments.length > 0 ? (
                <ul className="space-y-2">
                  {draft.attachments.map((att) => (
                    <li key={att.id} className="flex items-center gap-2 text-xs text-foreground group">
                      {att.dataUrl ? (
                        <img src={att.dataUrl} alt={att.name} className="h-8 w-8 rounded object-cover border border-border shrink-0" />
                      ) : att.type === "photo" ? (
                        <ImageIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{att.name}</p>
                        {att.linkedItem && <p className="text-[10px] text-muted-foreground truncate">{att.linkedItem}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAttachment(att.id)}
                        className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Remove"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No attachments. Use "Add photo" or the camera icon on each checklist item.</p>
              )}
            </div>

            {draft.notes && (
              <div className="bg-warning/5 rounded-2xl border border-warning/10 p-4">
                <h4 className="text-xs font-semibold text-foreground mb-1">Notes</h4>
                <p className="text-xs text-muted-foreground">{draft.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---- REGISTER VIEW ----
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 pb-20">
      <motion.div {...fade}>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">Audit Reporting</h1>
            <p className="text-muted-foreground mt-1 text-sm">All audit records, evidence, history and export packs.</p>
            <div className="mt-3"><RoleContextBanner /></div>
          </div>
          <Button size="sm" variant="outline" className="h-9 rounded-xl text-sm" onClick={() => toast("Register exported", { description: `${filtered.length} audits prepared for download.` })}>
            <Download className="h-4 w-4 mr-1" /> Export view
          </Button>
        </div>
      </motion.div>

      {/* Status tabs */}
      <motion.div {...fade} transition={{ delay: 0.06 }} className="mt-5">
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <TabsList className="bg-secondary">
            <TabsTrigger value="all">All <span className="ml-1.5 text-xs text-muted-foreground">{counts.all}</span></TabsTrigger>
            <TabsTrigger value="in_progress">In progress <span className="ml-1.5 text-xs text-muted-foreground">{counts.in_progress}</span></TabsTrigger>
            <TabsTrigger value="overdue">Overdue <span className="ml-1.5 text-xs text-destructive">{counts.overdue}</span></TabsTrigger>
            <TabsTrigger value="completed">Completed <span className="ml-1.5 text-xs text-muted-foreground">{counts.completed}</span></TabsTrigger>
          </TabsList>
        </Tabs>
      </motion.div>

      {/* Filters — matches Incidents Reporting/Board UX */}
      <motion.div {...fade} transition={{ delay: 0.1 }} className="mt-4 bg-card rounded-2xl border border-border shadow-soft p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filters</span>
            {activeFilterCount > 0 && (
              <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20 font-semibold">
                {activeFilterCount} active
              </Badge>
            )}
          </div>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={clearAllFilters}>
              <X className="h-3 w-3 mr-1" /> Clear all
            </Button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={site} onValueChange={setSite}>
            <SelectTrigger className="h-9 rounded-xl bg-background text-xs"><SelectValue placeholder="All sites" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sites</SelectItem>
              {sites.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-9 rounded-xl bg-background text-xs"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={owner} onValueChange={setOwner}>
            <SelectTrigger className="h-9 rounded-xl bg-background text-xs"><SelectValue placeholder="All owners" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All owners</SelectItem>
              {owners.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={findingsFilter} onValueChange={(v) => setFindingsFilter(v as "all" | "with" | "open")}>
            <SelectTrigger className="h-9 rounded-xl bg-background text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any findings</SelectItem>
              <SelectItem value="with">With findings</SelectItem>
              <SelectItem value="open">Open findings only</SelectItem>
            </SelectContent>
          </Select>

          <Select value={actionsFilter} onValueChange={(v) => setActionsFilter(v as "all" | "open")}>
            <SelectTrigger className="h-9 rounded-xl bg-background text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any actions</SelectItem>
              <SelectItem value="open">Open follow-up actions</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ID, audit, owner…"
              className="h-9 pl-8 rounded-xl bg-background text-xs"
            />
          </div>

          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 rounded-xl bg-background text-xs"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-xl bg-background text-xs"
          />

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as "due-asc" | "due-desc" | "status")}>
            <SelectTrigger className="h-9 rounded-xl bg-background text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="due-asc">Due date (soonest)</SelectItem>
              <SelectItem value="due-desc">Due date (latest)</SelectItem>
              <SelectItem value="status">By status</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">{filtered.length} of {scoped.length} audits found</p>
      </motion.div>

      {/* Tab vs visible-rows reconciliation banner */}
      {secondaryFilterCount > 0 && filtered.length < tabTotal && (
        <div className="mt-3 text-xs px-3 py-2 rounded-lg bg-warning/5 border border-warning/20 text-foreground">
          Showing <span className="font-semibold">{filtered.length} of {tabTotal}</span> {statusTabLabel}{tabTotal === 1 ? "" : "s"} due to active filters.
          <button onClick={clearAllFilters} className="ml-2 underline text-primary font-medium">Clear filters</button>
        </div>
      )}

      {/* Records table */}
      <motion.div {...fade} transition={{ delay: 0.14 }} className="mt-4 bg-card rounded-2xl border border-border shadow-soft overflow-hidden">
        <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border bg-secondary/40">
          <div className="col-span-1">ID</div>
          <div className="col-span-4">Audit</div>
          <div className="col-span-2">Site</div>
          <div className="col-span-2">Owner</div>
          <div className="col-span-2">Due / Completed</div>
          <div className="col-span-1 text-right">Status</div>
        </div>
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No audits match these filters.
          </div>
        ) : filtered.map((a) => {
          const sc = statusColor(a.status);
          return (
            <button
              key={a.id}
              onClick={() => setSelected(a)}
              className="w-full text-left grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-secondary/40 transition-colors"
            >
              <div className="md:col-span-1 text-xs font-mono text-muted-foreground">{a.id}</div>
              <div className="md:col-span-4 flex items-center gap-2">
                {a.templateName === "Fire Safety Check" && <Flame className="h-3.5 w-3.5 text-destructive shrink-0" />}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{a.templateName}</p>
                  <p className="text-[11px] text-muted-foreground">{a.category} · {a.findings} findings · {a.photos} photos</p>
                </div>
              </div>
              <div className="md:col-span-2 text-sm text-foreground">{a.site}</div>
              <div className="md:col-span-2 text-sm text-muted-foreground">{a.assignedTo}</div>
              <div className="md:col-span-2 text-sm text-muted-foreground">
                {a.status === "Complete" ? a.completedAt ?? a.dueDate : a.dueDate}
              </div>
              <div className="md:col-span-1 flex md:justify-end">
                <Badge variant="outline" className={`text-[10px] ${sc.bg} ${sc.text} ${sc.border} font-semibold`}>{a.status}</Badge>
              </div>
            </button>
          );
        })}
      </motion.div>

      
    </div>
  );
};

const Meta = ({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) => (
  <div>
    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="text-sm text-foreground flex items-center gap-1.5 mt-0.5">{icon}{value}</p>
  </div>
);

export default AuditReporting;
