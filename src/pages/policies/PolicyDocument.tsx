import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  History,
  Pencil,
  Archive,
  Download,
  Tag,
  User,
  Calendar,
  Upload,
  FilePlus2,
  AlertCircle,
  Eye,
  CheckCircle2,
  Clock,
  CornerUpLeft,
  CircleDot,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  policiesStore,
  versionStatusMeta,
  docStatusMeta,
  ApprovalStep,
} from "@/lib/policiesStore";
import { toast } from "sonner";

export default function PolicyDocument() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [, force] = useState(0);
  useEffect(() => policiesStore.subscribe(() => force((n) => n + 1)), []);

  const doc = policiesStore.get(id);
  if (!doc) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate("/app/policies")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Policy Hub
        </Button>
        <Card className="rounded-2xl">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Document not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  const live = policiesStore.getLiveVersion(id);
  const draft = policiesStore.getActiveDraft(id);
  const docStatus = policiesStore.docStatus(id);
  const docMeta = docStatusMeta[docStatus];

  const startEditableDraft = () => {
    if (draft) {
      navigate(`/app/policies/${id}/edit?v=${draft.id}`);
      return;
    }
    if (doc.sourceUpload && !live) {
      const versionId = policiesStore.createDraftFromUpload(id, "Áine Ryan");
      if (versionId) {
        toast("Editable draft created", { description: `New draft created from ${doc.sourceUpload.filename}.` });
        navigate(`/app/policies/${id}/edit?v=${versionId}`);
      }
      return;
    }
    if (live) {
      const next = policiesStore.createDraft({
        title: doc.title,
        category: doc.category,
        topicGroup: doc.topicGroup,
        owner: doc.owner,
        tags: doc.tags,
      });
      policiesStore.saveDraft(next.versionId, { bodyHtml: live.bodyHtml });
      navigate(`/app/policies/${next.docId}/edit?v=${next.versionId}`);
    }
  };

  const currentApprover = draft?.approvalChain?.find((s) => s.status === "pending");

  return (
    <div className="space-y-6 pb-12">
      <Button variant="ghost" onClick={() => navigate("/app/policies")} className="-ml-2">
        <ArrowLeft className="mr-2 h-4 w-4" /> Policy Hub
      </Button>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="bg-secondary text-foreground">
            {doc.category}
          </Badge>
          <Badge variant="outline" className={docMeta.className}>
            {docMeta.label}
          </Badge>
          {live && (
            <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-900">
              <Eye className="h-3 w-3" /> Viewing live version
            </Badge>
          )}
          {doc.sourceUpload && !live && (
            <Badge variant="outline" className="gap-1 border-blue-200 bg-blue-50 text-blue-900">
              <Upload className="h-3 w-3" /> From upload
            </Badge>
          )}
        </div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">{doc.title}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <User className="h-4 w-4" />
            {doc.owner}
          </span>
          {live ? (
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              Current live version v{live.versionNumber} · Published {live.publishedAt}
            </span>
          ) : doc.sourceUpload ? (
            <span className="flex items-center gap-1.5">
              <Upload className="h-4 w-4" />
              Uploaded {doc.sourceUpload.uploadedAt} by {doc.sourceUpload.uploadedBy}
            </span>
          ) : (
            <span>No published version yet</span>
          )}
        </div>
      </div>

      {/* Banners */}
      {draft && (
        <Card
          className={`rounded-2xl ${
            draft.status === "in_review"
              ? "border-amber-200 bg-amber-50/60"
              : draft.status === "returned"
              ? "border-red-200 bg-red-50/60"
              : draft.status === "approved"
              ? "border-blue-200 bg-blue-50/60"
              : "border-border bg-secondary/40"
          }`}
        >
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  v{draft.versionNumber} is currently {versionStatusMeta[draft.status].label.toLowerCase()}
                  {currentApprover ? ` · awaiting ${currentApprover.name}` : ""}.
                </p>
                <p className="text-xs text-muted-foreground">
                  Staff continue to see {live ? `v${live.versionNumber} (live)` : "no published version"} until this update is approved by every approver and published.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(`/app/policies/${id}/edit?v=${draft.id}`)}
              >
                <Pencil className="mr-2 h-4 w-4" /> {draft.status === "draft" || draft.status === "returned" ? "Open draft" : "View draft"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {doc.sourceUpload && !live && !draft && (
        <Card className="rounded-2xl border-blue-200 bg-blue-50/60">
          <CardContent className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <Upload className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
              <div>
                <p className="text-sm font-medium text-blue-950">
                  This document is currently a static upload ({doc.sourceUpload.filename}).
                </p>
                <p className="text-xs text-blue-900/80">
                  Convert it into a managed, editable draft to bring it into the approval and publishing workflow.
                </p>
              </div>
            </div>
            <Button size="sm" onClick={startEditableDraft}>
              <FilePlus2 className="mr-2 h-4 w-4" /> Create editable draft
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Body + sidebar */}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="rounded-2xl border-border/60 shadow-sm">
          <CardContent className="p-6 md:p-10">
            {live ? (
              <article
                className="policy-body"
                dangerouslySetInnerHTML={{ __html: live.bodyHtml }}
              />
            ) : (
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>No published version is live yet.</p>
                {doc.sourceUpload && (
                  <p>
                    The original upload <strong>{doc.sourceUpload.filename}</strong> is available in attachments. Use
                    <em> Create editable draft</em> above to begin the publishing workflow.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* Metadata */}
          <Card className="rounded-2xl border-border/60 shadow-sm">
            <CardContent className="space-y-4 p-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Metadata</p>
                <div className="mt-2 space-y-2 text-sm">
                  <Row label="Topic group" value={doc.topicGroup} />
                  <Row label="Document type" value={doc.category} />
                  <Row label="Owner" value={doc.owner} />
                  <Row label="Current version" value={live ? `v${live.versionNumber}` : "—"} />
                  <Row label="Published" value={doc.livePublishedAt ?? "—"} />
                  <Row label="Next review" value={doc.nextReviewDate ?? "—"} />
                </div>
              </div>
              {doc.tags.length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tags</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {doc.tags.map((t) => (
                      <span
                        key={t}
                        className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        <Tag className="h-3 w-3" />
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Approval & publishing */}
          <Card className="rounded-2xl border-border/60 shadow-sm">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Approval & publishing</p>
              </div>
              <div className="space-y-2 text-sm">
                <Row label="Status" value={docMeta.label} />
                {live && (
                  <>
                    <Row label="Approved by" value={live.approvedBy ?? "—"} />
                    <Row label="Approved" value={live.approvedAt ?? "—"} />
                    <Row label="Published by" value={live.publishedBy ?? "—"} />
                    <Row label="Published" value={live.publishedAt ?? "—"} />
                  </>
                )}
                {draft && (
                  <>
                    {draft.submittedAt && <Row label="Submitted" value={draft.submittedAt} />}
                    {currentApprover && <Row label="Awaiting" value={currentApprover.name} />}
                  </>
                )}
              </div>

              {/* Approval chain visualisation */}
              {(draft?.approvalChain || live?.approvalChain) && (
                <div className="space-y-1.5 pt-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {draft ? "Current approval chain" : "Approval chain (live version)"}
                  </p>
                  <ChainList steps={(draft?.approvalChain || live?.approvalChain)!} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Attachments */}
          <Card className="rounded-2xl border-border/60 shadow-sm">
            <CardContent className="space-y-3 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Attachments</p>
              {(live?.attachments?.length ?? 0) === 0 && !doc.sourceUpload ? (
                <p className="text-sm text-muted-foreground">No attachments.</p>
              ) : (
                <ul className="space-y-2">
                  {live?.attachments.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{a.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.kind.toUpperCase()} · {a.sizeKb} KB
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => toast("Download started", { description: a.name })}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                  {!live && doc.sourceUpload && (
                    <li className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{doc.sourceUpload.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          PDF · {doc.sourceUpload.sizeKb} KB · Original upload
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => toast("Download started", { description: doc.sourceUpload!.filename })}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </li>
                  )}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Admin actions */}
          <Card className="rounded-2xl border-border/60 shadow-sm">
            <CardContent className="space-y-2 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Admin actions</p>
              <Button variant="outline" className="w-full justify-start" onClick={startEditableDraft}>
                <Pencil className="mr-2 h-4 w-4" />
                {draft ? "Open active draft" : doc.sourceUpload && !live ? "Create editable draft" : "Edit new draft"}
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => navigate(`/app/policies/${id}/history`)}
              >
                <History className="mr-2 h-4 w-4" /> View version history
              </Button>
              {live && (
                <Button
                  variant="outline"
                  className="w-full justify-start text-muted-foreground"
                  onClick={() => {
                    policiesStore.archive(id);
                    toast("Document archived");
                    navigate("/app/policies");
                  }}
                >
                  <Archive className="mr-2 h-4 w-4" /> Archive document
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export function ChainList({ steps }: { steps: ApprovalStep[] }) {
  return (
    <ol className="space-y-1">
      {steps.map((s, idx) => {
        const Icon =
          s.status === "approved"
            ? CheckCircle2
            : s.status === "returned"
            ? CornerUpLeft
            : s.status === "skipped"
            ? CircleDot
            : Clock;
        const tone =
          s.status === "approved"
            ? "text-emerald-700"
            : s.status === "returned"
            ? "text-red-700"
            : s.status === "skipped"
            ? "text-muted-foreground"
            : "text-amber-700";
        const bg =
          s.status === "approved"
            ? "bg-emerald-50 border-emerald-100"
            : s.status === "returned"
            ? "bg-red-50 border-red-100"
            : s.status === "pending"
            ? "bg-amber-50 border-amber-100"
            : "bg-secondary border-border";
        const decidedByDisplay =
          s.status === "approved" && s.decidedBy && s.decidedBy !== s.name ? s.decidedBy : null;
        return (
          <li key={s.id} className={`rounded-lg border px-2.5 py-1.5 ${bg}`}>
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-background text-[11px] font-semibold text-foreground">
                {idx + 1}
              </span>
              <Icon className={`h-3.5 w-3.5 shrink-0 ${tone}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">
                  {s.name}
                  {decidedByDisplay && (
                    <span className="ml-1 font-normal text-muted-foreground">
                      · approved by {decidedByDisplay}
                    </span>
                  )}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">{s.role}</p>
              </div>
              {s.decidedAt && (
                <span className="shrink-0 text-[11px] text-muted-foreground">{s.decidedAt}</span>
              )}
            </div>
            {s.coApprovers && s.coApprovers.length > 0 && (
              <div className="mt-1 ml-7 flex flex-wrap items-center gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  or
                </span>
                {s.coApprovers.map((c, ci) => (
                  <span
                    key={ci}
                    className="rounded-full bg-background/80 px-2 py-0.5 text-[11px] text-foreground"
                  >
                    {c.name} <span className="text-muted-foreground">· {c.role}</span>
                  </span>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
