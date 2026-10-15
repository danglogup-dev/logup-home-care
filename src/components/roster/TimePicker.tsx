import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { parseTypedTime, quarterHourOptions } from "@/lib/rosterRules";

/** Hybrid time picker: pick a 15-minute slot or type an exact time (kept as typed, never rounded). */
export function TimePicker({ id, value, onChange, slotState }: { id: string; value: string; onChange: (t: string) => void; slotState?: (t: string) => "conflict" | "available" | undefined }) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  useEffect(() => setText(value), [value]);
  const commit = (raw: string) => { const t = parseTypedTime(raw); if (t) onChange(t); else setText(value); };
  const options = quarterHourOptions(value);
  return (
    <div className="flex">
      <Input id={id} inputMode="numeric" placeholder="HH:MM" value={text} className="rounded-r-none"
        onChange={(e) => { setText(e.target.value); const t = parseTypedTime(e.target.value); if (t && e.target.value.length >= 4) onChange(t); }}
        onBlur={(e) => commit(e.target.value)} onKeyDown={(e) => e.key === "Enter" && commit(text)} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" aria-label="Choose a time" className="rounded-r-md border border-l-0 border-input px-2 hover:bg-accent"><ChevronDown className="h-4 w-4" /></button>
        </PopoverTrigger>
        <PopoverContent className="max-h-64 w-56 overflow-y-auto p-1" align="end">
          {options.map((t) => {
            const st = slotState?.(t);
            return (
              <button key={t} type="button" onClick={() => { onChange(t); setOpen(false); }} className={`flex w-full justify-between rounded px-2 py-1.5 text-left text-sm tabular-nums hover:bg-accent ${t === value ? "font-semibold" : ""}`}>
                <span>{t}</span>
                {st && <span className={st === "conflict" ? "text-destructive" : "text-muted-foreground"}>{st === "conflict" ? "conflict" : "available"}</span>}
              </button>
            );
          })}
        </PopoverContent>
      </Popover>
    </div>
  );
}
