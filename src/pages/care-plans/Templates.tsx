import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCarePlans, publishedVersion, draftVersion, CENTRE_TYPE_TEMPLATE_LABEL, canEditCarePlanTemplates } from "@/lib/carePlansStore";
import { useRole } from "@/hooks/useRole";
import { useSites } from "@/lib/sitesStore";

export default function Templates() {
  const { templates } = useCarePlans();
  const role = useRole();
  const sites = useSites();
  const canEdit = canEditCarePlanTemplates(role.role);
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Care Plan Templates</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Each service type has one template. It sets the sections, their default order, review frequency and approval. A site's service type decides which template its new care plans use.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Service type</TableHead>
                <TableHead>Used by</TableHead>
                <TableHead>Sections</TableHead>
                <TableHead>Review frequency</TableHead>
                <TableHead>Version</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => {
                const pub = publishedVersion(t);
                const draft = draftVersion(t);
                const used = sites.filter((s) => s.centreType === t.serviceType && s.status === "active");
                return (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.id}</div>
                    </TableCell>
                    <TableCell className="text-sm">{CENTRE_TYPE_TEMPLATE_LABEL[t.serviceType]}</TableCell>
                    <TableCell className="text-sm">{used.length ? used.map((s) => s.name).join(", ") : <span className="text-muted-foreground">No sites</span>}</TableCell>
                    <TableCell className="text-sm">{pub?.sections.length ?? 0}</TableCell>
                    <TableCell className="text-sm">Every {pub?.reviewFrequencyMonths} months</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {pub && <Badge variant="outline">v{pub.versionNumber} published</Badge>}
                        {draft && <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">v{draft.versionNumber} draft</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline"><Link to={`/app/care-plans/templates/${t.id}`}>{canEdit ? "Edit" : "View"}</Link></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
