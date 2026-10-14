import { isManagerRole } from "@/lib/roleStore";
import { useEffect, useState } from "react";
import { ShieldCheck, ChevronDown, Eye, Users, Briefcase, HardHat, Building2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { roleStore, ROLE_PRESETS, type RoleState, type Role } from "@/lib/roleStore";
import { cn } from "@/lib/utils";

const ROLE_META: Record<Role, { label: string; icon: typeof ShieldCheck; tone: string }> = {
  admin:     { label: "Admin",            icon: ShieldCheck, tone: "bg-primary/10 text-primary border-primary/20" },
  manager:   { label: "Manager",          icon: Briefcase,   tone: "bg-amber-50 text-amber-900 border-amber-200" },
  coordinator: { label: "Coordinator", icon: Briefcase, tone: "bg-accent text-accent-foreground border-border" },
  frontline: { label: "Frontline staff",  icon: HardHat,     tone: "bg-emerald-50 text-emerald-900 border-emerald-200" },
  viewonly:  { label: "View only",        icon: Eye,         tone: "bg-slate-100 text-slate-700 border-slate-200" },
  external:  { label: "External specialist", icon: Building2, tone: "bg-violet-50 text-violet-900 border-violet-200" },
};

export function RoleSwitcher() {
  const [s, setS] = useState<RoleState>(roleStore.get());
  const [open, setOpen] = useState(false);
  useEffect(() => roleStore.subscribe(setS), []);
  const meta = ROLE_META[s.role];
  const Icon = meta.icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-90",
            meta.tone,
          )}
          aria-label="Demo role switcher"
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Viewing as</span>
          <span className="font-semibold">{meta.label}</span>
          {isManagerRole(s.role) && s.scope.length > 0 && (
            <span className="hidden md:inline text-[10px] opacity-75 border-l border-current/30 pl-2 ml-1">
              {s.scope.length === 1 ? s.scope[0] : `${s.scope.length} sites`}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b bg-secondary/40">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Demo role switcher</p>
          <p className="text-xs text-muted-foreground mt-0.5">Switch perspectives to see how access changes.</p>
        </div>
        <div className="max-h-96 overflow-y-auto p-1">
          {ROLE_PRESETS.map((p) => {
            const PIcon = ROLE_META[p.role].icon;
            const active = p.id === s.presetId;
            return (
              <button
                key={p.id}
                onClick={() => { roleStore.setPreset(p.id); setOpen(false); }}
                className={cn(
                  "w-full text-left rounded-md px-3 py-2 hover:bg-secondary transition-colors flex items-start gap-2.5",
                  active && "bg-primary/5 ring-1 ring-primary/20",
                )}
              >
                <div className={cn("mt-0.5 grid h-7 w-7 place-items-center rounded-full border shrink-0", ROLE_META[p.role].tone)}>
                  <PIcon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground leading-tight">{p.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                  <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                    <Users className="h-3 w-3" /> {p.displayName} · {p.title}
                  </p>
                </div>
                {active && <Badge variant="outline" className="text-[10px] bg-primary text-primary-foreground border-transparent">Active</Badge>}
              </button>
            );
          })}
        </div>
        <div className="px-4 py-2 border-t bg-secondary/30">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Building2 className="h-3 w-3" /> Prototype demo only — production uses real auth & RLS.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
