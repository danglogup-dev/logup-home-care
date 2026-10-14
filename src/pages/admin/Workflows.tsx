import { isManagerRole } from "@/lib/roleStore";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles, Plus, ShieldCheck, Lock, Power, PowerOff, Trash2, Pencil, History,
  Workflow as WorkflowIcon, Building2, AlertTriangle, ChevronRight, X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useRole } from "@/hooks/useRole";
import { EVENT_TYPES, type EventType } from "@/lib/eventTypes";
import {
  workflowsStore, useWorkflows, aiDraftWorkflow,
  workflowPermissionsStore, useWorkflowPermissions,
  TRIGGER_LABELS, ACTION_LABELS, RECIPIENT_LABELS,
  type Workflow, type WorkflowTrigger, type WorkflowAction, type WorkflowActionKind,
  type AlertRecipient, type RecipientKind,
} from "@/lib/workflowsStore";
import { ROLE_PRESETS, ALL_SITES } from "@/lib/roleStore";
import { NoAccessPanel } from "@/components/RoleContextBanner";

const fade = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };

export default function WorkflowsPage() {
  const role = useRole();
  const workflows = useWorkflows();
  const perms = useWorkflowPermissions();

  const isAdmin = role.role === "admin";
  const isManagerWithPerm = isManagerRole(role.role) && !!perms[role.displayName];
  const canCreate = isAdmin || isManagerWithPerm;
  const canAccessPage = isAdmin || isManagerRole(role.role);

  const [openBuilder, setOpenBuilder] = useState<{ mode: "create" | "edit"; wf?: Workflow } | null>(null);
  const [openAudit, setOpenAudit] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");

  // Scope: managers see their site workflows + organisation workflows applying to their sites.
  const visible = useMemo(() => {
    if (isAdmin) return workflows;
    return workflows.filter(w =>
      w.scopeSites.length === 0
      || w.scopeSites.some(s => role.scope.includes(s))
    );
  }, [workflows, isAdmin, role.scope]);

  if (!canAccessPage) {
    return <div className="p-6 md:p-8"><NoAccessPanel moduleLabel="Workflows" /></div>;
  }



  const canEdit = (w: Workflow): boolean => {
    if (isAdmin) return true;
    if (!isManagerWithPerm) return false;
    if (w.ownership === "organisation" || w.ownership === "locked") return false;
    return w.ownerName === role.displayName;
  };

  const handleAiDraft = () => {
    if (!aiPrompt.trim()) {
      toast.error("Describe the workflow in one short sentence first.");
      return;
    }
    const draft = aiDraftWorkflow({
      prompt: aiPrompt,
      byName: role.displayName,
      byRole: role.role,
      permittedSites: role.scope,
    });
    const created = workflowsStore.create(draft, role.displayName);
    workflowsStore.recordAudit(created.id, role.displayName,
      `AI draft generated from prompt: "${aiPrompt.trim()}"`);
    setAiPrompt("");
    setOpenBuilder({ mode: "edit", wf: created });
    toast("AI draft created", {
      description: "Review and activate — AI does not activate workflows automatically.",
    });
  };

  const newBlankWorkflow = (): Workflow => ({
    id: "__new__",
    name: "",
    description: "",
    active: false,
    ownership: isAdmin ? "organisation" : "site",
    ownerName: role.displayName,
    ownerRole: role.role,
    scopeSites: isAdmin ? [...ALL_SITES] : [...role.scope],
    trigger: "event_submitted",
    conditions: {},
    actions: [],
    requiresClosureApproval: false,
    createdAt: "",
    updatedAt: "",
    status: "draft",
  });

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <motion.div {...fade} className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <WorkflowIcon className="h-3.5 w-3.5 text-primary" /> Admin workflow builder
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Workflows</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            "When this happens → do this." Choose a trigger, choose who to alert, choose a follow-up
            — then activate. Humans approve, close, and decide. AI helps draft, never activates.
          </p>
        </div>
        {canCreate && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpenBuilder({ mode: "create", wf: newBlankWorkflow() })}>
              <Plus className="h-4 w-4 mr-1.5" /> New workflow
            </Button>
          </div>
        )}
      </motion.div>

      {canCreate && (
        <motion.div {...fade} className="bg-primary/[0.04] border border-primary/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Draft with AI</p>
            <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">Human reviews before activation</Badge>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Describe what you want in plain English. AI will draft the trigger, recipients, follow-up
            task and closure rule — you review, edit, and manually activate.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder='e.g. "For high priority complaints, notify the site manager and create a task due in 48 hours, require closure approval"'
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAiDraft(); }}
              className="flex-1"
            />
            <Button onClick={handleAiDraft}>
              <Sparkles className="h-4 w-4 mr-1.5" /> Draft workflow
            </Button>
          </div>
        </motion.div>
      )}

      <Tabs defaultValue="workflows" className="space-y-4">
        <TabsList>
          <TabsTrigger value="workflows">Workflows ({visible.length})</TabsTrigger>
          {isAdmin && <TabsTrigger value="permissions">Manager permissions</TabsTrigger>}
        </TabsList>

        <TabsContent value="workflows" className="space-y-3">
          {visible.length === 0 && (
            <div className="bg-card border border-dashed border-border rounded-2xl p-10 text-center">
              <WorkflowIcon className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">No workflows yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                {canCreate ? "Create one above, or draft with AI." : "Ask an Admin to create one."}
              </p>
            </div>
          )}
          {visible.map((wf) => (
            <WorkflowCard
              key={wf.id}
              wf={wf}
              canEdit={canEdit(wf)}
              isAdmin={isAdmin}
              onEdit={() => setOpenBuilder({ mode: "edit", wf })}
              onAudit={() => setOpenAudit(wf.id)}
              onToggle={() => {
                workflowsStore.setStatus(wf.id, wf.active ? "disabled" : "active", role.displayName);
                toast(wf.active ? "Workflow disabled" : "Workflow activated", { description: wf.name });
              }}
              onDelete={() => {
                if (!confirm(`Delete workflow "${wf.name}"?`)) return;
                workflowsStore.remove(wf.id, role.displayName);
                toast("Workflow deleted");
              }}
            />
          ))}
        </TabsContent>

        {isAdmin && (
          <TabsContent value="permissions" className="space-y-3">
            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Manage Site Workflows</h2>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Grant Managers the ability to create and edit workflows for their assigned sites.
                Managers cannot edit Admin-created or Locked workflows.
              </p>
              <ul className="divide-y divide-border">
                {ROLE_PRESETS.filter(p => p.role === "manager").map(p => (
                  <li key={p.id} className="py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{p.displayName}</p>
                      <p className="text-xs text-muted-foreground">{p.title} · scope: {p.scope.join(", ")}</p>
                    </div>
                    <Switch
                      checked={!!perms[p.displayName]}
                      onCheckedChange={(v) => {
                        workflowPermissionsStore.grant(p.displayName, v);
                        toast(v ? "Permission granted" : "Permission revoked", {
                          description: `${p.displayName} — Manage Site Workflows`,
                        });
                      }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </TabsContent>
        )}
      </Tabs>

      <p className="text-[11px] text-muted-foreground italic">
        AI may suggest workflow rules, recipients, follow-up tasks and missing-information prompts.
        AI never activates workflows, decides reportability, decides legal disclosure, or closes
        Events. Every workflow change is recorded in the audit trail.
      </p>

      {openBuilder && (
        <WorkflowBuilder
          mode={openBuilder.mode}
          initial={openBuilder.wf || newBlankWorkflow()}
          isAdmin={isAdmin}
          permittedSites={isAdmin ? [...ALL_SITES] : role.scope}
          byName={role.displayName}
          onClose={() => setOpenBuilder(null)}
        />
      )}

      {openAudit && (
        <AuditDialog workflowId={openAudit} onClose={() => setOpenAudit(null)} />
      )}
    </div>
  );
}

// ============ Workflow card ============
function WorkflowCard({
  wf, canEdit, isAdmin, onEdit, onAudit, onToggle, onDelete,
}: {
  wf: Workflow;
  canEdit: boolean;
  isAdmin: boolean;
  onEdit: () => void;
  onAudit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const ownershipBadge = {
    organisation: { label: "Organisation Workflow", cls: "bg-primary/10 text-primary border-primary/20" },
    site: { label: "Site Workflow", cls: "bg-secondary/60 text-foreground border-border" },
    locked: { label: "Locked Workflow", cls: "bg-warning/10 text-warning border-warning/30" },
    local: { label: "Local Workflow", cls: "bg-accent/10 text-accent border-accent/20" },
  }[wf.ownership];

  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="text-sm font-semibold text-foreground">{wf.name || "Untitled workflow"}</p>
            <Badge variant="outline" className={`text-[10px] ${ownershipBadge.cls}`}>{ownershipBadge.label}</Badge>
            {wf.aiDrafted && wf.status === "draft" && (
              <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20 inline-flex items-center gap-1">
                <Sparkles className="h-2.5 w-2.5" /> AI draft — review required
              </Badge>
            )}
            {wf.status === "active" && (
              <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/20">Active</Badge>
            )}
            {wf.status === "disabled" && (
              <Badge variant="outline" className="text-[10px] bg-muted/40 text-muted-foreground">Disabled</Badge>
            )}
            {wf.ownership === "locked" && <Lock className="h-3 w-3 text-warning" />}
          </div>
          {wf.description && <p className="text-xs text-muted-foreground leading-snug">{wf.description}</p>}

          <div className="mt-3 grid sm:grid-cols-3 gap-2 text-[11px]">
            <Cell label="When" value={TRIGGER_LABELS[wf.trigger]} icon={<AlertTriangle className="h-3 w-3" />} />
            <Cell label="Event Type" value={wf.conditions.eventType || "Any"} icon={<ChevronRight className="h-3 w-3" />} />
            <Cell label="Sites" value={wf.scopeSites.length === 0 ? "All" : wf.scopeSites.join(", ")} icon={<Building2 className="h-3 w-3" />} />
          </div>

          {wf.actions.length > 0 && (
            <ul className="mt-3 space-y-1">
              {wf.actions.map(a => (
                <li key={a.id} className="text-xs text-foreground inline-flex items-center gap-1.5 mr-3">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary inline-block" />
                  {a.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="sm" onClick={onAudit} title="Audit trail">
            <History className="h-4 w-4" />
          </Button>
          {canEdit && (
            <>
              <Button variant="ghost" size="sm" onClick={onEdit}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={onToggle}>
                {wf.active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4 text-success" />}
              </Button>
              {(isAdmin || wf.ownership === "site" || wf.ownership === "local") && (
                <Button variant="ghost" size="sm" onClick={onDelete}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Cell({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-secondary/40 rounded-lg px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xs font-medium text-foreground flex items-center gap-1 mt-0.5">{icon}{value}</p>
    </div>
  );
}

// ============ Workflow builder dialog ============
function WorkflowBuilder({
  mode, initial, isAdmin, permittedSites, byName, onClose,
}: {
  mode: "create" | "edit";
  initial: Workflow;
  isAdmin: boolean;
  permittedSites: string[];
  byName: string;
  onClose: () => void;
}) {
  const [w, setW] = useState<Workflow>({ ...initial });

  const addAction = (kind: WorkflowActionKind) => {
    const a: WorkflowAction = {
      id: `a${Date.now()}`,
      kind,
      label: ACTION_LABELS[kind],
    };
    if (kind === "in_app_alert" || kind === "email_alert") a.recipients = [{ kind: "site_manager" }];
    if (kind === "create_followup_task") a.dueRule = "48h";
    setW({ ...w, actions: [...w.actions, a] });
  };

  const updateAction = (id: string, patch: Partial<WorkflowAction>) => {
    setW({ ...w, actions: w.actions.map(a => a.id === id ? { ...a, ...patch } : a) });
  };
  const removeAction = (id: string) => setW({ ...w, actions: w.actions.filter(a => a.id !== id) });

  const save = (activate: boolean) => {
    if (!w.name.trim()) { toast.error("Give the workflow a name."); return; }
    if (w.actions.length === 0) { toast.error("Add at least one action."); return; }
    const status: Workflow["status"] = activate ? "active" : "draft";
    if (mode === "create" || w.id === "__new__") {
      const created = workflowsStore.create({
        ...w,
        active: activate,
        status,
        aiDrafted: false,
      }, byName);
      toast(activate ? "Workflow created and activated" : "Workflow saved as draft", { description: created.name });
    } else {
      workflowsStore.update(w.id, {
        ...w,
        active: activate ? true : w.active,
        status: activate ? "active" : w.status,
      }, byName);
      if (activate && !initial.active) {
        workflowsStore.setStatus(w.id, "active", byName);
      }
      toast("Workflow saved", { description: w.name });
    }
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New workflow" : "Edit workflow"}</DialogTitle>
          <DialogDescription>
            Choose trigger → choose who to alert → choose follow-up → activate. AI never activates a
            workflow on its own.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Workflow name</Label>
              <Input value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} className="mt-1.5" />
            </div>
            <div>
              <Label className="text-xs">Owner</Label>
              <Input value={w.ownerName} disabled className="mt-1.5 bg-secondary/40" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea value={w.description || ""} onChange={(e) => setW({ ...w, description: e.target.value })} className="mt-1.5 min-h-[60px]" />
          </div>

          {/* When */}
          <section className="rounded-xl border border-border bg-secondary/20 p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">When this happens</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Trigger</Label>
                <Select value={w.trigger} onValueChange={(v) => setW({ ...w, trigger: v as WorkflowTrigger })}>
                  <SelectTrigger className="mt-1.5 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TRIGGER_LABELS) as WorkflowTrigger[]).map(t => (
                      <SelectItem key={t} value={t}>{TRIGGER_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Event Type (optional)</Label>
                <Select
                  value={w.conditions.eventType || "any"}
                  onValueChange={(v) => setW({ ...w, conditions: { ...w.conditions, eventType: v === "any" ? undefined : v as EventType } })}
                >
                  <SelectTrigger className="mt-1.5 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any Event Type</SelectItem>
                    {EVENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Minimum severity (optional)</Label>
                <Select
                  value={w.conditions.minSeverity || "any"}
                  onValueChange={(v) => setW({ ...w, conditions: { ...w.conditions, minSeverity: v === "any" ? undefined : v as "Low" | "Moderate" | "High" | "Critical" } })}
                >
                  <SelectTrigger className="mt-1.5 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any severity</SelectItem>
                    <SelectItem value="Low">Low+</SelectItem>
                    <SelectItem value="Moderate">Moderate+</SelectItem>
                    <SelectItem value="High">High+</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <label className="inline-flex items-center gap-2 text-xs">
                  <Switch
                    checked={!!w.conditions.onlyRestricted}
                    onCheckedChange={(v) => setW({ ...w, conditions: { ...w.conditions, onlyRestricted: v } })}
                  />
                  Only restricted Events
                </label>
              </div>
            </div>

            <div className="mt-3">
              <Label className="text-xs">Applies to sites</Label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {permittedSites.map(s => {
                  const checked = w.scopeSites.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setW({ ...w, scopeSites: checked ? w.scopeSites.filter(x => x !== s) : [...w.scopeSites, s] })}
                      className={`text-xs px-3 py-1.5 rounded-full border ${checked ? "bg-primary/10 text-primary border-primary/30" : "bg-background border-border text-muted-foreground"}`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
              {!isAdmin && (
                <p className="text-[10px] text-muted-foreground italic mt-2">
                  Managers can only scope workflows to their assigned sites.
                </p>
              )}
            </div>
          </section>

          {/* Do this */}
          <section className="rounded-xl border border-border bg-secondary/20 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Do this</p>
              <Select value="" onValueChange={(v) => v && addAction(v as WorkflowActionKind)}>
                <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue placeholder="+ Add action" /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ACTION_LABELS) as WorkflowActionKind[]).map(k => (
                    <SelectItem key={k} value={k}>{ACTION_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {w.actions.length === 0 && (
              <p className="text-xs text-muted-foreground italic">No actions yet. Add at least one.</p>
            )}

            <ul className="space-y-2">
              {w.actions.map(a => (
                <li key={a.id} className="bg-background rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{ACTION_LABELS[a.kind]}</p>
                      <Input
                        value={a.label}
                        onChange={(e) => updateAction(a.id, { label: e.target.value })}
                        className="mt-1.5 h-8 text-xs"
                        placeholder="Audit-trail label, e.g. Alert Site Manager"
                      />
                      {(a.kind === "in_app_alert" || a.kind === "email_alert") && (
                        <div className="mt-2">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Recipients</Label>
                          <RecipientsEditor
                            value={a.recipients || []}
                            onChange={(r) => updateAction(a.id, { recipients: r })}
                          />
                        </div>
                      )}
                      {a.kind === "create_followup_task" && (
                        <div className="mt-2 grid sm:grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Due in</Label>
                            <Input value={a.dueRule || ""} onChange={(e) => updateAction(a.id, { dueRule: e.target.value })} placeholder="48h" className="mt-1 h-8 text-xs" />
                          </div>
                          <div>
                            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Owner hint</Label>
                            <Input value={a.ownerHint || ""} onChange={(e) => updateAction(a.id, { ownerHint: e.target.value })} placeholder="Site Manager" className="mt-1 h-8 text-xs" />
                          </div>
                        </div>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeAction(a.id)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <div className="rounded-xl border border-border bg-background p-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Require Manager/Admin closure approval</p>
              <p className="text-[11px] text-muted-foreground">Events from this workflow cannot be closed until approved.</p>
            </div>
            <Switch checked={w.requiresClosureApproval} onCheckedChange={(v) => setW({ ...w, requiresClosureApproval: v })} />
          </div>

          <p className="text-[11px] text-muted-foreground italic leading-snug">
            AI cannot auto-close, auto-approve, or make final compliance decisions. Workflows
            execute the actions chosen here; humans review, approve and close. Alerts to users with
            limited permissions never reveal restricted Event details — they say only what the
            recipient is allowed to know.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="outline" onClick={() => save(false)}>Save as draft</Button>
          <Button onClick={() => save(true)}>Save & activate</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ Recipients editor ============
function RecipientsEditor({
  value, onChange,
}: { value: AlertRecipient[]; onChange: (r: AlertRecipient[]) => void }) {
  const add = (kind: RecipientKind) => onChange([...value, { kind }]);
  const remove = (i: number) => onChange(value.filter((_, x) => x !== i));
  return (
    <div className="mt-1 space-y-1.5">
      {value.length === 0 && <p className="text-[11px] text-muted-foreground italic">No recipients yet.</p>}
      <ul className="space-y-1">
        {value.map((r, i) => (
          <li key={i} className="flex items-center gap-2 bg-secondary/40 rounded-md px-2 py-1 text-xs">
            <span className="flex-1">{RECIPIENT_LABELS[r.kind]}{r.value ? ` — ${r.value}` : ""}</span>
            <button onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>
      <Select value="" onValueChange={(v) => v && add(v as RecipientKind)}>
        <SelectTrigger className="h-7 w-[200px] text-xs"><SelectValue placeholder="+ Add recipient" /></SelectTrigger>
        <SelectContent>
          {(Object.keys(RECIPIENT_LABELS) as RecipientKind[]).map(k => (
            <SelectItem key={k} value={k}>{RECIPIENT_LABELS[k]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ============ Audit dialog ============
function AuditDialog({ workflowId, onClose }: { workflowId: string; onClose: () => void }) {
  const entries = workflowsStore.getAuditFor(workflowId);
  const wf = workflowsStore.getById(workflowId);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Workflow audit trail</DialogTitle>
          <DialogDescription>{wf?.name || "Workflow"}</DialogDescription>
        </DialogHeader>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No audit entries yet.</p>
        ) : (
          <ul className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {entries.map(e => (
              <li key={e.id} className="text-xs bg-background border border-border rounded-md px-3 py-2">
                <span className="text-muted-foreground font-mono mr-2">{e.ts}</span>
                {e.event}
                <span className="text-muted-foreground"> — {e.by}</span>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
