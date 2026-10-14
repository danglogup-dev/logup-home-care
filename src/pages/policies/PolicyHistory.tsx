import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Upload, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  policiesStore,
  PolicyVersion,
  versionStatusMeta,
} from "@/lib/policiesStore";

export default function PolicyHistory() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [, force] = useState(0);
  useEffect(() => policiesStore.subscribe(() => force((n) => n + 1)), []);

  const doc = policiesStore.get(id);
  const versions = policiesStore.getVersions(id);
  const [open, setOpen] = useState<PolicyVersion | null>(null);

  if (!doc) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate("/app/policies")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Policy Hub
        </Button>
        <Card className="rounded-2xl">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Document not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <Button variant="ghost" onClick={() => navigate(`/app/policies/${id}`)} className="-ml-2">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to document
      </Button>

      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{doc.category} · {doc.owner}</p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {doc.title} — Version history
        </h1>
        <p className="text-sm text-muted-foreground">
          Auditable record of every version, edit and approval for this document.
        </p>
      </div>

      <Card className="rounded-2xl border-border/60 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Version</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Summary of changes</th>
                <th className="px-4 py-3 font-medium">Edited</th>
                <th className="px-4 py-3 font-medium">Approved</th>
                <th className="px-4 py-3 font-medium">Published</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => {
                const isCurrent = v.id === doc.currentVersionId;
                const meta = versionStatusMeta[v.status];
                return (
                  <tr
                    key={v.id}
                    onClick={() => setOpen(v)}
                    className="cursor-pointer border-b border-border/40 transition-colors hover:bg-secondary/40"
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">v{v.versionNumber}</span>
                        {isCurrent && (
                          <Badge variant="outline" className="border-emerald-200 bg-emerald-100 text-emerald-900">
                            Current
                          </Badge>
                        )}
                        {v.derivedFromUploadId && (
                          <Badge variant="outline" className="gap-1 border-blue-200 bg-blue-50 text-blue-900">
                            <Upload className="h-3 w-3" /> From upload
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                    </td>
                    <td className="px-4 py-3 align-top text-foreground/80">
                      <p className="line-clamp-2 max-w-md">{v.changeSummary}</p>
                      {v.returnedNote && (
                        <p className="mt-1 line-clamp-2 max-w-md text-xs text-red-900">Returned: {v.returnedNote}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-muted-foreground">
                      <p className="text-foreground">{v.editedBy}</p>
                      <p className="text-xs">{v.editedAt}</p>
                    </td>
                    <td className="px-4 py-3 align-top text-muted-foreground">
                      {v.approvedBy ? (
                        <>
                          <p className="text-foreground">{v.approvedBy}</p>
                          <p className="text-xs">{v.approvedAt}</p>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-muted-foreground">{v.publishedAt ?? "—"}</td>
                  </tr>
                );
              })}
              {versions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No versions recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>v{open?.versionNumber}</span>
              {open && <Badge variant="outline" className={versionStatusMeta[open.status].className}>{versionStatusMeta[open.status].label}</Badge>}
            </DialogTitle>
          </DialogHeader>
          {open && (
            <div className="space-y-3">
              <div className="rounded-lg bg-secondary/40 p-3 text-sm">
                <p><span className="text-muted-foreground">Edited by:</span> {open.editedBy} · {open.editedAt}</p>
                {open.approvedBy && <p><span className="text-muted-foreground">Approved by:</span> {open.approvedBy} · {open.approvedAt}</p>}
                {open.publishedAt && <p><span className="text-muted-foreground">Published:</span> {open.publishedAt}</p>}
                <p className="mt-1 text-foreground/80"><span className="text-muted-foreground">Summary:</span> {open.changeSummary}</p>
              </div>
              <div
                className="policy-body prose prose-sm max-w-none rounded-lg border border-border/60 bg-background p-4 text-foreground prose-headings:font-heading max-h-[60vh] overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: open.bodyHtml }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
