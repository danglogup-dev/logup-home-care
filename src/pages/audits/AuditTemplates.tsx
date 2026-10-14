import { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Plus, Trash2, Pencil, Copy, GripVertical, Save,
  ClipboardList, RefreshCw, FileText, Search, ChevronUp, ChevronDown, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  auditTemplatesStore, useAuditTemplates, AuditTemplate, Recurrence,
  TEMPLATE_CATEGORIES,
} from "@/lib/auditTemplatesStore";

const fade = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };

type DraftTemplate = {
  name: string;
  category: string;
  recurring: boolean;
  recurrence: Recurrence;
  guidance: string;
  items: string[];
};

const emptyDraft = (): DraftTemplate => ({
  name: "",
  category: "Clinical / Care",
  recurring: true,
  recurrence: "Monthly",
  guidance: "",
  items: [""],
});

const fromTemplate = (t: AuditTemplate): DraftTemplate => ({
  name: t.name,
  category: t.category ?? "Clinical / Care",
  recurring: t.recurring,
  recurrence: t.recurrence ?? "Monthly",
  guidance: t.guidance ?? "",
  items: t.items.length ? [...t.items] : [""],
});

const AuditTemplates = () => {
  const templates = useAuditTemplates();
  const [params, setParams] = useSearchParams();

  const editingId = params.get("tpl");
  const isCreating = params.get("new") === "1";
  const editing = editingId ? templates.find((t) => t.id === editingId) : undefined;
  const inEditor = isCreating || !!editing;

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [draft, setDraft] = useState<DraftTemplate>(emptyDraft());
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Sync draft with route state
  useEffect(() => {
    if (isCreating) setDraft(emptyDraft());
    else if (editing) setDraft(fromTemplate(editing));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, isCreating]);

  const openNew = () => setParams({ new: "1" });
  const openEdit = (id: string) => setParams({ tpl: id });
  const closeEditor = () => setParams({});

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [templates, search, categoryFilter]);

  const updateItem = (i: number, val: string) => {
    setDraft((d) => ({ ...d, items: d.items.map((it, idx) => (idx === i ? val : it)) }));
  };
  const addItem = () => setDraft((d) => ({ ...d, items: [...d.items, ""] }));
  const removeItem = (i: number) =>
    setDraft((d) => ({ ...d, items: d.items.filter((_, idx) => idx !== i) }));
  const moveItem = (i: number, dir: -1 | 1) => {
    setDraft((d) => {
      const next = [...d.items];
      const target = i + dir;
      if (target < 0 || target >= next.length) return d;
      [next[i], next[target]] = [next[target], next[i]];
      return { ...d, items: next };
    });
  };
  const reorderItem = (from: number, to: number) => {
    setDraft((d) => {
      if (from === to || from < 0 || to < 0 || from >= d.items.length || to >= d.items.length) return d;
      const next = [...d.items];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...d, items: next };
    });
  };

  const canSave = draft.name.trim() && draft.items.some((i) => i.trim());

  const save = () => {
    const cleaned = {
      name: draft.name.trim(),
      category: draft.category,
      recurring: draft.recurring,
      recurrence: draft.recurring ? draft.recurrence : undefined,
      guidance: draft.guidance.trim() || undefined,
      items: draft.items.map((i) => i.trim()).filter(Boolean),
    };
    if (editing) {
      auditTemplatesStore.update(editing.id, cleaned);
      toast("Template updated", { description: `${cleaned.name} saved.` });
    } else {
      auditTemplatesStore.create(cleaned);
      toast("Template created", { description: `${cleaned.name} added to library.` });
    }
    closeEditor();
  };

  const handleDelete = (id: string) => {
    const t = templates.find((x) => x.id === id);
    auditTemplatesStore.remove(id);
    setConfirmDeleteId(null);
    toast("Template deleted", { description: t ? `${t.name} removed.` : undefined });
  };

  const handleDuplicate = (id: string) => {
    const t = auditTemplatesStore.duplicate(id);
    if (t) toast("Template duplicated", { description: `${t.name} created.` });
  };

  // ---------- Editor view ----------
  if (inEditor) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 pb-20">
        <motion.div {...fade}>
          <Button
            variant="ghost"
            size="sm"
            className="mb-4 -ml-2 text-muted-foreground"
            onClick={closeEditor}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to templates
          </Button>
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h1 className="font-heading text-2xl font-bold text-foreground">
                {editing ? "Edit template" : "New audit template"}
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                {editing
                  ? `Last updated ${new Date(editing.updatedAt).toLocaleDateString()}`
                  : "Define checklist items, recurrence, and regulatory guidance."}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="h-9 rounded-xl" onClick={closeEditor}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-9 rounded-xl font-semibold"
                disabled={!canSave}
                onClick={save}
              >
                <Save className="h-4 w-4 mr-1" />
                {editing ? "Save changes" : "Create template"}
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Details */}
        <motion.div
          {...fade}
          transition={{ delay: 0.06 }}
          className="mt-6 bg-card rounded-2xl border border-border shadow-soft p-5 space-y-4"
        >
          <h3 className="font-heading font-semibold text-sm text-foreground">Details</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs">Template name *</Label>
              <Input
                placeholder="e.g. Hand hygiene compliance audit"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                className="h-9 rounded-xl text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select
                value={draft.category}
                onValueChange={(v) => setDraft((d) => ({ ...d, category: v }))}
              >
                <SelectTrigger className="h-9 rounded-xl text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Recurrence</Label>
              <div className="flex items-center gap-3 h-9">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={draft.recurring}
                    onCheckedChange={(v) => setDraft((d) => ({ ...d, recurring: v }))}
                  />
                  <span className="text-sm text-muted-foreground">
                    {draft.recurring ? "Recurring" : "One-off"}
                  </span>
                </div>
                {draft.recurring && (
                  <Select
                    value={draft.recurrence}
                    onValueChange={(v) =>
                      setDraft((d) => ({ ...d, recurrence: v as Recurrence }))
                    }
                  >
                    <SelectTrigger className="h-9 rounded-xl text-sm flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Weekly">Weekly</SelectItem>
                      <SelectItem value="Monthly">Monthly</SelectItem>
                      <SelectItem value="Quarterly">Quarterly</SelectItem>
                      <SelectItem value="Annually">Annually</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs">Regulatory guidance / reference</Label>
              <Textarea
                placeholder="e.g. HIQA Standards 2024 — Regulation 27"
                value={draft.guidance}
                onChange={(e) => setDraft((d) => ({ ...d, guidance: e.target.value }))}
                className="rounded-xl text-sm min-h-[64px]"
              />
            </div>
          </div>
        </motion.div>

        {/* Checklist items */}
        <motion.div
          {...fade}
          transition={{ delay: 0.1 }}
          className="mt-4 bg-card rounded-2xl border border-border shadow-soft p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading font-semibold text-sm text-foreground">
              Checklist items
              <span className="ml-2 text-muted-foreground font-normal">
                ({draft.items.filter((i) => i.trim()).length})
              </span>
            </h3>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-xl text-xs"
              onClick={addItem}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add item
            </Button>
          </div>
          <div className="space-y-2">
            {draft.items.map((item, i) => (
              <div
                key={i}
                draggable
                onDragStart={(e) => {
                  setDragIndex(i);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(i));
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverIndex !== i) setDragOverIndex(i);
                }}
                onDragLeave={() => {
                  if (dragOverIndex === i) setDragOverIndex(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = dragIndex ?? Number(e.dataTransfer.getData("text/plain"));
                  if (!Number.isNaN(from)) reorderItem(from, i);
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
                className={`group flex items-center gap-2 bg-background border rounded-xl px-2 py-1.5 transition-all ${
                  dragIndex === i ? "opacity-40" : ""
                } ${
                  dragOverIndex === i && dragIndex !== i
                    ? "border-primary ring-2 ring-primary/20"
                    : "border-border"
                }`}
              >
                <span
                  className="cursor-grab active:cursor-grabbing p-1 -ml-1 text-muted-foreground/50 hover:text-foreground transition-colors shrink-0"
                  title="Drag to reorder"
                  aria-label="Drag to reorder"
                >
                  <GripVertical className="h-4 w-4" />
                </span>
                <span className="text-[11px] font-mono text-muted-foreground w-6 text-center shrink-0">
                  {i + 1}
                </span>
                <Input
                  value={item}
                  placeholder="Checklist item description"
                  onChange={(e) => updateItem(i, e.target.value)}
                  className="h-8 border-none shadow-none focus-visible:ring-0 px-1 text-sm bg-transparent"
                />
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={i === 0}
                    onClick={() => moveItem(i, -1)}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={i === draft.items.length - 1}
                    onClick={() => moveItem(i, 1)}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    disabled={draft.items.length === 1}
                    onClick={() => removeItem(i)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {!draft.items.some((i) => i.trim()) && (
            <p className="text-xs text-muted-foreground mt-3">
              Add at least one checklist item to save the template.
            </p>
          )}
        </motion.div>
      </div>
    );
  }

  // ---------- List view ----------
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 pb-20">
      <motion.div {...fade}>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">Audit templates</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {templates.length} templates · the building blocks for every audit.
            </p>
          </div>
          <Button
            size="sm"
            className="h-9 rounded-xl font-semibold text-sm"
            onClick={openNew}
          >
            <Plus className="h-4 w-4 mr-1" /> New template
          </Button>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div
        {...fade}
        transition={{ delay: 0.06 }}
        className="mt-5 flex flex-wrap items-center gap-2"
      >
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-9 rounded-xl text-sm"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-9 w-[180px] rounded-xl text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {TEMPLATE_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </motion.div>

      {/* Template list */}
      <div className="mt-6 space-y-2">
        <AnimatePresence initial={false}>
          {filtered.map((t, idx) => (
            <motion.div
              key={t.id}
              {...fade}
              transition={{ delay: Math.min(idx * 0.03, 0.18) }}
              className="group bg-card rounded-xl border border-border shadow-soft p-4 hover:border-primary/30 hover:shadow-card transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  className="flex items-start gap-3 text-left flex-1 min-w-0"
                  onClick={() => openEdit(t.id)}
                >
                  <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <ClipboardList className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-foreground truncate">
                        {t.name}
                      </h3>
                      {t.category && (
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-secondary text-foreground border-border font-medium"
                        >
                          {t.category}
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-3 mt-1.5 flex-wrap text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        {t.items.length} items
                      </span>
                      {t.recurring && (
                        <span className="flex items-center gap-1">
                          <RefreshCw className="h-3 w-3" /> {t.recurrence}
                        </span>
                      )}
                      {t.guidance && (
                        <span className="flex items-center gap-1 text-primary truncate max-w-[280px]">
                          <FileText className="h-3 w-3 shrink-0" />
                          <span className="truncate">{t.guidance}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Edit"
                    onClick={() => openEdit(t.id)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Duplicate"
                    onClick={() => handleDuplicate(t.id)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    title="Delete"
                    onClick={() => setConfirmDeleteId(t.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {filtered.length === 0 && (
          <div className="bg-card rounded-xl border border-dashed border-border p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No templates match your filters.
            </p>
          </div>
        )}
      </div>

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>
              Existing audits using this template will keep their checklist, but it
              will no longer be available for new audits.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AuditTemplates;
