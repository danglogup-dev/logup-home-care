import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  GitBranch,
  Plus,
  Star,
  Trash2,
  Users,
  X,
  Pencil,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  policiesStore,
  ApprovalChainTemplate,
  DEFAULT_APPROVERS,
  PolicyCategory,
  TopicGroup,
} from "@/lib/policiesStore";
import { toast } from "sonner";

type LevelDraft = {
  id: string;
  role: string;
  name: string;
  coApprovers: { role: string; name: string }[];
};

const CATEGORIES: PolicyCategory[] = ["Policy", "Procedure", "Template", "Operational", "Guidance"];

const newId = () => `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

const blankLevel = (): LevelDraft => ({
  id: newId(),
  role: DEFAULT_APPROVERS[0].role,
  name: DEFAULT_APPROVERS[0].name,
  coApprovers: [],
});

export default function ApprovalChainTemplates() {
  const navigate = useNavigate();
  const [, force] = useState(0);
  useEffect(() => policiesStore.subscribe(() => force((n) => n + 1)), []);

  const templates = policiesStore.listTemplates();
  const topics = policiesStore.topicGroups();

  const [editing, setEditing] = useState<ApprovalChainTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  const open = (t: ApprovalChainTemplate | null) => {
    setEditing(t);
    setCreating(t === null);
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate("/app/policies/library")} className="-ml-2">
          <ArrowLeft className="mr-2 h-4 w-4" /> Policy Hub
        </Button>
        <Button onClick={() => open(null)}>
          <Plus className="mr-2 h-4 w-4" /> New chain template
        </Button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <GitBranch className="h-4 w-4" />
          <span>Admin · Approval workflows</span>
        </div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          Approval chain templates
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Define standard approval chains and assign them to topics or document types. When a draft is submitted,
          the matching template is applied automatically. Owners can still customise the chain on individual
          documents. Each level can have a primary approver plus optional co-approvers — any one of them can
          approve, so the chain keeps moving when someone is away.
        </p>
      </div>

      <div className="grid gap-3">
        {templates.length === 0 && (
          <Card className="rounded-2xl border-dashed">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No templates yet. Create one to get started.
            </CardContent>
          </Card>
        )}
        {templates.map((t) => (
          <Card key={t.id} className="rounded-2xl border-border/60 shadow-sm">
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading text-base font-semibold text-foreground">{t.name}</h3>
                    {t.isDefault && (
                      <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-900">
                        <Star className="h-3 w-3" /> Default
                      </Badge>
                    )}
                    <Badge variant="secondary" className="rounded-full">
                      {t.levels.length} level{t.levels.length === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  {t.description && (
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {t.topics.length === 0 && t.categories.length === 0 && !t.isDefault && (
                      <span className="text-xs text-muted-foreground">No auto-assignment rules.</span>
                    )}
                    {t.topics.map((tp) => (
                      <Badge key={tp} variant="outline" className="bg-secondary text-foreground">
                        {tp}
                      </Badge>
                    ))}
                    {t.categories.map((c) => (
                      <Badge key={c} variant="outline" className="border-blue-200 bg-blue-50 text-blue-900">
                        {c}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => open(t)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => {
                      if (window.confirm(`Delete template "${t.name}"?`)) {
                        policiesStore.deleteTemplate(t.id);
                        toast("Template deleted");
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {/* Level preview */}
              <ol className="space-y-1.5">
                {t.levels.map((lv, idx) => (
                  <li
                    key={idx}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-secondary/30 px-2.5 py-1.5"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-background text-[11px] font-semibold text-foreground">
                      {idx + 1}
                    </span>
                    <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">{lv.name}</span>
                    <span className="text-xs text-muted-foreground">({lv.role})</span>
                    {lv.coApprovers && lv.coApprovers.length > 0 && (
                      <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        <Users className="h-3 w-3" /> or {lv.coApprovers.map((c) => c.name).join(", ")}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        ))}
      </div>

      <TemplateEditor
        open={editing !== null || creating}
        template={editing}
        topics={topics}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
      />
    </div>
  );
}

// ---------- Editor dialog ----------
function TemplateEditor({
  open,
  template,
  topics,
  onClose,
}: {
  open: boolean;
  template: ApprovalChainTemplate | null;
  topics: TopicGroup[];
  onClose: () => void;
}) {
  const isEdit = !!template;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [selTopics, setSelTopics] = useState<TopicGroup[]>([]);
  const [selCats, setSelCats] = useState<PolicyCategory[]>([]);
  const [levels, setLevels] = useState<LevelDraft[]>([blankLevel()]);

  useEffect(() => {
    if (!open) return;
    if (template) {
      setName(template.name);
      setDescription(template.description || "");
      setIsDefault(!!template.isDefault);
      setSelTopics(template.topics);
      setSelCats(template.categories);
      setLevels(
        template.levels.map((l) => ({
          id: newId(),
          role: l.role,
          name: l.name,
          coApprovers: l.coApprovers ? [...l.coApprovers] : [],
        })),
      );
    } else {
      setName("");
      setDescription("");
      setIsDefault(false);
      setSelTopics([]);
      setSelCats([]);
      setLevels([blankLevel()]);
    }
  }, [open, template]);

  const move = (idx: number, dir: -1 | 1) => {
    setLevels((prev) => {
      const next = [...prev];
      const t = idx + dir;
      if (t < 0 || t >= next.length) return prev;
      [next[idx], next[t]] = [next[t], next[idx]];
      return next;
    });
  };

  const updateLevel = (id: string, patch: Partial<LevelDraft>) => {
    setLevels((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const addCo = (id: string) => {
    const fallback = DEFAULT_APPROVERS[1] || DEFAULT_APPROVERS[0];
    setLevels((prev) =>
      prev.map((l) =>
        l.id === id
          ? { ...l, coApprovers: [...l.coApprovers, { role: fallback.role, name: fallback.name }] }
          : l,
      ),
    );
  };

  const removeCo = (id: string, idx: number) => {
    setLevels((prev) =>
      prev.map((l) =>
        l.id === id ? { ...l, coApprovers: l.coApprovers.filter((_, i) => i !== idx) } : l,
      ),
    );
  };

  const updateCo = (id: string, idx: number, patch: { role?: string; name?: string }) => {
    setLevels((prev) =>
      prev.map((l) =>
        l.id === id
          ? {
              ...l,
              coApprovers: l.coApprovers.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
            }
          : l,
      ),
    );
  };

  const valid = useMemo(() => {
    if (!name.trim()) return false;
    if (levels.length === 0) return false;
    return levels.every((l) => l.role.trim() && l.name.trim());
  }, [name, levels]);

  const handleSave = () => {
    if (!valid) return;
    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      isDefault,
      topics: selTopics,
      categories: selCats,
      levels: levels.map((l) => ({
        role: l.role.trim(),
        name: l.name.trim(),
        coApprovers: l.coApprovers
          .filter((c) => c.role.trim() && c.name.trim())
          .map((c) => ({ role: c.role.trim(), name: c.name.trim() })),
      })),
    };
    if (isEdit && template) {
      policiesStore.updateTemplate(template.id, payload);
      toast("Template updated");
    } else {
      policiesStore.addTemplate(payload);
      toast("Template created");
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit chain template" : "New chain template"}</DialogTitle>
          <DialogDescription>
            Give the chain a name, define each approval level, and pick the topics or document types it should
            apply to automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Template name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Clinical & medication"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description (optional)</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="When should this chain be used?"
              className="min-h-[64px]"
            />
          </div>

          {/* Levels */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Approval levels</label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLevels((p) => [...p, blankLevel()])}
              >
                <Plus className="mr-2 h-3.5 w-3.5" /> Add level
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Each level has one primary approver. Add co-approvers if anyone of them can approve to keep the
              chain moving.
            </p>

            <ol className="space-y-2">
              {levels.map((lv, idx) => (
                <li
                  key={lv.id}
                  className="space-y-2 rounded-xl border border-border/60 bg-secondary/30 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold text-foreground">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Level {idx + 1}
                    </span>
                    <div className="ml-auto flex items-center gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        disabled={idx === 0}
                        onClick={() => move(idx, -1)}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        disabled={idx === levels.length - 1}
                        onClick={() => move(idx, 1)}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={levels.length <= 1}
                        onClick={() => setLevels((p) => p.filter((x) => x.id !== lv.id))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <ApproverRow
                    role={lv.role}
                    name={lv.name}
                    label="Primary approver"
                    onChange={(p) => updateLevel(lv.id, p)}
                  />

                  {lv.coApprovers.map((co, ci) => (
                    <div
                      key={ci}
                      className="flex items-end gap-2 rounded-lg border border-dashed border-border/80 bg-background p-2"
                    >
                      <div className="flex-1">
                        <ApproverRow
                          role={co.role}
                          name={co.name}
                          label={`Co-approver — either can approve`}
                          onChange={(p) => updateCo(lv.id, ci, p)}
                        />
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 text-muted-foreground"
                        onClick={() => removeCo(lv.id, ci)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}

                  {lv.coApprovers.length < 2 && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => addCo(lv.id)}>
                      <Plus className="mr-1 h-3 w-3" /> Add co-approver
                    </Button>
                  )}
                </li>
              ))}
            </ol>
          </div>

          {/* Auto-assignment rules */}
          <div className="space-y-3 rounded-xl border border-border/60 bg-background p-3">
            <p className="text-sm font-medium">Auto-assign rules</p>
            <p className="text-xs text-muted-foreground">
              When a draft is submitted, the most specific match is applied. Leave both empty to use this only
              when manually picked or as the default fallback.
            </p>

            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Topics</p>
              <div className="flex flex-wrap gap-1.5">
                {topics.map((t) => {
                  const on = selTopics.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() =>
                        setSelTopics((p) => (on ? p.filter((x) => x !== t) : [...p, t]))
                      }
                      className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Document types</p>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => {
                  const on = selCats.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSelCats((p) => (on ? p.filter((x) => x !== c) : [...p, c]))}
                      className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 pt-1">
              <Checkbox checked={isDefault} onCheckedChange={(v) => setIsDefault(!!v)} />
              <span className="text-sm">
                Use as default fallback when no topic / type matches
              </span>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!valid}>
            <CheckCircle2 className="mr-2 h-4 w-4" /> {isEdit ? "Save changes" : "Create template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApproverRow({
  role,
  name,
  label,
  onChange,
}: {
  role: string;
  name: string;
  label: string;
  onChange: (patch: { role?: string; name?: string }) => void;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <div className="space-y-1">
        <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label} · role
        </label>
        <Select
          value={role}
          onValueChange={(v) => {
            const match = DEFAULT_APPROVERS.find((a) => a.role === v);
            onChange({ role: v, name: match?.name ?? name });
          }}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DEFAULT_APPROVERS.map((a) => (
              <SelectItem key={a.role} value={a.role}>
                {a.role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
        <Input value={name} onChange={(e) => onChange({ name: e.target.value })} className="h-9 text-sm" />
      </div>
    </div>
  );
}
