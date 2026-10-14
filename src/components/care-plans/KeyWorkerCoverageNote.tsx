import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import {
  workforceStore,
  qualificationStatus,
  qualificationSourceId,
} from "@/lib/workforceStore";

interface Props {
  keyWorkerName?: string;
}

/**
 * Non-blocking coverage note shown on "Care at a Glance".
 *
 * Surfaces if the person's key worker holds any expected qualification that is
 * expiring soon or expired. This is informational only — it never blocks the
 * care plan and never gates any action.
 */
export function KeyWorkerCoverageNote({ keyWorkerName }: Props) {
  if (!keyWorkerName) return null;
  const staff = workforceStore
    .getStaff()
    .find((s) => s.name.trim().toLowerCase() === keyWorkerName.trim().toLowerCase());
  if (!staff) return null;

  const risks = staff.qualifications
    .filter((q) => staff.expectedQualificationIds.includes(q.qualificationId))
    .map((q) => ({ q, status: qualificationStatus(q) }))
    .filter((r) => r.status === "red" || r.status === "amber");

  if (risks.length === 0) return null;

  const worst = risks.find((r) => r.status === "red") ?? risks[0];
  const type = workforceStore.getQualType(worst.q.qualificationId);
  const isRed = worst.status === "red";

  return (
    <div
      className={`rounded-md border px-3 py-2 text-xs flex items-start gap-2 ${
        isRed
          ? "bg-warning/10 border-warning/30 text-foreground"
          : "bg-muted/50 border-border text-muted-foreground"
      }`}
    >
      <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${isRed ? "text-warning" : "text-muted-foreground"}`} />
      <div className="flex-1">
        <span className="font-medium text-foreground">Coverage note:</span>{" "}
        Key worker <span className="font-medium text-foreground">{staff.name}</span>{" "}
        has {risks.length} qualification{risks.length === 1 ? "" : "s"} that need
        {risks.length === 1 ? "s" : ""} attention (e.g.{" "}
        <span className="font-medium">{type?.name}</span> — {isRed ? "expired" : "expiring soon"}).
        This does not block care plan actions.{" "}
        <Link
          to={`/app/workforce/qualifications?source=${qualificationSourceId(staff.id, worst.q.qualificationId)}`}
          className="underline text-primary"
        >
          View in Workforce
        </Link>
      </div>
    </div>
  );
}
