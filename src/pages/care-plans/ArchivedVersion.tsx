import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { ArrowLeft, Download, FileText, Archive, ShieldCheck, History as HistoryIcon } from "lucide-react";
import {
  useCarePlans, formatDate, statusLabel, SECTION_LABELS, SECTION_ORDER,
  type SectionKey,
} from "@/lib/carePlansStore";
import { carePlanApprovalChainsStore } from "@/lib/carePlanApprovalChainsStore";
import { carePlanAuditStore, auditActionLabel } from "@/lib/carePlanAuditStore";
import { useRole } from "@/hooks/useRole";

export default function ArchivedVersion() {
  const { id, versionId } = useParams<{ id: string; versionId: string }>();
  const navigate = useNavigate();
  const { people, plans } = useCarePlans();
  const role = useRole();
  const person = useMemo(() => people.find((p) => p.id === id), [people, id]);
  const plan = useMemo(() => plans.find((p) => p.personId === id), [plans, id]);
  const version = useMemo(() => plan?.versions.find((v) => v.id === versionId), [plan, versionId]);

  if (!person || !plan || !version) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <div className="mt-6 text-sm text-muted-foreground">Care plan version not found.</div>
      </div>
    );
  }

  const isArchived = version.status === "archived";
  const sectionByKey = Object.fromEntries(version.sections.map((s) => [s.key, s]));
  const changes = version.sectionChanges ?? [];
  const edited = changes.filter((c) => c.kind === "edited");
  const added = changes.filter((c) => c.kind === "added");
  const removed = changes.filter((c) => c.kind === "removed");
  const instance = carePlanApprovalChainsStore.getInstanceForVersion(version.id);
  const versionEvents = carePlanAuditStore.forVersion(version.id);

  const handleExport = () => {
    carePlanAuditStore.log({
      personId: person.id, versionId: version.id, carePlanId: version.id,
      actor: role.displayName, actorRole: role.role,
      action: "version_exported", fromStatus: version.status, toStatus: version.status,
      metadata: { format: "print", versionNumber: version.versionNumber },
    });
    toast({ title: "Export queued (demo)", description: `Care Plan v${version.versionNumber} for ${person.name}. Export event recorded in audit trail.` });
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
            <Link to={`/app/care-plans/people/${person.id}`}><ArrowLeft className="h-4 w-4 mr-1" /> Back to {person.name}</Link>
          </Button>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">
              {person.name} — Care Plan v{version.versionNumber}
            </h1>
            <Badge variant="outline" className={isArchived ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary border-primary/20"}>
              {isArchived && <Archive className="h-3 w-3 mr-1" />}
              {statusLabel(version.status)}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {person.site}{person.unit ? ` · ${person.unit}` : ""} · Created {formatDate(version.createdAt)} by {version.createdBy}
            {version.publishedAt ? ` · Published ${formatDate(version.publishedAt)}` : ""}
            {version.archivedAt ? ` · Archived ${formatDate(version.archivedAt)}` : ""}
            {version.approvedBy ? ` · Approved by ${version.approvedBy}` : ""}
            {version.sourceType ? ` · Source: ${version.sourceType}` : version.aiAssisted ? " · AI-assisted draft" : ""}
          </div>
        </div>
        <Button variant="outline" onClick={handleExport}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </div>

      {isArchived && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
          <Archive className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Archived approved version — this is not the current plan.</div>
            <div className="text-xs">
              This is a read-only snapshot of a previously approved care plan.
              {plan.currentVersionId !== version.id && (
                <> The current approved plan is <Link to={`/app/care-plans/people/${person.id}`} className="underline font-medium">available on the person's page</Link>.</>
              )}
            </div>
          </div>
        </div>
      )}

      {(version.reasonForChange || changes.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><HistoryIcon className="h-4 w-4" /> Change summary</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            {version.reasonForChange && (
              <div><span className="text-muted-foreground">Reason for change:</span> {version.reasonForChange}</div>
            )}
            <div className="text-muted-foreground">Sections edited: {edited.length} · added: {added.length} · removed: {removed.length}</div>
            {changes.length > 0 && (
              <ul className="text-xs space-y-1 bg-muted/40 border rounded-md p-2">
                {changes.map((c, idx) => (
                  <li key={`${c.key}-${idx}`}>
                    <span className="font-medium capitalize">{c.kind}:</span> {SECTION_LABELS[c.key as SectionKey] ?? c.sectionTitle ?? c.key}
                    {c.reason ? <span className="text-muted-foreground"> — {c.reason}</span> : null}
                    <span className="text-muted-foreground"> · {c.editedBy} · {formatDate(c.editedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {instance && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Approval chain used</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div><span className="text-muted-foreground">Chain:</span> {instance.chainName}</div>
            <div className="text-xs text-muted-foreground">
              {instance.chainSnapshot.levels.length} level{instance.chainSnapshot.levels.length === 1 ? "" : "s"} · {instance.decisions.length} decision{instance.decisions.length === 1 ? "" : "s"} recorded
            </div>
            {instance.decisions.length > 0 && (
              <ul className="text-xs space-y-1 bg-muted/40 border rounded-md p-2">
                {instance.decisions.map((d) => (
                  <li key={d.id}>
                    <span className="font-medium capitalize">{d.decision}</span> by {d.approverName} at level {d.levelNumber} · {formatDate(d.decidedAt)}
                    {d.note ? <span className="text-muted-foreground"> — {d.note}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
            <FileText className="h-4 w-4" /> Read-only snapshot of this version
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {SECTION_ORDER.map((key) => {
            const s = sectionByKey[key];
            if (!s) return null;
            return (
              <div key={key} className="border-b last:border-b-0 pb-4 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-sm">{SECTION_LABELS[key]}</div>
                  {s.lastReviewed && <span className="text-[11px] text-muted-foreground">Last reviewed {formatDate(s.lastReviewed)}</span>}
                </div>
                <div className="text-sm mt-1 whitespace-pre-wrap text-foreground/90">{s.body}</div>
              </div>
            );
          })}
          {/* Custom person-specific sections not in the canonical order */}
          {version.sections.filter((s) => !SECTION_ORDER.includes(s.key as SectionKey)).map((s) => (
            <div key={s.key} className="border-b last:border-b-0 pb-4 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-sm">{s.label ?? s.key}</div>
                {s.isCustom && <Badge variant="outline" className="text-[10px]">Custom section</Badge>}
              </div>
              <div className="text-sm mt-1 whitespace-pre-wrap text-foreground/90">{s.body}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      {versionEvents.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Audit trail</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {versionEvents.map((ev) => (
                <div key={ev.id} className="p-3 text-xs flex items-start gap-3">
                  <div className="w-40 shrink-0 text-muted-foreground">{formatDate(ev.timestamp)}</div>
                  <div className="flex-1">
                    <div className="font-medium">{auditActionLabel(ev.action)}</div>
                    <div className="text-muted-foreground">{ev.actor} ({ev.actorRole}){ev.fromStatus && ev.toStatus && ev.fromStatus !== ev.toStatus ? ` · ${ev.fromStatus} → ${ev.toStatus}` : ""}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
