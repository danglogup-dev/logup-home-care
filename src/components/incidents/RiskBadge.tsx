import { Badge } from "@/components/ui/badge";
import {
  computeRiskRating, RISK_TONE, LIFECYCLE_TONE,
  type RiskImpact, type RiskLikelihood, type RiskRating, type LifecycleStatus,
} from "@/lib/incidentGovernance";
import { Shield, GitBranch } from "lucide-react";

interface RiskBadgeProps {
  impact?: RiskImpact;
  likelihood?: RiskLikelihood;
  /** If a rating is passed directly, impact/likelihood are ignored. */
  rating?: RiskRating;
  /** When true (default), the impact × likelihood is shown alongside the rating. */
  showMatrix?: boolean;
  className?: string;
}

/**
 * Compact, governance-grade risk badge. Renders nothing when no rating can
 * be derived — so cards that don't have a risk assessment yet keep using
 * the existing severity chip without an empty placeholder.
 */
export function RiskBadge({ impact, likelihood, rating, showMatrix = true, className }: RiskBadgeProps) {
  const r = rating ?? (impact && likelihood ? computeRiskRating(impact, likelihood) : undefined);
  if (!r) return null;
  const tone = RISK_TONE[r];
  return (
    <Badge
      variant="outline"
      className={`text-[10px] font-semibold inline-flex items-center gap-1 ${tone.bg} ${tone.text} ${tone.border} ${className ?? ""}`}
      title={impact && likelihood ? `Risk: ${r} (impact ${impact} × likelihood ${likelihood})` : `Risk: ${r}`}
    >
      <Shield className="h-2.5 w-2.5" />
      Risk · {r}
      {showMatrix && impact && likelihood && (
        <span className="opacity-70 font-normal">· {impact[0]}×{likelihood[0]}</span>
      )}
    </Badge>
  );
}

interface LifecyclePillProps {
  status?: LifecycleStatus;
  className?: string;
}

export function LifecyclePill({ status, className }: LifecyclePillProps) {
  if (!status) return null;
  const tone = LIFECYCLE_TONE[status];
  return (
    <Badge
      variant="outline"
      className={`text-[10px] font-semibold inline-flex items-center gap-1 ${tone} ${className ?? ""}`}
      title={`Lifecycle: ${status}`}
    >
      <GitBranch className="h-2.5 w-2.5" />
      {status}
    </Badge>
  );
}
