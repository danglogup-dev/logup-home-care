import { useMemo } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
  group?: string;
}

interface Props {
  options: MultiSelectOption[];
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
}

export function MultiSelect({
  options, values, onChange, placeholder = "Select…",
  emptyText = "No options", disabled, className,
}: Props) {
  const labelById = useMemo(
    () => Object.fromEntries(options.map(o => [o.value, o.label])),
    [options]
  );

  const toggle = (v: string) => {
    if (values.includes(v)) onChange(values.filter(x => x !== v));
    else onChange([...values, v]);
  };
  const clear = (e: React.MouseEvent) => { e.stopPropagation(); onChange([]); };

  // Group options if group key is present
  const grouped = useMemo(() => {
    const m = new Map<string, MultiSelectOption[]>();
    options.forEach(o => {
      const g = o.group ?? "";
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(o);
    });
    return Array.from(m.entries());
  }, [options]);

  return (
    <Popover>
      <PopoverTrigger asChild disabled={disabled}>
        <Button
          type="button"
          variant="outline"
          className={cn("w-full justify-between font-normal h-auto min-h-10 py-1.5", className)}
        >
          <div className="flex flex-wrap gap-1 items-center text-left">
            {values.length === 0 && (
              <span className="text-muted-foreground text-sm">{placeholder}</span>
            )}
            {values.map(v => (
              <span
                key={v}
                className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 text-xs"
              >
                {labelById[v] ?? v}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {values.length > 0 && (
              <span
                role="button"
                onClick={clear}
                className="text-muted-foreground hover:text-foreground p-0.5 rounded"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-1 max-h-72 overflow-auto" align="start">
        {options.length === 0 && (
          <div className="text-sm text-muted-foreground px-3 py-4 text-center">{emptyText}</div>
        )}
        {grouped.map(([group, items]) => (
          <div key={group || "default"}>
            {group && (
              <div className="px-2 pt-2 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">{group}</div>
            )}
            {items.map(o => {
              const selected = values.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent",
                    selected && "bg-accent/50"
                  )}
                >
                  <span>{o.label}</span>
                  {selected && <Check className="h-4 w-4 text-primary" />}
                </button>
              );
            })}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
