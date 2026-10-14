import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useCarePlans, getVisiblePeople, formatDate } from "@/lib/carePlansStore";
import { useRole } from "@/hooks/useRole";
import { getStaffName } from "@/lib/demoDataRegistry";
import { isSuggestionOverdue } from "./CarePlanReviewSuggestionBanner";

/** Red list of care plan review suggestions past their due date, within the viewer's scope. */
export function OverdueReviewSuggestionsAlert() {
  const { people, suggestions } = useCarePlans();
  const role = useRole();
  const visible = new Map(getVisiblePeople(people, { role: role.role, scope: role.scope, unit: role.unit }).map((p) => [p.id, p]));
  const overdue = suggestions.filter((s) => isSuggestionOverdue(s) && visible.has(s.personId));
  if (overdue.length === 0) return null;
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-1.5">
      <div className="flex items-center gap-2 text-sm font-medium text-destructive">
        <AlertTriangle className="h-4 w-4" /> {overdue.length} care plan review suggestion{overdue.length === 1 ? "" : "s"} overdue
      </div>
      <ul className="space-y-1">
        {overdue.map((s) => (
          <li key={s.id} className="text-xs">
            <Link to={`/app/care-plans/plans/${s.personId}`} className="text-destructive underline font-medium">{visible.get(s.personId)?.name}</Link>
            <span className="text-muted-foreground"> · {s.eventLabel ?? s.title} · due {formatDate(s.dueAt)}{s.reviewerStaffId ? ` · ${getStaffName(s.reviewerStaffId)}` : ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
