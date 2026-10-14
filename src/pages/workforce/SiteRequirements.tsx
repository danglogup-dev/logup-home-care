import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Building2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { workforceStore, type AppliesTo } from "@/lib/workforceStore";
import type { SiteId } from "@/lib/demoDataRegistry";
import { useRole } from "@/hooks/useRole";
import { inScope } from "@/lib/roleStore";
import { RoleContextBanner } from "@/components/RoleContextBanner";


const fade = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };

const SiteRequirements = () => {
  const [, force] = useState(0);
  useEffect(() => workforceStore.subscribe(() => force((n) => n + 1)), []);
  const role = useRole();

  const allSites = workforceStore.getSites();
  const sites = allSites.filter((s) => inScope(s.name, role.role, role.scope));
  const types = workforceStore.getQualificationTypes();
  const reqs = workforceStore.getRequirements();

  const [selected, setSelected] = useState<SiteId>((sites[0]?.id as SiteId) ?? "SITE-OAK");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ qualificationId: types[0]?.id ?? "", minimumPerShift: 1, appliesTo: "both" as AppliesTo, notes: "" });

  const siteReqs = reqs.filter((r) => r.siteId === selected);
  const site = sites.find((s) => s.id === selected);

  const addRequirement = () => {
    workforceStore.addRequirement({
      siteId: selected,
      qualificationId: form.qualificationId,
      minimumPerShift: Math.max(1, Number(form.minimumPerShift) || 1),
      appliesTo: form.appliesTo,
      notes: form.notes || undefined,
    });
    setOpen(false);
    setForm({ qualificationId: types[0]?.id ?? "", minimumPerShift: 1, appliesTo: "both", notes: "" });
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 pb-20">
      <motion.div {...fade}>
        <h1 className="font-heading text-2xl font-bold text-foreground">Site / unit requirements</h1>
        <p className="text-muted-foreground mt-1 text-sm">Define the minimum competencies each site needs on every shift.</p>
        <div className="mt-3"><RoleContextBanner /></div>
      </motion.div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
        <aside className="bg-card rounded-2xl border border-border shadow-soft p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground px-2 mb-2">Sites</p>
          <ul className="space-y-1">
            {sites.map((s) => {
              const active = s.id === selected;
              const count = reqs.filter((r) => r.siteId === s.id).length;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => setSelected(s.id as SiteId)}
                    className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                      active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-secondary"
                    }`}
                  >
                    <Building2 className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left">
                      <span className="block font-medium">{s.name}</span>
                      <span className="block text-[10px] text-muted-foreground">{s.unit}</span>
                    </span>
                    <Badge variant="outline" className="text-[10px]">{count}</Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="bg-card rounded-2xl border border-border shadow-soft p-5">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div>
              <h2 className="font-heading text-lg font-semibold text-foreground">{site?.name}</h2>
              <p className="text-[11px] text-muted-foreground">{site?.unit}{site?.notes ? ` · ${site.notes}` : ""}</p>
            </div>
            <Button size="sm" onClick={() => setOpen(true)} className="h-9 rounded-xl">
              <Plus className="h-4 w-4 mr-1" /> Add requirement
            </Button>
          </div>

          {siteReqs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No requirements yet for this site.</p>
          ) : (
            <ul className="divide-y divide-border">
              {siteReqs.map((r) => {
                const t = types.find((x) => x.id === r.qualificationId);
                return (
                  <li key={r.id} className="py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{t?.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        At least {r.minimumPerShift} per {r.appliesTo === "both" ? "shift (day & night)" : `${r.appliesTo} shift`}
                        {r.notes ? ` · ${r.notes}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        value={r.minimumPerShift}
                        onChange={(e) => workforceStore.updateRequirement(r.id, { minimumPerShift: Math.max(1, Number(e.target.value) || 1) })}
                        className="w-16 h-8 text-center"
                      />
                      <Select value={r.appliesTo} onValueChange={(v) => workforceStore.updateRequirement(r.id, { appliesTo: v as AppliesTo })}>
                        <SelectTrigger className="w-[110px] h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="both">Day & Night</SelectItem>
                          <SelectItem value="day">Day only</SelectItem>
                          <SelectItem value="night">Night only</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => workforceStore.removeRequirement(r.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add requirement — {site?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-foreground">Qualification</label>
              <Select value={form.qualificationId} onValueChange={(v) => setForm((f) => ({ ...f, qualificationId: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">Minimum per shift</label>
                <Input type="number" min={1} value={form.minimumPerShift} onChange={(e) => setForm((f) => ({ ...f, minimumPerShift: Math.max(1, Number(e.target.value) || 1) }))} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Applies to</label>
                <Select value={form.appliesTo} onValueChange={(v) => setForm((f) => ({ ...f, appliesTo: v as AppliesTo }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Day & Night</SelectItem>
                    <SelectItem value="day">Day only</SelectItem>
                    <SelectItem value="night">Night only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Notes (optional)</label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={addRequirement}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SiteRequirements;
