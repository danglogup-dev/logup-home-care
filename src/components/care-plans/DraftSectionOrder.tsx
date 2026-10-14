import { ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { carePlansStore, templateSectionName, type CarePlanVersion } from "@/lib/carePlansStore";
import { toast } from "@/hooks/use-toast";

/** Reorder sections in the draft only. The template and the approved plan are never changed. */
export default function DraftSectionOrder({ personId, draft, actor, actorRole, onResetToTemplate }: {
  personId: string; draft: CarePlanVersion; actor: string; actorRole: string; onResetToTemplate: () => void;
}) {
  const keys = draft.sections.map((s) => s.key);
  const move = (i: number, d: -1 | 1) => {
    const next = keys.slice();
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    carePlansStore.reorderDraftSections(personId, next, actor, actorRole, { source: "manual" });
  };
  const differs = carePlansStore.templateOrderFor(personId, keys).join("|") !== keys.join("|");
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Section order — draft v{draft.versionNumber}</CardTitle>
          {differs && (
            <Button size="sm" variant="outline" onClick={() => { onResetToTemplate(); toast({ title: "Template order proposed", description: "Review the change in Ask LogUp." }); }}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset to template order
            </Button>
          )}
        </div>
        <div className="text-xs text-muted-foreground">Changes apply to this draft only and become current when the draft is approved. The organisation template is not changed.</div>
      </CardHeader>
      <CardContent>
        <ol className="space-y-1">
          {draft.sections.map((s, i) => (
            <li key={s.key} className="flex items-center gap-2 rounded border px-2 py-1 text-sm">
              <span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
              <span className="flex-1 min-w-0 truncate">{s.label ?? templateSectionName(personId, s.key)}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Move ${s.label ?? templateSectionName(personId, s.key)} up`} disabled={i === 0} onClick={() => move(i, -1)}><ChevronUp className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Move ${s.label ?? templateSectionName(personId, s.key)} down`} disabled={i === keys.length - 1} onClick={() => move(i, 1)}><ChevronDown className="h-4 w-4" /></Button>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
