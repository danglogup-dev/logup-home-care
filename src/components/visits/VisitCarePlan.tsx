import { FileText } from "lucide-react";
import { sectionLabel, type CarePlanVersion } from "@/lib/carePlansStore";
import type { VisitTemplate } from "@/lib/visitsStore";

/** Which plan sections matter most for a visit, read from its support categories and tasks. */
const CATEGORY_KEYS: Record<string, string[]> = {
  personal_care: ["personalCare", "skin"], intimate_care: ["personalCare"], medication_support: ["medication"],
  meal_support: ["nutrition"], mobility_support: ["mobility", "fallsRisk"], companionship: ["about", "communication"],
};
const TASK_KEYS: [RegExp, string[]][] = [[/wash|shower|dress|personal/i, ["personalCare", "skin"]], [/breakfast|lunch|dinner|tea|meal|fluid|drink/i, ["nutrition"]], [/medic/i, ["medication"]], [/walk|transfer|mobil|bed/i, ["mobility", "fallsRisk"]]];

export function relevantSectionKeys(template?: Pick<VisitTemplate, "tasks" | "supportCategories" | "medications">): Set<string> {
  const keys = new Set<string>(["communication", "risksControls"]);
  template?.supportCategories?.forEach((c) => CATEGORY_KEYS[c]?.forEach((k) => keys.add(k)));
  template?.tasks.forEach((t) => TASK_KEYS.forEach(([re, ks]) => re.test(t) && ks.forEach((k) => keys.add(k))));
  if (template?.medications.length) keys.add("medication");
  return keys;
}

/** Read-only, all-staff sections of the published care plan, shown inside the mobile visit. */
export function VisitCarePlan({ plan, template }: { plan?: CarePlanVersion; template?: VisitTemplate }) {
  if (!plan || plan.status !== "published") return <p className="mt-3 text-base">No approved care plan is published for this client. Ask your coordinator.</p>;
  const relevant = relevantSectionKeys(template);
  const sections = plan.sections.filter((s) => s.body?.trim() && (s.visibility ?? "all_staff") === "all_staff");
  const ordered = [...sections.filter((s) => relevant.has(s.key)), ...sections.filter((s) => !relevant.has(s.key))];
  return <section className="mt-4 space-y-2" aria-labelledby="visit-plan-heading">
    <h3 id="visit-plan-heading" className="flex items-center gap-2 text-lg font-bold"><FileText className="h-5 w-5" aria-hidden="true" />Approved care plan · version {plan.versionNumber}</h3>
    <p className="text-sm text-muted-foreground">Read only. Sections for this visit are listed first.</p>
    {ordered.map((s) => <details key={s.key} open={relevant.has(s.key) && s.key !== "risksControls"} className="rounded-md border bg-card p-3">
      <summary className="min-h-10 cursor-pointer text-base font-semibold">{sectionLabel(s)}{relevant.has(s.key) && <span className="ml-2 text-xs font-medium text-primary">For this visit</span>}</summary>
      <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed">{s.body}</p>
    </details>)}
  </section>;
}
