import type { Visit } from "./visitsStore";
import type { ServiceUser } from "./serviceUsersStore";
import { canAccess, inScopeSite, type RoleState } from "./roleStore";

export function myVisits(visits: readonly Visit[], users: readonly ServiceUser[], role: RoleState): Visit[] {
  if (!canAccess("visits.today", role.role)) return [];
  const allowed = new Set(users.filter((u) => inScopeSite(u.siteId, role)).map((u) => u.id));
  return visits.filter((v) => v.staffIds.includes(role.staffId) && allowed.has(v.clientId))
    .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart) || a.id.localeCompare(b.id));
}

export function visitsOnDate(visits: Visit[], date: Date): Visit[] {
  return visits.filter((v) => {
    const start = new Date(v.scheduledStart);
    return start.getFullYear() === date.getFullYear() && start.getMonth() === date.getMonth() && start.getDate() === date.getDate();
  });
}

export function clientTown(client: ServiceUser): string | undefined {
  const parts = client.homeAddress?.split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts || parts.length < 2) return undefined;
  return /^Co\.?\s/i.test(parts[parts.length - 1]) ? parts[parts.length - 2] : parts[parts.length - 1];
}

export function directionsUrl(client: ServiceUser): string | undefined {
  const destination = [client.homeAddress, client.eircode].filter(Boolean).join(", ");
  return destination ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${destination}, Ireland`)}` : undefined;
}

export function clientDisplayName(client: ServiceUser): string {
  return client.preferredName?.trim() || client.name;
}