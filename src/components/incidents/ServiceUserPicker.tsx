import { useState } from "react";
import { Check, ChevronsUpDown, Building2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const NO_SERVICE_USER = "__none__";
const RECENT_KEY = "logup.recentServiceUsers.v1";

export function getRecentServiceUsers(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}
export function rememberRecentServiceUser(id: string) {
  const next = [id, ...getRecentServiceUsers().filter(x => x !== id)].slice(0, 8);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
}

interface PickerUser { id: string; name: string; preferredName?: string }

const initials = (n: string) => n.split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase();

function Avatar({ name }: { name: string }) {
  return (
    <span className="h-7 w-7 rounded-full bg-secondary text-foreground text-[10px] font-semibold flex items-center justify-center shrink-0" aria-hidden>
      {initials(name)}
    </span>
  );
}

export function ServiceUserPicker({
  users, value, onChange, siteChosen, singular, plural,
}: {
  users: PickerUser[];
  value: string;
  onChange: (id: string) => void;
  siteChosen: boolean;
  singular: string;
  plural: string;
}) {
  const [open, setOpen] = useState(false);
  const recent = getRecentServiceUsers();
  const rank = (id: string) => { const i = recent.indexOf(id); return i === -1 ? 999 : i; };
  const sorted = [...users].sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name));
  const recentUsers = sorted.filter(u => rank(u.id) < 999);
  const others = sorted.filter(u => rank(u.id) === 999);
  const selected = users.find(u => u.id === value);

  const choose = (id: string) => { onChange(id); setOpen(false); };

  const row = (u: PickerUser) => (
    <CommandItem key={u.id} value={`${u.name} ${u.preferredName ?? ""} ${u.id}`} onSelect={() => choose(u.id)} className="gap-2">
      <Avatar name={u.name} />
      <span className="flex-1 min-w-0">
        <span className="block text-sm truncate">{u.name}</span>
        {u.preferredName && <span className="block text-[11px] text-muted-foreground truncate">Prefers "{u.preferredName}"</span>}
      </span>
      {value === u.id && <Check className="h-4 w-4 text-primary" />}
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} disabled={!siteChosen}
          className="h-10 w-full justify-between rounded-xl bg-background font-normal px-3">
          <span className="flex items-center gap-2 min-w-0">
            {selected ? <><Avatar name={selected.name} /><span className="truncate">{selected.preferredName ? `${selected.name} (${selected.preferredName})` : selected.name}</span></>
              : value === NO_SERVICE_USER ? <span className="truncate">No {singular} involved</span>
              : <span className="text-muted-foreground truncate">{siteChosen ? `Search ${plural}` : "Select a site first"}</span>}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[min(92vw,22rem)]" align="start">
        <Command>
          <CommandInput placeholder="Search by name or preferred name" />
          <CommandList>
            <CommandEmpty>No active {plural} found at this site.</CommandEmpty>
            {recentUsers.length > 0 && <CommandGroup heading="Recently picked">{recentUsers.map(row)}</CommandGroup>}
            {others.length > 0 && <CommandGroup heading={recentUsers.length ? "Everyone at this site" : `Active ${plural} at this site`}>{others.map(row)}</CommandGroup>}
            <CommandGroup heading="Site-level event">
              <CommandItem value="no service user involved site level" onSelect={() => choose(NO_SERVICE_USER)} className="gap-2">
                <span className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0"><Building2 className="h-3.5 w-3.5 text-muted-foreground" /></span>
                <span className="flex-1 text-sm">No {singular} involved <span className="text-[11px] text-muted-foreground">(e.g. fire alarm)</span></span>
                <Check className={cn("h-4 w-4 text-primary", value === NO_SERVICE_USER ? "opacity-100" : "opacity-0")} />
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
