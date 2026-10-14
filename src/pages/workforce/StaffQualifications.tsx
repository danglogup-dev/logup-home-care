import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, Plus, ChevronDown, ChevronRight as ChevronRightIcon, FileText, Settings2, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  workforceStore, qualificationStatus, daysToExpiry, ragColorClasses, formatDate,
  resolveQualificationSource, qualificationSourceId,
  type StaffMember, type RagStatus, type QualificationType,
} from "@/lib/workforceStore";
import type { SiteId } from "@/lib/demoDataRegistry";
import { useRole } from "@/hooks/useRole";
import { inScope, isFrontline, isSelfStaff } from "@/lib/roleStore";
import { RoleContextBanner } from "@/components/RoleContextBanner";

const fade = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };

type StatusFilter = "all" | "current" | "expiring" | "expired" | "missing";

const StaffQualifications = () => {
  const [, force] = useState(0);
  useEffect(() => workforceStore.subscribe(() => force((n) => n + 1)), []);
  const role = useRole();
  const frontline = isFrontline(role.role);
  const [searchParams] = useSearchParams();
  const sourceParam = searchParams.get("source");

  const allSites = workforceStore.getSites();
  const sites = allSites.filter((s) => inScope(s.name, role.role, role.scope));
  const scopedSiteIds = new Set(sites.map((s) => s.id));
  const types = workforceStore.getQualificationTypes();
  const allStaff = workforceStore.getStaff();
  // Frontline = self only. Manager/Admin = staff in scope sites, excluding
  // governance-only users by default (they never hold care-delivery quals).
  const [showGovernance, setShowGovernance] = useState(false);
  const staff = frontline
    ? allStaff.filter((s) => isSelfStaff(s.id, role))
    : allStaff.filter((s) =>
        s.assignedSiteIds.some((id) => scopedSiteIds.has(id)) &&
        (showGovernance || s.operationalProfile !== "governance_view_only"),
      );

  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [qualFilter, setQualFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<"list" | "matrix">("list");

  // Deep-link: /app/workforce/qualifications?source=QUAL-… expands the row.
  useEffect(() => {
    if (!sourceParam) return;
    const { staff: s } = resolveQualificationSource(sourceParam);
    if (s) setExpanded((p) => ({ ...p, [s.id]: true }));
  }, [sourceParam]);


  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStaff, setDialogStaff] = useState<StaffMember | null>(null);
  const [form, setForm] = useState({
    qualificationId: types[0]?.id ?? "",
    issuedOn: new Date().toISOString().slice(0, 10),
    expiresOn: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10),
    certificateName: "",
    notes: "",
  });

  const roles = useMemo(() => Array.from(new Set(staff.map((s) => s.role))), [staff]);

  const filtered = useMemo(() => {
    return staff.filter((s) => {
      if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (siteFilter !== "all" && !s.assignedSiteIds.includes(siteFilter as SiteId)) return false;
      if (roleFilter !== "all" && s.role !== roleFilter) return false;
      if (qualFilter !== "all") {
        const q = s.qualifications.find((x) => x.qualificationId === qualFilter);
        if (!q && statusFilter !== "missing") return false;
      }
      if (statusFilter !== "all") {
        const matches = s.qualifications.some((q) => {
          if (qualFilter !== "all" && q.qualificationId !== qualFilter) return false;
          const st = qualificationStatus(q);
          if (statusFilter === "current") return st === "green";
          if (statusFilter === "expiring") return st === "amber";
          if (statusFilter === "expired") return st === "red";
          return false;
        });
        if (statusFilter === "missing") {
          const targetIds = qualFilter === "all" ? types.filter((t) => t.critical).map((t) => t.id) : [qualFilter];
          const isMissing = targetIds.some((id) => !s.qualifications.find((q) => q.qualificationId === id));
          if (!isMissing) return false;
        } else if (!matches) return false;
      }
      return true;
    });
  }, [staff, search, siteFilter, roleFilter, qualFilter, statusFilter, types]);

  const openAddDialog = (s: StaffMember) => {
    setDialogStaff(s);
    setForm({
      qualificationId: types[0]?.id ?? "",
      issuedOn: new Date().toISOString().slice(0, 10),
      expiresOn: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10),
      certificateName: "",
      notes: "",
    });
    setDialogOpen(true);
  };

  const submitQual = () => {
    if (!dialogStaff) return;
    workforceStore.addQualification(dialogStaff.id, {
      qualificationId: form.qualificationId,
      issuedOn: form.issuedOn,
      expiresOn: form.expiresOn,
      certificateName: form.certificateName || undefined,
      notes: form.notes || undefined,
    });
    setDialogOpen(false);
  };

  const [manageOpen, setManageOpen] = useState(false);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 pb-20">
      <motion.div {...fade} className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">{frontline ? "My qualifications" : "Staff qualifications"}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {frontline
              ? "Your competencies — what's current, expiring, expired, or required for your role."
              : "Qualification matrix across all staff. Red / amber / green at a glance."}
          </p>
          <div className="mt-3"><RoleContextBanner /></div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!frontline && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground select-none">
              <Switch checked={showGovernance} onCheckedChange={setShowGovernance} />
              Show governance / view-only users
            </label>
          )}
          {!frontline && (
            <Button variant="outline" size="sm" className="h-9 rounded-xl" onClick={() => setManageOpen(true)}>
              <Settings2 className="h-4 w-4 mr-1.5" /> Manage qualifications
            </Button>
          )}
          <Tabs value={view} onValueChange={(v) => setView(v as "list" | "matrix")}>
            <TabsList>
              <TabsTrigger value="list">List</TabsTrigger>
              <TabsTrigger value="matrix">Matrix</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

      </motion.div>

      {/* Filter bar */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staff" className="pl-9 h-9 rounded-xl" />
        </div>
        <Select value={siteFilter} onValueChange={setSiteFilter}>
          <SelectTrigger className="h-9 rounded-xl"><SelectValue placeholder="Site" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sites</SelectItem>
            {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="h-9 rounded-xl"><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {roles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={qualFilter} onValueChange={setQualFilter}>
          <SelectTrigger className="h-9 rounded-xl"><SelectValue placeholder="Qualification" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All qualifications</SelectItem>
            {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="h-9 rounded-xl"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="current">Current</SelectItem>
            <SelectItem value="expiring">Expiring soon</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="missing">Missing critical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {view === "list" ? (
        <div className="mt-5 space-y-2">
          {filtered.map((s) => {
            const isOpen = !!expanded[s.id];
            const reds = s.qualifications.filter((q) => qualificationStatus(q) === "red").length;
            const ambers = s.qualifications.filter((q) => qualificationStatus(q) === "amber").length;
            const greens = s.qualifications.filter((q) => qualificationStatus(q) === "green").length;
            const overall: RagStatus = reds > 0 ? "red" : ambers > 0 ? "amber" : "green";
            const c = ragColorClasses(overall);
            const site = sites.find((x) => x.id === s.primarySiteId);
            return (
              <div key={s.id} className="bg-card rounded-xl border border-border shadow-soft">
                <button
                  onClick={() => setExpanded((p) => ({ ...p, [s.id]: !p[s.id] }))}
                  className="w-full p-4 flex items-center gap-3 text-left"
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{s.name}</p>
                    <p className="text-[11px] text-muted-foreground">{s.role} · {site?.name}</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-1">
                    {greens > 0 && <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/20">{greens} current</Badge>}
                    {ambers > 0 && <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/20">{ambers} expiring</Badge>}
                    {reds > 0 && <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20">{reds} expired</Badge>}
                  </div>
                  {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />}
                </button>
                {isOpen && (
                  <div className="border-t border-border px-4 py-3">
                    {sourceParam && resolveQualificationSource(sourceParam).staff?.id === s.id && (
                      <div className="mb-2 text-[11px] text-primary bg-primary/5 border border-primary/20 rounded px-2 py-1">Opened from a linked record ({sourceParam}).</div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {types.map((t) => {
                        const q = s.qualifications.find((x) => x.qualificationId === t.id);
                        const expected = s.expectedQualificationIds.includes(t.id);
                        if (!expected) {
                          // Never show missing for rails the staff isn't expected to hold.
                          if (!q) return (
                            <div key={t.id} className="flex items-center gap-2 text-sm py-1.5 px-2 rounded-md bg-muted/40">
                              <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                              <span className="flex-1 text-muted-foreground">{t.name}</span>
                              <Badge variant="outline" className="text-[10px]">Not required</Badge>
                            </div>
                          );
                        }
                        if (!q) {
                          return (
                            <div key={t.id} className="flex items-center gap-2 text-sm py-1.5 px-2 rounded-md bg-destructive/5">
                              <span className="h-2 w-2 rounded-full bg-destructive" />
                              <span className="flex-1 text-foreground">{t.name}</span>
                              <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20">Missing</Badge>
                            </div>
                          );
                        }
                        const status = qualificationStatus(q);
                        const cc = ragColorClasses(status);
                        const days = daysToExpiry(q);
                        return (
                          <div key={t.id} className="flex items-center gap-2 text-sm py-1.5 px-2 rounded-md hover:bg-secondary/50">
                            <span className={`h-2 w-2 rounded-full ${cc.dot}`} />
                            <span className="flex-1 text-foreground">{t.name}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {status === "red" ? `Expired ${-days}d ago` : status === "amber" ? `${days}d left` : `Renews ${formatDate(q.expiresOn)}`}
                            </span>
                            {q.certificateName && (
                              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                <FileText className="h-3 w-3" />{q.certificateName}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button size="sm" variant="outline" onClick={() => openAddDialog(s)} className="h-8 rounded-lg text-xs">
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add / update qualification
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

      ) : (
        <div className="mt-5 bg-card rounded-xl border border-border shadow-soft overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground sticky left-0 bg-secondary/50">Staff</th>
                {types.map((t) => (
                  <th key={t.id} className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">{t.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-3 py-2 sticky left-0 bg-card">
                    <p className="font-semibold text-foreground">{s.name}</p>
                    <p className="text-[10px] text-muted-foreground">{s.role}</p>
                  </td>
                  {types.map((t) => {
                    const q = s.qualifications.find((x) => x.qualificationId === t.id);
                    const expected = s.expectedQualificationIds.includes(t.id);
                    if (!q) {
                      if (!expected) {
                        return (
                          <td key={t.id} className="px-3 py-2">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-muted-foreground">N/R</span>
                          </td>
                        );
                      }
                      return (
                        <td key={t.id} className="px-3 py-2">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            Missing
                          </span>
                        </td>
                      );
                    }

                    const cc = ragColorClasses(qualificationStatus(q));
                    return (
                      <td key={t.id} className="px-3 py-2 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 ${cc.text}`}>
                          <span className={`h-2 w-2 rounded-full ${cc.dot}`} />
                          {formatDate(q.expiresOn)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add / update qualification — {dialogStaff?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-foreground">Qualification</label>
              <Select value={form.qualificationId} onValueChange={(v) => setForm((f) => ({ ...f, qualificationId: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">Issued on</label>
                <Input type="date" value={form.issuedOn} onChange={(e) => setForm((f) => ({ ...f, issuedOn: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Expires on</label>
                <Input type="date" value={form.expiresOn} onChange={(e) => setForm((f) => ({ ...f, expiresOn: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Certificate filename (optional)</label>
              <Input value={form.certificateName} onChange={(e) => setForm((f) => ({ ...f, certificateName: e.target.value }))} className="mt-1" placeholder="e.g. cpr-cert-2026.pdf" />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Notes (optional)</label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitQual}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ManageQualificationsDialog open={manageOpen} onOpenChange={setManageOpen} />
    </div>
  );
};

// ---------- Manage qualifications (admin) ----------

const ManageQualificationsDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) => {
  const types = workforceStore.getQualificationTypes();
  const reqs = workforceStore.getRequirements();
  const staff = workforceStore.getStaff();

  const [draft, setDraft] = useState({ name: "", critical: true, defaultValidityMonths: 12 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ name: string; critical: boolean; defaultValidityMonths: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<QualificationType | null>(null);

  const usageCount = (id: string) => {
    const inReqs = reqs.filter((r) => r.qualificationId === id).length;
    const inStaff = staff.reduce((n, s) => n + (s.qualifications.some((q) => q.qualificationId === id) ? 1 : 0), 0);
    return { inReqs, inStaff };
  };

  const startEdit = (t: QualificationType) => {
    setEditingId(t.id);
    setEditDraft({ name: t.name, critical: t.critical, defaultValidityMonths: t.defaultValidityMonths });
  };

  const saveEdit = () => {
    if (!editingId || !editDraft) return;
    workforceStore.updateQualificationType(editingId, {
      name: editDraft.name.trim() || "Untitled qualification",
      critical: editDraft.critical,
      defaultValidityMonths: Math.max(1, Number(editDraft.defaultValidityMonths) || 12),
    });
    setEditingId(null);
    setEditDraft(null);
  };

  const addNew = () => {
    if (!draft.name.trim()) return;
    workforceStore.addQualificationType({
      name: draft.name,
      critical: draft.critical,
      defaultValidityMonths: Math.max(1, Number(draft.defaultValidityMonths) || 12),
    });
    setDraft({ name: "", critical: true, defaultValidityMonths: 12 });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage qualifications</DialogTitle>
            <DialogDescription>
              Add, rename, or remove qualifications. Changes apply across staff records, site requirements and reporting.
            </DialogDescription>
          </DialogHeader>

          {/* Add new */}
          <div className="rounded-xl border border-border p-3 bg-secondary/30">
            <p className="text-xs font-semibold text-foreground mb-2">Add new qualification</p>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_110px_auto] gap-2 items-end">
              <Input
                placeholder="e.g. PEG feeding, Tracheostomy care…"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                className="h-9"
              />
              <div>
                <label className="text-[10px] text-muted-foreground">Validity (months)</label>
                <Input
                  type="number"
                  min={1}
                  value={draft.defaultValidityMonths}
                  onChange={(e) => setDraft((d) => ({ ...d, defaultValidityMonths: Math.max(1, Number(e.target.value) || 12) }))}
                  className="h-9"
                />
              </div>
              <Button onClick={addNew} className="h-9 rounded-xl">
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
            <label className="mt-2 inline-flex items-center gap-2 text-xs text-foreground">
              <Switch checked={draft.critical} onCheckedChange={(v) => setDraft((d) => ({ ...d, critical: v }))} />
              Mark as critical (missing = red)
            </label>
          </div>

          {/* Existing list */}
          <div className="mt-3 max-h-[360px] overflow-y-auto pr-1">
            <ul className="divide-y divide-border">
              {types.map((t) => {
                const u = usageCount(t.id);
                const isEditing = editingId === t.id;
                return (
                  <li key={t.id} className="py-2.5">
                    {isEditing && editDraft ? (
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_110px_auto_auto] gap-2 items-center">
                        <Input value={editDraft.name} onChange={(e) => setEditDraft((d) => ({ ...d!, name: e.target.value }))} className="h-9" />
                        <Input
                          type="number"
                          min={1}
                          value={editDraft.defaultValidityMonths}
                          onChange={(e) => setEditDraft((d) => ({ ...d!, defaultValidityMonths: Math.max(1, Number(e.target.value) || 12) }))}
                          className="h-9"
                        />
                        <label className="inline-flex items-center gap-2 text-[11px] text-foreground whitespace-nowrap">
                          <Switch checked={editDraft.critical} onCheckedChange={(v) => setEditDraft((d) => ({ ...d!, critical: v }))} />
                          Critical
                        </label>
                        <div className="flex gap-1">
                          <Button size="sm" onClick={saveEdit} className="h-8">Save</Button>
                          <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setEditDraft(null); }} className="h-8">Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-foreground truncate">{t.name}</p>
                            {t.critical && <Badge variant="outline" className="text-[9px] bg-destructive/10 text-destructive border-destructive/20">Critical</Badge>}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Validity {t.defaultValidityMonths}m · {u.inStaff} staff · {u.inReqs} site requirement{u.inReqs === 1 ? "" : "s"}
                          </p>
                        </div>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(t)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setConfirmDelete(t)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Remove "{confirmDelete?.name}"?
            </DialogTitle>
            <DialogDescription>
              {confirmDelete && (() => {
                const u = usageCount(confirmDelete.id);
                return `This will also remove it from ${u.inStaff} staff record${u.inStaff === 1 ? "" : "s"} and ${u.inReqs} site requirement${u.inReqs === 1 ? "" : "s"}. This cannot be undone.`;
              })()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmDelete) workforceStore.removeQualificationType(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default StaffQualifications;
