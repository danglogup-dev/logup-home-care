import { useTerms } from "@/hooks/useTerms";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ShieldCheck, Plus, Pencil, Trash2, Users, MapPin, Lock, ArrowLeft, X,
  UsersRound, Check,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useRole } from "@/hooks/useRole";
import { NoAccessPanel } from "@/components/RoleContextBanner";
import {
  carePlanApprovalChainsStore, useCarePlanApprovalChains, canManageApprovalChains, ruleLabel,
  type ApprovalChainStatus, type ApprovalLevelRule, type ApprovalScopeType,
  type CarePlanApprovalChain, type ApprovalLevel, type ApprovalPerson,
} from "@/lib/carePlanApprovalChainsStore";
import { ALL_SITES } from "@/lib/roleStore";

// ---------- Editable form state ----------

interface EditablePerson { id?: string; name: string; email: string; roleLabel?: string; staffId?: string; }
interface EditableLevel {
  id?: string; levelName: string; rule: ApprovalLevelRule; approvers: EditablePerson[];
}
interface EditableChain {
  id?: string;
  name: string;
  description?: string;
  status: ApprovalChainStatus;
  scopeType: ApprovalScopeType;
  scopeId: string;
  scopeLabel: string;
  levels: EditableLevel[];
}

const EMPTY_CHAIN: EditableChain = {
  name: "", description: "", status: "draft",
  scopeType: "site", scopeId: "Oakfield Manor", scopeLabel: "Oakfield Manor",
  levels: [{ levelName: "Manager Review", rule: "any_one", approvers: [{ name: "", email: "", roleLabel: "" }] }],
};

function toEditable(c: CarePlanApprovalChain): EditableChain {
  return {
    id: c.id, name: c.name, description: c.description, status: c.status,
    scopeType: c.scopeType, scopeId: c.scopeId, scopeLabel: c.scopeLabel,
    levels: c.levels.map((l) => ({
      id: l.id, levelName: l.levelName, rule: l.rule,
      approvers: l.approvers.map((a) => ({ id: a.id, name: a.name, email: a.email, roleLabel: a.roleLabel, staffId: a.staffId })),
    })),
  };
}

// ---------- Page ----------

