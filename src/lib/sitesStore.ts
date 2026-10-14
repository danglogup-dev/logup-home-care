/**
 * Sites store — seeded from demoDataRegistry, persisted to localStorage.
 * Sites are never deleted: deactivation flips status and keeps history.
 */
import { useSyncExternalStore } from "react";
import { SITES, type DemoSite, type SiteId } from "./demoDataRegistry";

const STORAGE_KEY = "logup.sites.v1";

function load(): DemoSite[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) return (p as DemoSite[]).map((x) => ({ ...(SITES.find((d) => d.id === x.id) ?? {}), ...x })); }
  } catch { /* ignore */ }
  return SITES.map((s) => ({ ...s }));
}

let sites: DemoSite[] = typeof window === "undefined" ? SITES.map((s) => ({ ...s })) : load();
const listeners = new Set<() => void>();
function emit() {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sites)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export const CENTRE_TYPE_LABELS: Record<DemoSite["centreType"], string> = {
  older_persons: "Older persons",
  disability: "Disability",
  childrens_residential: "Children's residential",
  home_support: "Home support",
  supported_living: "Supported living",
};

export const sitesStore = {
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  all(): DemoSite[] { return sites; },
  getById(id: string | undefined) { return sites.find((s) => s.id === id); },
  add(input: Omit<DemoSite, "id" | "status">): DemoSite {
    const site: DemoSite = { ...input, id: `SITE-${Date.now().toString(36).toUpperCase()}` as SiteId, status: "active" };
    sites = [...sites, site];
    emit();
    return site;
  },
  update(id: SiteId, patch: Partial<Omit<DemoSite, "id">>) {
    sites = sites.map((s) => (s.id === id ? { ...s, ...patch } : s));
    emit();
  },
  setStatus(id: SiteId, status: DemoSite["status"]) { this.update(id, { status }); },
};

export function siteLabel(id: string | undefined): string {
  return sitesStore.getById(id)?.name ?? "";
}

export function useSites(): DemoSite[] {
  return useSyncExternalStore(sitesStore.subscribe, sitesStore.all, sitesStore.all);
}
