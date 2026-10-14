import { Badge } from "@/components/ui/badge";
import { ASSESSMENT_CHIP_LABELS, RISK_LABELS, isAssessmentOverdue, type Assessment } from "@/lib/assessmentsStore";

const short = (iso: string) => new Date(iso).toLocaleDateString("en-IE", { day: "numeric", month: "short" });

/** "Falls risk: High · 12 Jun · due 12 Sep (overdue)" — or the start of the result summary. */
export function assessmentChipText(a: Assessment): string {
  const result = a.riskLevel ? RISK_LABELS[a.riskLevel] : (a.resultSummary.length > 40 ? `${a.resultSummary.slice(0, 40).trim()}…` : a.resultSummary);
  return `${ASSESSMENT_CHIP_LABELS[a.category]}: ${result} · ${short(a.assessedAt)} · due ${short(a.nextDueAt)}${isAssessmentOverdue(a) ? " (overdue)" : ""}`;
}

export default function AssessmentChip({ a }: { a: Assessment }) {
  const overdue = isAssessmentOverdue(a);
  return (
    <Badge variant="outline" title={`${a.toolName}${a.score ? ` · score ${a.score}` : ""}`}
      className={`text-[11px] font-normal ${overdue ? "border-destructive/40 bg-destructive/10 text-destructive" : ""}`}>
      {assessmentChipText(a)}
    </Badge>
  );
}
