import { workforceStore } from "@/lib/workforceStore";
import { APPLIES_TO_LABELS, CARER_PREFERENCE_LABELS, isRequiredPreference, preferenceApplies, SUPPORT_CATEGORY_LABELS, type CarerPreference, type VisitRequirement } from "@/lib/visitRequirements";

/** Read-only summary of what this visit requires and whether the client's documented preference applies. */
export function VisitRequirementSummary({ requirement, preference }: { requirement: VisitRequirement; preference?: CarerPreference }) {
  const { requiredQualificationIds: q, supportCategories: c } = requirement;
  const hasPref = preference && preference.type !== "no_preference";
  if (!q.length && !c.length && !hasPref) return null;
  const applies = preferenceApplies(preference, c);
  return (
    <div className="space-y-1 rounded-md border p-3 text-sm">
      {c.length > 0 && <p><strong>Support:</strong> {c.map((x) => SUPPORT_CATEGORY_LABELS[x]).join(", ")}</p>}
      <p><strong>Required competencies:</strong> {q.length ? q.map((id) => workforceStore.getQualType(id)?.name ?? id).join(", ") : "None"}</p>
      {hasPref && (
        <p>
          <strong>Client carer preference:</strong> {CARER_PREFERENCE_LABELS[preference!.type]} · {APPLIES_TO_LABELS[preference!.appliesTo]}
          {preference!.type === "other" ? " — not applied automatically; read the context" : applies ? (isRequiredPreference(preference!.type) ? " — applies to this visit (non-matching carers excluded)" : " — applies to this visit (matching carers listed first)") : " — does not apply to this visit"}
          {preference!.reasonContext && <span className="block text-muted-foreground">{preference!.reasonContext}</span>}
        </p>
      )}
    </div>
  );
}
