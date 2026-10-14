import { Eye, Lock, Info } from "lucide-react";
import { useRole } from "@/hooks/useRole";

/**
 * Subtle contextual banner shown at the top of pages where the current role
 * meaningfully restricts the experience. Only renders for non-admin roles.
 */
export function RoleContextBanner({ note }: { note?: string }) {
  const r = useRole();
  if (r.role === "admin") return null;

  let label = "";
  let Icon = Info;
  if (r.role === "viewonly") { label = "View only — actions are disabled"; Icon = Eye; }
  else if (r.role === "frontline") { label = "Frontline view — limited to your day-to-day actions"; Icon = Lock; }
  else if (r.role === "manager") {
    label = `Manager scope · ${r.scope.length === 1 ? r.scope[0] : r.scope.join(" + ")}`;
    Icon = Info;
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed bg-secondary/40 px-3 py-1.5 text-[11px] text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      <span>{label}{note ? ` · ${note}` : ""}</span>
    </div>
  );
}

/**
 * Full-page "no access" panel used by route guards.
 */
export function NoAccessPanel({ moduleLabel, notReleased }: { moduleLabel: string; notReleased?: boolean }) {
  const r = useRole();
  if (notReleased) {
    return (
      <div className="max-w-lg mx-auto mt-16 rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-secondary">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <h2 className="font-heading text-lg font-semibold text-foreground">Not part of this release</h2>
        <p className="text-sm text-muted-foreground mt-2">{moduleLabel} is not available in this release.</p>
      </div>
    );
  }
  return (
    <div className="max-w-lg mx-auto mt-16 rounded-2xl border bg-card p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-secondary">
        <Lock className="h-5 w-5 text-muted-foreground" />
      </div>
      <h2 className="font-heading text-lg font-semibold text-foreground">{moduleLabel} isn't part of your access</h2>
      <p className="text-sm text-muted-foreground mt-2">
        You're signed in as <span className="font-medium text-foreground">{r.displayName}</span> ({r.title}).
        This area is reserved for other roles in the prototype.
      </p>
      <p className="text-[11px] text-muted-foreground mt-4">
        Use the role switcher in the top bar to demo a different perspective.
      </p>
    </div>
  );
}
