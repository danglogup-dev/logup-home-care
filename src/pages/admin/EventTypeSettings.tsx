import { useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck, Eye, EyeOff, MessageSquare, ChevronUp, ChevronDown,
  Plus, X, RotateCcw, Sparkles, Lock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useRole } from "@/hooks/useRole";
import {
  eventTypeSettingsStore, useEventTypeSettings, type EventTypeSettings,
} from "@/lib/eventTypeSettingsStore";
import type { EventType } from "@/lib/eventTypes";
import { NoAccessPanel } from "@/components/RoleContextBanner";

const fade = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };

export default function EventTypeSettingsPage() {
  const role = useRole();
  const settings = useEventTypeSettings();
  const [editing, setEditing] = useState<EventTypeSettings | null>(null);

  if (role.role !== "admin") {
    return <div className="p-6 md:p-8"><NoAccessPanel moduleLabel="Event Type settings" /></div>;
  }

  const toggleActive = (s: EventTypeSettings) => {
    eventTypeSettingsStore.update(s.type, { active: !s.active });
    toast(s.active ? "Event Type disabled" : "Event Type enabled", {
      description: `${s.type} ${s.active ? "will not appear for new submissions. Historical records remain visible." : "is now available for new submissions."}`,
    });
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <motion.div {...fade} className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <Lock className="h-3.5 w-3.5 text-primary" /> Admin only
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Event Type settings</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Configure the Event Types available across LogUp. Disabling a type hides it from new
            submissions — historical records continue to display.
          </p>
        </div>
        <Button variant="outline" onClick={() => { eventTypeSettingsStore.reset(); toast("Settings reset to defaults"); }}>
          <RotateCcw className="h-4 w-4 mr-1.5" /> Reset to defaults
        </Button>
      </motion.div>

      <div className="bg-card rounded-2xl shadow-soft border border-border overflow-hidden">
        <ul className="divide-y divide-border">
          {settings.map((s, i) => (
            <li key={s.type} className={`px-4 py-3 flex items-center gap-3 ${s.active ? "" : "opacity-60"}`}>
              <div className="flex flex-col gap-0.5">
                <button
                  aria-label="Move up"
                  disabled={i === 0}
                  onClick={() => eventTypeSettingsStore.reorder(s.type, "up")}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  aria-label="Move down"
                  disabled={i === settings.length - 1}
                  onClick={() => eventTypeSettingsStore.reorder(s.type, "down")}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-foreground">{s.type}</p>
                  {s.restrictedByDefault && (
                    <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/30 inline-flex items-center gap-1">
                      <EyeOff className="h-2.5 w-2.5" /> Restricted by default
                    </Badge>
                  )}
                  {s.requiresClosureApproval && (
                    <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">Closure approval</Badge>
                  )}
                  {s.requiresManagerReview && (
                    <Badge variant="outline" className="text-[10px] bg-secondary/60">Manager review</Badge>
                  )}
                  {s.missingInfoPrompts.length > 0 && (
                    <Badge variant="outline" className="text-[10px] bg-accent/10 text-accent border-accent/20 inline-flex items-center gap-1">
                      <Sparkles className="h-2.5 w-2.5" /> {s.missingInfoPrompts.length} AI prompt{s.missingInfoPrompts.length === 1 ? "" : "s"}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{s.description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">{s.active ? "Active" : "Disabled"}</span>
                  <Switch checked={s.active} onCheckedChange={() => toggleActive(s)} />
                </div>
                <Button variant="ghost" size="sm" onClick={() => setEditing(s)}>Edit</Button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[11px] text-muted-foreground italic">
        AI-first rule: required information is requested through short AI follow-up prompts in the
        capture flow — never as long manual forms. AI never decides whether an Event is reportable,
        resolved, or closed.
      </p>

      {editing && (
        <EditDialog
          settings={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            eventTypeSettingsStore.update(editing.type, patch);
            toast("Event Type updated", { description: editing.type });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function EditDialog({
  settings, onClose, onSave,
}: {
  settings: EventTypeSettings;
  onClose: () => void;
  onSave: (patch: Partial<EventTypeSettings>) => void;
}) {
  const [s, setS] = useState<EventTypeSettings>({ ...settings });
  const [newPrompt, setNewPrompt] = useState("");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{settings.type}</DialogTitle>
          <DialogDescription>
            Configure visibility defaults, review requirements, and the prompts AI uses to ask for
            missing information during capture.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea
              value={s.description}
              onChange={(e) => setS({ ...s, description: e.target.value })}
              className="mt-1.5 min-h-[60px]"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <ToggleRow label="Restricted by default"
              description="Hidden from frontline aggregate dashboards."
              checked={s.restrictedByDefault}
              onChange={(v) => setS({ ...s, restrictedByDefault: v })}
            />
            <ToggleRow label="Submitter can view own submission"
              checked={s.submitterCanViewOwn}
              onChange={(v) => setS({ ...s, submitterCanViewOwn: v })}
            />
            <ToggleRow label="Submitter can see status"
              checked={s.submitterCanSeeStatus}
              onChange={(v) => setS({ ...s, submitterCanSeeStatus: v })}
            />
            <ToggleRow label="Requires Manager/Admin review"
              checked={s.requiresManagerReview}
              onChange={(v) => setS({ ...s, requiresManagerReview: v })}
            />
            <ToggleRow label="Requires closure approval"
              checked={s.requiresClosureApproval}
              onChange={(v) => setS({ ...s, requiresClosureApproval: v })}
            />
          </div>

          <div>
            <Label className="text-xs">Default severity (optional)</Label>
            <Select
              value={s.defaultSeverity || "none"}
              onValueChange={(v) => setS({ ...s, defaultSeverity: v === "none" ? undefined : v as EventTypeSettings["defaultSeverity"] })}
            >
              <SelectTrigger className="mt-1.5 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No default</SelectItem>
                <SelectItem value="Low">Low</SelectItem>
                <SelectItem value="Moderate">Moderate</SelectItem>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <Label className="text-xs">AI follow-up prompts</Label>
            </div>
            <p className="text-[11px] text-muted-foreground mb-2">
              When captured information is missing, AI asks these short prompts — not long forms.
            </p>
            <ul className="space-y-1.5 mb-2">
              {s.missingInfoPrompts.map((p, i) => (
                <li key={i} className="flex items-center gap-2 bg-secondary/40 rounded-lg px-3 py-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm flex-1">{p}</span>
                  <button
                    onClick={() => setS({ ...s, missingInfoPrompts: s.missingInfoPrompts.filter((_, x) => x !== i) })}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Input
                placeholder="Add a short prompt, e.g. Who raised the complaint?"
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newPrompt.trim()) {
                    setS({ ...s, missingInfoPrompts: [...s.missingInfoPrompts, newPrompt.trim()] });
                    setNewPrompt("");
                  }
                }}
              />
              <Button
                variant="outline"
                onClick={() => {
                  if (!newPrompt.trim()) return;
                  setS({ ...s, missingInfoPrompts: [...s.missingInfoPrompts, newPrompt.trim()] });
                  setNewPrompt("");
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave({
            description: s.description,
            restrictedByDefault: s.restrictedByDefault,
            submitterCanViewOwn: s.submitterCanViewOwn,
            submitterCanSeeStatus: s.submitterCanSeeStatus,
            requiresManagerReview: s.requiresManagerReview,
            requiresClosureApproval: s.requiresClosureApproval,
            defaultSeverity: s.defaultSeverity,
            missingInfoPrompts: s.missingInfoPrompts,
          })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  label, description, checked, onChange,
}: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
