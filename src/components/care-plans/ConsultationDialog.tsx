import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  CONSULTED_WHO_LABELS, CONSULT_METHOD_LABELS,
  type Consultation, type ConsultedWho, type ConsultMethod,
} from "@/lib/carePlansStore";

const WHO: ConsultedWho[] = ["service_user", "representative", "family", "advocate", "not_possible"];
const HOW: ConsultMethod[] = ["meeting", "conversation", "phone"];

/** Required before a draft is sent for approval: who was consulted and how. */
export default function ConsultationDialog({ open, onOpenChange, onConfirm, actor, serviceUserLabel }: {
  open: boolean; onOpenChange: (o: boolean) => void; onConfirm: (c: Consultation) => void; actor: string; serviceUserLabel: string;
}) {
  const [who, setWho] = useState<ConsultedWho[]>([]);
  const [how, setHow] = useState<ConsultMethod[]>([]);
  const [reason, setReason] = useState("");
  const notPossible = who.includes("not_possible");
  const valid = who.length > 0 && (notPossible ? reason.trim().length >= 10 : how.length > 0);

  const toggleWho = (w: ConsultedWho) => setWho((cur) => {
    if (w === "not_possible") return cur.includes(w) ? [] : ["not_possible"];
    const base = cur.filter((x) => x !== "not_possible");
    return base.includes(w) ? base.filter((x) => x !== w) : [...base, w];
  });
  const toggleHow = (h: ConsultMethod) => setHow((cur) => cur.includes(h) ? cur.filter((x) => x !== h) : [...cur, h]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send for approval</DialogTitle>
          <DialogDescription>Record who was consulted about these changes.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Who was consulted?</div>
            {WHO.map((w) => (
              <Label key={w} className="flex items-center gap-2 font-normal">
                <Checkbox checked={who.includes(w)} onCheckedChange={() => toggleWho(w)} />
                {w === "service_user" ? serviceUserLabel : CONSULTED_WHO_LABELS[w]}
              </Label>
            ))}
            {notPossible && (
              <Textarea aria-label="Reason consultation was not possible" value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                placeholder="Why consultation was not possible (at least 10 characters)" />
            )}
          </div>
          {!notPossible && (
            <div className="space-y-2">
              <div className="text-sm font-medium">How?</div>
              <div className="flex flex-wrap gap-4">
                {HOW.map((h) => (
                  <Label key={h} className="flex items-center gap-2 font-normal">
                    <Checkbox checked={how.includes(h)} onCheckedChange={() => toggleHow(h)} /> {CONSULT_METHOD_LABELS[h]}
                  </Label>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!valid} onClick={() => {
            onConfirm({ who, how: notPossible ? [] : how, notPossibleReason: notPossible ? reason.trim() : undefined, recordedBy: actor, recordedAt: new Date().toISOString() });
            setWho([]); setHow([]); setReason("");
          }}>Send for approval</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function consultationSummary(c: Consultation, serviceUserLabel: string): string {
  const who = c.who.map((w) => (w === "service_user" ? serviceUserLabel : CONSULTED_WHO_LABELS[w])).join(", ");
  if (c.who.includes("not_possible")) return `Consultation not possible — ${c.notPossibleReason ?? ""}`;
  return `${who} · ${c.how.map((h) => CONSULT_METHOD_LABELS[h]).join(", ")}`;
}
