import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { runDemoDataIntegrityCheck, type IntegrityReport, type Severity } from "@/lib/dataHealthCheck";

const severityBadge = (s: Severity) => {
  if (s === "error") return <Badge variant="destructive">Error</Badge>;
  if (s === "warning") return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Warning</Badge>;
  return <Badge variant="secondary">Info</Badge>;
};

export default function DataHealth() {
  const [report, setReport] = useState<IntegrityReport>(() => runDemoDataIntegrityCheck());
  const run = () => setReport(runDemoDataIntegrityCheck());

  const grouped = useMemo(() => {
    const m = new Map<string, typeof report.issues>();
    for (const i of report.issues) {
      const arr = m.get(i.module) ?? [];
      arr.push(i);
      m.set(i.module, arr);
    }
    return Array.from(m.entries());
  }, [report]);

  const errors = report.issues.filter((i) => i.severity === "error");
  const warnings = report.issues.filter((i) => i.severity === "warning");
  const geographyLeaks = report.issues.filter((i) => /unit|wing|floor|geography/i.test(i.problem));

  return (
    <div className="p-6 md:p-8 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" /> Data Health
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Prototype-only integrity sweep across Events, Care Planning, Audits, Policy Hub, Workforce, Insights, Tasks and Team.
            Read-only — no records are modified.
          </p>
          <p className="text-xs text-muted-foreground mt-1">Last run {new Date(report.ranAt).toLocaleString()}</p>
        </div>
        <Button onClick={run} variant="outline" size="sm"><RefreshCw className="h-4 w-4 mr-2" /> Re-run check</Button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Passed checks" value={report.totals.passed} tone="ok" icon={<CheckCircle2 className="h-4 w-4" />} />
        <StatCard label="Warnings" value={report.totals.warnings} tone="warn" icon={<AlertTriangle className="h-4 w-4" />} />
        <StatCard label="Errors" value={report.totals.errors} tone="err" icon={<XCircle className="h-4 w-4" />} />
        <StatCard label="Geography leaks" value={geographyLeaks.length} tone={geographyLeaks.length ? "warn" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      <Tabs defaultValue="issues">
        <TabsList>
          <TabsTrigger value="issues">Issues ({report.issues.length})</TabsTrigger>
          <TabsTrigger value="demo">Demo paths ({report.demoPaths.length})</TabsTrigger>
          <TabsTrigger value="passed">Passed ({report.passedChecks.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="issues" className="space-y-4 mt-4">
          {report.issues.length === 0 && (
            <Card><CardContent className="p-6 text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> No issues found. Demo data is consistent.
            </CardContent></Card>
          )}
          {grouped.map(([module, items]) => (
            <Card key={module}>
              <CardHeader className="pb-2"><CardTitle className="text-base">{module} <span className="text-muted-foreground text-xs font-normal">({items.length})</span></CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Severity</TableHead>
                      <TableHead className="w-48">Record</TableHead>
                      <TableHead>Problem</TableHead>
                      <TableHead>Suggested fix</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((i, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{severityBadge(i.severity)}</TableCell>
                        <TableCell className="font-mono text-xs">{i.recordId}</TableCell>
                        <TableCell className="text-sm">{i.problem}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{i.suggestedFix}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="demo" className="space-y-4 mt-4">
          {report.demoPaths.map((p) => (
            <Card key={p.personId}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {p.passed ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-destructive" />}
                  {p.name} <span className="text-xs font-mono text-muted-foreground">{p.personId}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {p.checks.map((c, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      {c.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />}
                      <span>
                        {c.label}
                        {c.detail && <span className="text-muted-foreground ml-2">— {c.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="passed" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <ul className="space-y-1 text-sm">
                {report.passedChecks.map((c, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        This panel is a prototype QA aid. It reads shared demo stores and reports inconsistencies — it does not modify data or make compliance judgements.
      </p>
    </div>
  );
}

function StatCard({ label, value, tone, icon }: { label: string; value: number; tone: "ok" | "warn" | "err"; icon: React.ReactNode }) {
  const bg = tone === "ok" ? "bg-emerald-50 text-emerald-900 border-emerald-200"
    : tone === "warn" ? "bg-amber-50 text-amber-900 border-amber-200"
    : "bg-red-50 text-red-900 border-red-200";
  return (
    <Card className={bg}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide">{label}</span>
          {icon}
        </div>
        <div className="text-3xl font-semibold mt-2">{value}</div>
      </CardContent>
    </Card>
  );
}