export default function CarePlanApprovalChainsPage() {
  const role = useRole();
  const { chains } = useCarePlanApprovalChains();
  const [editing, setEditing] = useState<EditableChain | null>(null);

  if (!canManageApprovalChains(role.role)) {
    return <div className="p-6 md:p-8"><NoAccessPanel moduleLabel="Care Plan Approval Chains" /></div>;
  }

  const openNew = () => setEditing({ ...EMPTY_CHAIN, levels: EMPTY_CHAIN.levels.map((l) => ({ ...l, approvers: l.approvers.map((a) => ({ ...a })) })) });
  const openEdit = (c: CarePlanApprovalChain) => setEditing(toEditable(c));

  const totalApprovers = (c: CarePlanApprovalChain) => c.levels.reduce((n, l) => n + l.approvers.length, 0);

  const handleSave = (draft: EditableChain) => {
    // Validate
    if (!draft.name.trim()) { toast.error("Chain name is required"); return; }
    if (draft.levels.length === 0) { toast.error("Add at least one approval level"); return; }
    for (const l of draft.levels) {
      if (!l.levelName.trim()) { toast.error("Every level needs a name"); return; }
      if (l.approvers.length === 0) { toast.error(`Add at least one approver to "${l.levelName}"`); return; }
      for (const a of l.approvers) {
        if (!a.name.trim() || !a.email.trim()) { toast.error("Every approver needs a name and email"); return; }
      }
    }

    const payload = {
      name: draft.name.trim(),
      description: draft.description?.trim(),
      status: draft.status,
      scopeType: draft.scopeType,
      scopeId: draft.scopeId,
      scopeLabel: draft.scopeLabel || draft.scopeId,
      levels: draft.levels.map((l, i) => ({
        id: l.id ?? `LVL-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        levelNumber: i + 1,
        levelName: l.levelName.trim(),
        rule: l.rule,
        approvers: l.approvers.map((a): ApprovalPerson => ({
          id: a.id ?? `AP-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
          name: a.name.trim(),
          email: a.email.trim(),
          roleLabel: a.roleLabel?.trim() || undefined,
          staffId: a.staffId,
        })),
      })) as ApprovalLevel[],
    };

    if (draft.id) {
      carePlanApprovalChainsStore.updateChain(draft.id, payload);
      toast.success("Approval chain updated");
    } else {
      carePlanApprovalChainsStore.createChain(payload);
      toast.success("Approval chain created");
    }
    setEditing(null);
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <Link to="/app/admin/event-types" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Admin
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-3 mt-2">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <Lock className="h-3.5 w-3.5 text-primary" /> Admin only
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Care Plan Approval Chains</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Configure who must approve care plan changes for each site, house, or unit. Human approval is required —
              AI drafts do not publish care plans.
            </p>
          </div>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Create approval chain</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Chain</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Levels</TableHead>
                <TableHead>Approvers</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {chains.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="font-medium">{c.name}</div>
                    {c.description && <div className="text-xs text-muted-foreground mt-0.5 max-w-md">{c.description}</div>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{c.scopeLabel}</span>
                    </div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground mt-0.5">{c.scopeType}</div>
                  </TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell className="text-sm">{c.levels.length}</TableCell>
                  <TableCell className="text-sm">{totalApprovers(c)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(c.updatedAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => carePlanApprovalChainsStore.setChainStatus(c.id, c.status === "active" ? "inactive" : "active")}>
                        {c.status === "active" ? "Deactivate" : "Activate"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {chains.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No approval chains yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editing && (
        <ChainEditor
          draft={editing}
          onChange={setEditing}
          onCancel={() => setEditing(null)}
          onSave={() => handleSave(editing)}
          onDelete={editing.id ? () => {
            if (editing.id) {
              carePlanApprovalChainsStore.deleteChain(editing.id);
              toast.success("Approval chain deleted");
              setEditing(null);
            }
          } : undefined}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ApprovalChainStatus }) {
  if (status === "active") return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200" variant="outline">Active</Badge>;
  if (status === "inactive") return <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>;
  return <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">Draft</Badge>;
}

// ---------- Editor dialog ----------

function ChainEditor({
  draft, onChange, onSave, onCancel, onDelete,
}: {
  draft: EditableChain;
  onChange: (d: EditableChain) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const terms = useTerms();
  const scopeOptions = useMemo(() => {
    switch (draft.scopeType) {
      case "organisation": return [{ id: "organisation", label: "Whole organisation" }];
      case "site": return ALL_SITES.map((s) => ({ id: s, label: s }));
      case "house": return ALL_SITES.map((s) => ({ id: s, label: s }));
      case "unit": return ALL_SITES.map((s) => ({ id: s, label: s }));
    }
  }, [draft.scopeType]);

  const updateLevel = (idx: number, patch: Partial<EditableLevel>) => {
    onChange({ ...draft, levels: draft.levels.map((l, i) => i === idx ? { ...l, ...patch } : l) });
  };
  const addLevel = () => {
    onChange({ ...draft, levels: [...draft.levels, { levelName: `Level ${draft.levels.length + 1}`, rule: "any_one", approvers: [{ name: "", email: "", roleLabel: "" }] }] });
  };
  const removeLevel = (idx: number) => {
    onChange({ ...draft, levels: draft.levels.filter((_, i) => i !== idx) });
  };
  const updateApprover = (li: number, ai: number, patch: Partial<EditablePerson>) => {
    updateLevel(li, { approvers: draft.levels[li].approvers.map((a, i) => i === ai ? { ...a, ...patch } : a) });
  };
  const addApprover = (li: number) => {
    updateLevel(li, { approvers: [...draft.levels[li].approvers, { name: "", email: "", roleLabel: "" }] });
  };
  const removeApprover = (li: number, ai: number) => {
    updateLevel(li, { approvers: draft.levels[li].approvers.filter((_, i) => i !== ai) });
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> {draft.id ? "Edit approval chain" : "Create approval chain"}</DialogTitle>
          <DialogDescription>
            Any change or new care plan for {terms.plural} in this scope will follow the approval chain below.
            Human approval required — AI drafts do not publish care plans.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Chain name</Label>
              <Input value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} placeholder="e.g. Oakfield Manor Care Plan Approval Chain" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={draft.status} onValueChange={(v) => onChange({ ...draft, status: v as ApprovalChainStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Textarea value={draft.description ?? ""} onChange={(e) => onChange({ ...draft, description: e.target.value })} rows={2} placeholder="What this chain covers…" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Scope type</Label>
              <Select value={draft.scopeType} onValueChange={(v) => {
                const st = v as ApprovalScopeType;
                const first = st === "organisation" ? "organisation" : (st === "site" ? ALL_SITES[0] : "");
                onChange({ ...draft, scopeType: st, scopeId: first, scopeLabel: first });
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="organisation">Whole organisation</SelectItem>
                  <SelectItem value="site">Site</SelectItem>
                  <SelectItem value="house">House</SelectItem>
                  <SelectItem value="unit">Unit / Wing</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Scope</Label>
              {draft.scopeType === "organisation" ? (
                <Input value="Whole organisation" disabled />
              ) : (scopeOptions.length > 0 && scopeOptions.some((o) => o.id === draft.scopeId)) ? (
                <Select value={draft.scopeId} onValueChange={(v) => onChange({ ...draft, scopeId: v, scopeLabel: scopeOptions.find((o) => o.id === v)?.label ?? v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {scopeOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={draft.scopeId} onChange={(e) => onChange({ ...draft, scopeId: e.target.value, scopeLabel: e.target.value })} placeholder="Enter scope name" />
              )}
            </div>
          </div>

          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium text-sm flex items-center gap-2"><UsersRound className="h-4 w-4 text-primary" /> Approval levels</div>
              <Button size="sm" variant="outline" onClick={addLevel}><Plus className="h-3.5 w-3.5 mr-1" /> Add level</Button>
            </div>

            <div className="space-y-3">
              {draft.levels.map((level, li) => (
                <div key={li} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">Level {li + 1}</Badge>
                    <Input className="flex-1" value={level.levelName} onChange={(e) => updateLevel(li, { levelName: e.target.value })} placeholder="Level name (e.g. PIC / Deputy PIC Review)" />
                    <Button size="icon" variant="ghost" onClick={() => removeLevel(li)} title="Remove level"><Trash2 className="h-4 w-4" /></Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Approval rule</Label>
                      <Select value={level.rule} onValueChange={(v) => updateLevel(li, { rule: v as ApprovalLevelRule })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any_one">Any one approver can approve</SelectItem>
                          <SelectItem value="all_required">All approvers required</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="text-xs text-muted-foreground self-end pb-2">
                      {level.rule === "any_one"
                        ? "Only one approval at this level is required — supports PIC/Deputy cover."
                        : "Every approver at this level must approve before the chain moves on."}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">Approvers</div>
                    {level.approvers.map((a, ai) => (
                      <div key={ai} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                        <Input value={a.name} onChange={(e) => updateApprover(li, ai, { name: e.target.value })} placeholder="Full name" />
                        <Input value={a.email} onChange={(e) => updateApprover(li, ai, { email: e.target.value })} placeholder="email@example.com" type="email" />
                        <Input value={a.roleLabel ?? ""} onChange={(e) => updateApprover(li, ai, { roleLabel: e.target.value })} placeholder="Role (optional)" />
                        <Button size="icon" variant="ghost" onClick={() => removeApprover(li, ai)} title="Remove approver"><X className="h-4 w-4" /></Button>
                      </div>
                    ))}
                    <Button size="sm" variant="ghost" onClick={() => addApprover(li)}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add approver
                    </Button>
                  </div>
                </div>
              ))}
              {draft.levels.length === 0 && (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground text-center">
                  No levels yet. Add at least one to save.
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between sm:items-center gap-2">
          <div>
            {onDelete && (
              <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={onDelete}>
                <Trash2 className="h-4 w-4 mr-1" /> Delete chain
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel}>Cancel</Button>
            <Button onClick={onSave}><Check className="h-4 w-4 mr-1" /> Save chain</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
