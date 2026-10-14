import { useTerms } from "@/hooks/useTerms";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MapPin, Plus, MoreHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useRole } from "@/hooks/useRole";
import { scopedSiteIds } from "@/lib/roleStore";
import { sitesStore, useSites, CENTRE_TYPE_LABELS } from "@/lib/sitesStore";
import { useServiceUsers } from "@/lib/serviceUsersStore";
import { STAFF, getStaffName, type DemoSite, type StaffId, type CentreType } from "@/lib/demoDataRegistry";

type Form = Omit<DemoSite, "id" | "status">;
const EMPTY: Form = { name: "", centreType: "older_persons", hiqaCentreId: "", address: "", personInChargeStaffId: "STAFF-DANIEL", carePlanReviewLeadStaffId: undefined };
const MANAGERS = STAFF.filter((s) => s.accessRole === "Manager" || s.accessRole === "Admin");

export default function Sites() {
  const terms = useTerms();
  const role = useRole();
  const sites = useSites();
  const { users } = useServiceUsers();
  const isAdmin = role.role === "admin";
  const visible = useMemo(() => {
    if (isAdmin) return sites;
    const ids = new Set<string>(scopedSiteIds(role));
    return sites.filter((s) => ids.has(s.id));
  }, [sites, role, isAdmin]);

  const navigate = useNavigate();
  const [confirmDeactivate, setConfirmDeactivate] = useState<DemoSite | null>(null);
  const [editing, setEditing] = useState<DemoSite | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const open = (s: DemoSite | "new") => {
    setEditing(s);
    setForm(s === "new" ? EMPTY : (({ id: _id, status: _st, ...rest }) => rest)(s));
  };
  const save = () => {
    if (!form.name.trim()) { toast.error("Site name is required"); return; }
    if (editing === "new") { sitesStore.add(form); toast.success("Site added"); }
    else if (editing) { sitesStore.update(editing.id, form); toast.success("Site updated"); }
    setEditing(null);
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Sites</h1>
            <Badge variant="outline" className="gap-1 bg-secondary/60"><MapPin className="h-3 w-3" /> {visible.length} in scope</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Sites in your scope. Deactivated sites keep all their history.</p>
        </div>
        {isAdmin && <Button onClick={() => open("new")}><Plus className="mr-1 h-4 w-4" /> Add site</Button>}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead><TableHead>Centre type</TableHead><TableHead>HIQA centre ID</TableHead>
                <TableHead>Person in charge</TableHead><TableHead>Care plan review lead</TableHead>
                <TableHead className="text-right">Active {terms.plural}</TableHead><TableHead>Status</TableHead>
                {isAdmin && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((s) => (
                <TableRow key={s.id} tabIndex={0} role="link" aria-label={`Open ${s.name}`} className="cursor-pointer"
                  onClick={() => navigate(`/app/org/sites/${s.id}`)}
                  onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); navigate(`/app/org/sites/${s.id}`); } }}>
                  <TableCell className="font-medium">{s.name}<div className="text-xs text-muted-foreground">{s.address}</div></TableCell>
                  <TableCell>{CENTRE_TYPE_LABELS[s.centreType]}</TableCell>
                  <TableCell>{s.hiqaCentreId || "—"}</TableCell>
                  <TableCell>{getStaffName(s.personInChargeStaffId)}</TableCell>
                  <TableCell>{s.carePlanReviewLeadStaffId ? getStaffName(s.carePlanReviewLeadStaffId) : "—"}</TableCell>
                  <TableCell className="text-right">{users.filter((u) => u.siteId === s.id && u.status === "active").length}</TableCell>
                  <TableCell><Badge variant={s.status === "active" ? "secondary" : "outline"} className="capitalize">{s.status}</Badge></TableCell>
                  {isAdmin && (
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`Actions for ${s.name}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => open(s)}>Edit</DropdownMenuItem>
                          {s.status === "active"
                            ? <DropdownMenuItem onSelect={() => setConfirmDeactivate(s)}>Deactivate</DropdownMenuItem>
                            : <DropdownMenuItem onSelect={() => { sitesStore.setStatus(s.id, "active"); toast.success("Site reactivated"); }}>Reactivate</DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmDeactivate} onOpenChange={(v) => !v && setConfirmDeactivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {confirmDeactivate?.name}?</AlertDialogTitle>
            <AlertDialogDescription>The site is not deleted. All history is kept — {terms.plural.toLowerCase()}, events, care plans and activity stay on record, and you can reactivate it at any time.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmDeactivate) { sitesStore.setStatus(confirmDeactivate.id, "inactive"); toast.success("Site deactivated"); } setConfirmDeactivate(null); }}>Deactivate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing === "new" ? "Add site" : "Edit site"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Centre type</Label>
              <Select value={form.centreType} onValueChange={(v) => setForm({ ...form, centreType: v as CentreType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(CENTRE_TYPE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>HIQA centre ID</Label><Input value={form.hiqaCentreId ?? ""} onChange={(e) => setForm({ ...form, hiqaCentreId: e.target.value })} /></div>
            <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div><Label>Person in charge</Label>
              <Select value={form.personInChargeStaffId} onValueChange={(v) => setForm({ ...form, personInChargeStaffId: v as StaffId })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MANAGERS.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Care plan review lead</Label>
              <Select value={form.carePlanReviewLeadStaffId ?? "none"} onValueChange={(v) => setForm({ ...form, carePlanReviewLeadStaffId: v === "none" ? undefined : v as StaffId })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">None</SelectItem>{MANAGERS.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
