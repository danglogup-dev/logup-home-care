import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List as ListIcon,
  ListOrdered,
  Link as LinkIcon,
  Paperclip,
  X,
  Save,
  Send,
  Upload,
  FileText,
  Info,
  Pilcrow,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Plus,
  Eye,
  CheckCircle2,
  Clock,
  CornerUpLeft,
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
import {
  policiesStore,
  PolicyCategory,
  Attachment,
  ApprovalStep,
  DEFAULT_APPROVERS,
} from "@/lib/policiesStore";
import { toast } from "sonner";

const categories: PolicyCategory[] = ["Policy", "Procedure", "Template", "Operational", "Guidance"];

type ChainDraftStep = {
  id: string;
  role: string;
  name: string;
  coApprovers: { role: string; name: string }[];
};

const newStepId = () => `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export default function PolicyEditor() {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const versionId = searchParams.get("v") || "";
  const navigate = useNavigate();

  const [, force] = useState(0);
  useEffect(() => policiesStore.subscribe(() => force((n) => n + 1)), []);

  const doc = policiesStore.get(id);
  const version = useMemo(() => policiesStore.getVersion(versionId), [versionId]);
  const live = policiesStore.getLiveVersion(id);

  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(doc?.title || "");
  const [category, setCategory] = useState<PolicyCategory>(doc?.category || "Policy");
  const [tagsInput, setTagsInput] = useState((doc?.tags || []).join(", "));
  const [attachments, setAttachments] = useState<Attachment[]>(version?.attachments || []);
  const [changeSummary, setChangeSummary] = useState(version?.changeSummary || "");
  const [hydrated, setHydrated] = useState(false);
  const [activeFormats, setActiveFormats] = useState<Record<string, boolean>>({});
  const [activeBlock, setActiveBlock] = useState<string>("p");

  // Approval chain — init from existing chain, else from matched template
  const matchedTemplate = useMemo(
    () => (doc ? policiesStore.matchTemplateForDoc(doc) : undefined),
    [doc?.id, doc?.topicGroup, doc?.category],
  );
  const initChain: ChainDraftStep[] = useMemo(() => {
    if (version?.approvalChain && version.approvalChain.length) {
      return version.approvalChain.map((s) => ({
        id: s.id,
        role: s.role,
        name: s.name,
        coApprovers: s.coApprovers ? [...s.coApprovers] : [],
      }));
    }
    if (matchedTemplate) {
      return matchedTemplate.levels.map((l) => ({
        id: newStepId(),
        role: l.role,
        name: l.name,
        coApprovers: l.coApprovers ? [...l.coApprovers] : [],
      }));
    }
    return [
      { id: newStepId(), role: "Director of Nursing", name: "Marie Doherty", coApprovers: [] },
      { id: newStepId(), role: "Chief Governance / Quality Officer", name: "Conor Hughes", coApprovers: [] },
    ];
  }, [version?.id, matchedTemplate?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [chain, setChain] = useState<ChainDraftStep[]>(initChain);
  const [showAddApprover, setShowAddApprover] = useState(false);
  const [newApproverRole, setNewApproverRole] = useState(DEFAULT_APPROVERS[0].role);
  const [newApproverName, setNewApproverName] = useState(DEFAULT_APPROVERS[0].name);

  useEffect(() => {
    if (!editorRef.current || !version || hydrated) return;
    editorRef.current.innerHTML = version.bodyHtml;
    setHydrated(true);
  }, [version, hydrated]);

  // Track formatting state on selection change so toolbar buttons highlight correctly
  useEffect(() => {
    const update = () => {
      if (!editorRef.current) return;
      const sel = window.getSelection();
      if (!sel || !sel.anchorNode || !editorRef.current.contains(sel.anchorNode)) return;
      try {
        setActiveFormats({
          bold: document.queryCommandState("bold"),
          italic: document.queryCommandState("italic"),
          ul: document.queryCommandState("insertUnorderedList"),
          ol: document.queryCommandState("insertOrderedList"),
        });
        const block = (document.queryCommandValue("formatBlock") || "").toLowerCase().replace(/[<>]/g, "");
        setActiveBlock(block || "p");
      } catch {
        // ignore
      }
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, []);

  if (!doc || !version) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate("/app/policies")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Policy Hub
        </Button>
        <Card className="rounded-2xl">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Draft not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  const isReadOnly = version.status === "in_review" || version.status === "approved";

  const focusEditor = () => editorRef.current?.focus();

  const exec = (cmd: string, value?: string) => {
    focusEditor();
    document.execCommand(cmd, false, value);
  };

  const setBlock = (tag: string) => {
    focusEditor();
    // execCommand "formatBlock" expects <h1> etc. in some browsers; either form usually works.
    document.execCommand("formatBlock", false, `<${tag}>`);
    setActiveBlock(tag);
  };

  const toggleList = (cmd: "insertUnorderedList" | "insertOrderedList") => {
    focusEditor();
    document.execCommand(cmd, false);
  };

  const insertLink = () => {
    const url = window.prompt("Link URL", "https://");
    if (!url) return;
    focusEditor();
    document.execCommand("createLink", false, url);
  };

  const buildPatch = () => ({
    bodyHtml: editorRef.current?.innerHTML || version.bodyHtml,
    changeSummary,
    attachments,
    title: title.trim() || doc.title,
    category,
    tags: tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  });

  const handleSave = () => {
    policiesStore.saveDraft(version.id, buildPatch());
    toast("Draft saved", { description: "Live published version remains visible to staff." });
  };

  const handleSubmit = () => {
    if (!changeSummary.trim()) {
      toast.error("Summary of changes required", { description: "Add a short summary so reviewers know what's changed." });
      return;
    }
    if (chain.length === 0) {
      toast.error("Approval chain required", { description: "Add at least one approver before submitting." });
      return;
    }
    policiesStore.saveDraft(version.id, buildPatch());
    policiesStore.submitForReview(
      version.id,
      "Áine Ryan",
      chain.map((c) => ({ role: c.role, name: c.name, coApprovers: c.coApprovers })),
    );
    toast("Submitted for approval", { description: `${title} v${version.versionNumber} is now with ${chain[0].name}.` });
    navigate(`/app/policies/${id}`);
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const newOnes: Attachment[] = Array.from(files).map((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase() || "";
      const kind: Attachment["kind"] =
        ext === "pdf" ? "pdf" : ext.startsWith("xls") ? "xlsx" : ext.startsWith("doc") ? "docx" : "template";
      return {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: f.name,
        sizeKb: Math.max(1, Math.round(f.size / 1024)),
        kind,
      };
    });
    setAttachments((prev) => [...prev, ...newOnes]);
  };

  const fromUpload = !!version.derivedFromUploadId && !!doc.sourceUpload;

  const moveStep = (idx: number, dir: -1 | 1) => {
    setChain((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const removeStep = (id: string) => setChain((prev) => prev.filter((s) => s.id !== id));

  const addStep = () => {
    if (!newApproverRole.trim() || !newApproverName.trim()) return;
    setChain((prev) => [
      ...prev,
      { id: newStepId(), role: newApproverRole.trim(), name: newApproverName.trim(), coApprovers: [] },
    ]);
    setShowAddApprover(false);
  };

  const addCoApprover = (stepId: string) => {
    const fallback = DEFAULT_APPROVERS[1] || DEFAULT_APPROVERS[0];
    setChain((prev) =>
      prev.map((s) =>
        s.id === stepId
          ? { ...s, coApprovers: [...s.coApprovers, { role: fallback.role, name: fallback.name }] }
          : s,
      ),
    );
  };

  const updateCoApprover = (stepId: string, idx: number, patch: { role?: string; name?: string }) => {
    setChain((prev) =>
      prev.map((s) =>
        s.id === stepId
          ? {
              ...s,
              coApprovers: s.coApprovers.map((c, i) => {
                if (i !== idx) return c;
                const next = { ...c, ...patch };
                if (patch.role !== undefined) {
                  const match = DEFAULT_APPROVERS.find((a) => a.role === patch.role);
                  if (match) next.name = match.name;
                }
                return next;
              }),
            }
          : s,
      ),
    );
  };

  const removeCoApprover = (stepId: string, idx: number) => {
    setChain((prev) =>
      prev.map((s) =>
        s.id === stepId ? { ...s, coApprovers: s.coApprovers.filter((_, i) => i !== idx) } : s,
      ),
    );
  };

  return (
    <div className="space-y-6 pb-32">
      <Button variant="ghost" onClick={() => navigate(`/app/policies/${id}`)} className="-ml-2">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to document
      </Button>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="bg-secondary text-foreground">
            {version.status === "in_review"
              ? "Read-only · in review"
              : version.status === "approved"
              ? "Read-only · approved"
              : version.status === "returned"
              ? "Editing returned draft"
              : "Editing draft"}
          </Badge>
          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">
            v{version.versionNumber}
          </Badge>
          {live && (
            <span className="text-xs text-muted-foreground">
              Will supersede live v{live.versionNumber} once approved & published.
            </span>
          )}
        </div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Draft editor</h1>
      </div>

      {/* Live-stays-published banner */}
      <Card className="rounded-2xl border-emerald-200 bg-emerald-50/60">
        <CardContent className="flex items-start gap-3 p-4">
          <Eye className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          <div className="text-sm">
            <p className="font-medium text-emerald-950">
              {live
                ? `The current live version (v${live.versionNumber}, published ${live.publishedAt}) remains visible to all staff.`
                : "No version is currently live for staff."}
            </p>
            <p className="text-xs text-emerald-900/80">
              Staff continue to read the live version until this draft is approved by every approver and published.
            </p>
          </div>
        </CardContent>
      </Card>

      {fromUpload && (
        <Card className="rounded-2xl border-blue-200 bg-blue-50/60">
          <CardContent className="flex items-start gap-3 p-4">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
            <div>
              <p className="text-sm font-medium text-blue-950">
                Editable draft created from {doc.sourceUpload!.filename}.
              </p>
              <p className="text-xs text-blue-900/80">
                The original upload is retained in version history and remains attached to this draft for reference.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {version.returnedNote && (
        <Card className="rounded-2xl border-red-200 bg-red-50/60">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-red-950">Returned for changes</p>
            <p className="mt-1 text-sm text-red-900/90">{version.returnedNote}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Main editor */}
        <div className="space-y-4">
          <Card className="rounded-2xl border-border/60 shadow-sm">
            <CardContent className="space-y-4 p-4 md:p-6">
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Title</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-lg font-semibold"
                  disabled={isReadOnly}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Type</label>
                  <Select value={category} onValueChange={(v) => setCategory(v as PolicyCategory)} disabled={isReadOnly}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tags</label>
                  <Input
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="comma-separated"
                    disabled={isReadOnly}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/60 shadow-sm">
            <div className="flex flex-wrap items-center gap-1 border-b border-border/60 px-2 py-1.5">
              <ToolbarBtn active={activeBlock === "h1"} onClick={() => setBlock("h1")} title="Heading 1">
                <Heading1 className="h-4 w-4" />
              </ToolbarBtn>
              <ToolbarBtn active={activeBlock === "h2"} onClick={() => setBlock("h2")} title="Heading 2">
                <Heading2 className="h-4 w-4" />
              </ToolbarBtn>
              <ToolbarBtn active={activeBlock === "h3"} onClick={() => setBlock("h3")} title="Heading 3">
                <Heading3 className="h-4 w-4" />
              </ToolbarBtn>
              <ToolbarBtn
                active={activeBlock === "p" || activeBlock === "div" || activeBlock === ""}
                onClick={() => setBlock("p")}
                title="Paragraph"
              >
                <Pilcrow className="h-4 w-4" />
              </ToolbarBtn>
              <span className="mx-1 h-5 w-px bg-border" />
              <ToolbarBtn active={activeFormats.bold} onClick={() => exec("bold")} title="Bold">
                <Bold className="h-4 w-4" />
              </ToolbarBtn>
              <ToolbarBtn active={activeFormats.italic} onClick={() => exec("italic")} title="Italic">
                <Italic className="h-4 w-4" />
              </ToolbarBtn>
              <span className="mx-1 h-5 w-px bg-border" />
              <ToolbarBtn active={activeFormats.ul} onClick={() => toggleList("insertUnorderedList")} title="Bulleted list">
                <ListIcon className="h-4 w-4" />
              </ToolbarBtn>
              <ToolbarBtn active={activeFormats.ol} onClick={() => toggleList("insertOrderedList")} title="Numbered list">
                <ListOrdered className="h-4 w-4" />
              </ToolbarBtn>
              <span className="mx-1 h-5 w-px bg-border" />
              <ToolbarBtn onClick={insertLink} title="Insert link">
                <LinkIcon className="h-4 w-4" />
              </ToolbarBtn>
            </div>
            <div
              ref={editorRef}
              contentEditable={!isReadOnly}
              suppressContentEditableWarning
              onKeyDown={(e) => {
                // Make Enter inside contentEditable produce a fresh paragraph rather than nested headings
                if (e.key === "Enter" && !e.shiftKey) {
                  // Default behaviour is fine for most browsers; rely on it.
                }
              }}
              className="policy-body p-6 md:p-8 min-h-[480px] focus:outline-none"
            />
          </Card>

          {/* Attachments */}
          <Card className="rounded-2xl border-border/60 shadow-sm">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Attachments & templates</p>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    handleFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={isReadOnly}>
                  <Paperclip className="mr-2 h-4 w-4" /> Attach files
                </Button>
              </div>
              {!isReadOnly && (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleFiles(e.dataTransfer.files);
                  }}
                  className="rounded-xl border-2 border-dashed border-border bg-secondary/40 p-4 text-center text-xs text-muted-foreground"
                >
                  <Upload className="mx-auto mb-1 h-5 w-5" />
                  Drag & drop files here or use Attach files.
                </div>
              )}
              {attachments.length > 0 && (
                <ul className="space-y-1.5">
                  {attachments.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background px-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{a.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {a.kind.toUpperCase()} · {a.sizeKb} KB
                          </p>
                        </div>
                      </div>
                      {!isReadOnly && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar — change summary + approval chain */}
        <div className="space-y-4">
          <Card className="rounded-2xl border-border/60 shadow-sm">
            <CardContent className="space-y-3 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Summary of changes <span className="text-red-600">*</span>
              </p>
              <Textarea
                value={changeSummary}
                onChange={(e) => setChangeSummary(e.target.value)}
                placeholder="Briefly describe what changed in this version. Required before submitting for approval."
                className="min-h-[120px] resize-none"
                disabled={isReadOnly}
              />
              <p className="text-xs text-muted-foreground">
                Shown to reviewers and stored permanently in version history.
              </p>
            </CardContent>
          </Card>

          {/* Approval chain builder */}
          <Card className="rounded-2xl border-border/60 shadow-sm">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Approval chain</p>
                <Badge variant="secondary" className="rounded-full text-xs">
                  {chain.length} level{chain.length === 1 ? "" : "s"}
                </Badge>
              </div>
              {matchedTemplate && !isReadOnly && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-2.5 py-1.5 text-xs text-blue-950">
                  Pre-filled from template <strong>{matchedTemplate.name}</strong>. You can adjust below.
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Approvers review in order. Add co-approvers if a colleague can approve in their place — either
                one can sign off so the chain doesn't stall.
              </p>

              <ol className="space-y-2">
                {chain.map((s, idx) => (
                  <li
                    key={s.id}
                    className="space-y-1.5 rounded-lg border border-border/60 bg-background p-2"
                  >
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-foreground">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{s.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{s.role}</p>
                      </div>
                      {!isReadOnly && (
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => moveStep(idx, -1)}
                            disabled={idx === 0}
                            className="rounded p-1 text-muted-foreground hover:bg-secondary disabled:opacity-30"
                            aria-label="Move up"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveStep(idx, 1)}
                            disabled={idx === chain.length - 1}
                            className="rounded p-1 text-muted-foreground hover:bg-secondary disabled:opacity-30"
                            aria-label="Move down"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeStep(s.id)}
                            className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-700"
                            aria-label="Remove"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Co-approvers */}
                    {s.coApprovers.map((co, ci) => (
                      <div
                        key={ci}
                        className="ml-6 flex items-center gap-2 rounded-md border border-dashed border-border/80 bg-secondary/30 px-2 py-1"
                      >
                        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">
                          or
                        </span>
                        {!isReadOnly ? (
                          <>
                            <Select
                              value={co.role}
                              onValueChange={(v) => updateCoApprover(s.id, ci, { role: v })}
                            >
                              <SelectTrigger className="h-7 w-44 text-xs">
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
                            <Input
                              value={co.name}
                              onChange={(e) => updateCoApprover(s.id, ci, { name: e.target.value })}
                              className="h-7 flex-1 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => removeCoApprover(s.id, ci)}
                              className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-700"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-foreground">
                            <strong>{co.name}</strong> · <span className="text-muted-foreground">{co.role}</span>
                          </span>
                        )}
                      </div>
                    ))}

                    {!isReadOnly && s.coApprovers.length < 2 && (
                      <button
                        type="button"
                        onClick={() => addCoApprover(s.id)}
                        className="ml-6 flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        <Plus className="h-3 w-3" /> Add co-approver (either can approve)
                      </button>
                    )}
                  </li>
                ))}
                {chain.length === 0 && (
                  <li className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
                    No approvers yet. Add at least one.
                  </li>
                )}
              </ol>

              {!isReadOnly && !showAddApprover && (
                <Button variant="outline" size="sm" className="w-full" onClick={() => setShowAddApprover(true)}>
                  <Plus className="mr-2 h-3.5 w-3.5" /> Add approver
                </Button>
              )}

              {!isReadOnly && showAddApprover && (
                <div className="space-y-2 rounded-lg border border-border/60 bg-secondary/40 p-2.5">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Role
                    </label>
                    <Select
                      value={newApproverRole}
                      onValueChange={(v) => {
                        setNewApproverRole(v);
                        const match = DEFAULT_APPROVERS.find((a) => a.role === v);
                        if (match) setNewApproverName(match.name);
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
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
                    <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Name
                    </label>
                    <Input
                      value={newApproverName}
                      onChange={(e) => setNewApproverName(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setShowAddApprover(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={addStep}>
                      Add
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Workflow legend */}
          <Card className="rounded-2xl border-border/60 shadow-sm">
            <CardContent className="space-y-2 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Workflow</p>
              <ol className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Pilcrow className="h-3 w-3" /> 1. Edit & save your draft.
                </li>
                <li className="flex items-center gap-2">
                  <Send className="h-3 w-3" /> 2. Submit — chain begins with first approver.
                </li>
                <li className="flex items-center gap-2">
                  <Clock className="h-3 w-3 text-amber-600" /> 3. Each approver reviews in order.
                </li>
                <li className="flex items-center gap-2">
                  <CornerUpLeft className="h-3 w-3 text-red-600" /> Any approver can return for changes.
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" /> 4. All approve → ready to publish.
                </li>
                <li className="flex items-center gap-2">
                  <Eye className="h-3 w-3 text-emerald-700" /> 5. Publish replaces the live version for staff.
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:left-[var(--sidebar-width,16rem)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <p className="hidden text-xs text-muted-foreground md:block">
            Editing v{version.versionNumber} of {doc.title} · live version stays published
          </p>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={() => navigate(`/app/policies/${id}`)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={handleSave} disabled={isReadOnly}>
              <Save className="mr-2 h-4 w-4" /> Save draft
            </Button>
            <Button onClick={handleSubmit} disabled={isReadOnly}>
              <Send className="mr-2 h-4 w-4" /> Submit for approval
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolbarBtn({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      aria-pressed={active}
      className={`rounded-md px-2 py-1.5 transition-colors ${
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
