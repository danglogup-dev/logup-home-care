import { useMemo, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { buildTimeline, type TimelineItem } from "@/lib/serviceUserTimeline";
import { useVisits } from "@/lib/visitsStore";
import { useVisitNotes } from "@/lib/visitNotesStore";
import { useTasksStore } from "@/lib/tasksStore";
import { useCarePlans } from "@/lib/carePlansStore";
import { medicationDemoVersion, subscribeMedicationDemo } from "@/lib/medicationDemoStore";

export const ORIGIN_LABEL = { record: "Original record", manager: "Manager decision", suggestion: "LogUp suggestion" } as const;

/** Re-derives the chronology whenever any source store changes. */
export function useClientTimeline(clientId: string, from?: string, to?: string): TimelineItem[] {
  const { visits } = useVisits(); const notes = useVisitNotes(); const { tasks } = useTasksStore(); useCarePlans();
  const med = useSyncExternalStore(subscribeMedicationDemo, medicationDemoVersion, medicationDemoVersion);
  return useMemo(() => buildTimeline(clientId).filter((i) => (!from || i.date.slice(0, 10) >= from) && (!to || i.date.slice(0, 10) <= to)),
    [clientId, from, to, visits, notes, tasks, med]); // eslint-disable-line react-hooks/exhaustive-deps
}

export const stamp = (iso: string) => new Date(iso).toLocaleString("en-IE", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function ChronologyList({ items, links = true }: { items: TimelineItem[]; links?: boolean }) {
  if (!items.length) return <p className="p-4 text-sm text-muted-foreground">Nothing recorded in this period.</p>;
  return <ol className="divide-y">{items.map((i) => {
    const body = <>
      <div className="flex flex-wrap items-center gap-1.5 text-xs"><Badge variant={i.origin === "manager" ? "default" : i.origin === "suggestion" ? "secondary" : "outline"}>{ORIGIN_LABEL[i.origin ?? "record"]}</Badge><span className="text-muted-foreground">{i.source}</span></div>
      <div className="mt-1 text-sm font-medium">{i.title}</div>
      {i.detail && <div className="text-sm text-muted-foreground">{i.detail}</div>}
      <div className="mt-0.5 text-xs text-muted-foreground">{stamp(i.date)}{i.who && ` · ${i.who}`}</div>
    </>;
    return <li key={i.id}>{links ? <Link to={i.href} className="block p-3 hover:bg-secondary/50">{body}</Link> : <div className="p-2 break-inside-avoid">{body}</div>}</li>;
  })}</ol>;
}
