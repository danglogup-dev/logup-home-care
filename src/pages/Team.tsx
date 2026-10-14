import { useTerms } from "@/hooks/useTerms";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, ArrowLeft, Users, Phone, Mail, Shield, Plus, ChevronDown, ChevronUp, UserPlus, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useRole } from "@/hooks/useRole";
import { can, inScope, ROLE_PRESETS } from "@/lib/roleStore";
import { SITES, STAFF_BY_ID, peopleAtSite, staffAtSite } from "@/lib/demoDataRegistry";

const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

interface StaffMember {
  name: string;
  role: string;
  permission: string;
  phone: string;
  email: string;
}

interface Site {
  name: string;
  pic: string;
  picTitle: string;
  residents: number;
  staff: StaffMember[];
}

// Staff and sites come from the shared registry; permission comes from the
// role-switcher preset for each staff ID (roleStore), never from a local list.
const PERMISSION_FOR_ROLE: Record<string, string> = { admin: "Admin", manager: "Manager", frontline: "Staff", viewonly: "View Only", external: "External" };

const emailFor = (name: string) =>
  `${name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z\s]/g, "").trim().replace(/\s+/g, ".")}@logup.example`;

const sitesData: Site[] = SITES.map((site) => {
  const picStaff = STAFF_BY_ID[site.personInChargeStaffId];
  return {
    name: site.name,
    pic: picStaff?.name ?? "—",
    picTitle: picStaff?.roleLabel ?? "Person in Charge",
    residents: peopleAtSite(site.id).length,
    staff: staffAtSite(site.id).filter((st) => !st.external).map((st) => {
      const preset = ROLE_PRESETS.find((p) => p.staffId === st.id);
      return {
        name: st.name,
        role: st.roleLabel,
        permission: PERMISSION_FOR_ROLE[preset?.role ?? ""] ?? st.accessRole,
        phone: "—",
        email: emailFor(st.name),
      };
    }),
  };
});

const permissionBadge = (perm: string) => {
  if (perm === "Admin" || perm === "Manager") return <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20 font-semibold">{perm}</Badge>;
  if (perm === "Staff") return <Badge variant="outline" className="text-[10px] bg-accent/10 text-accent border-accent/20 font-semibold">Staff</Badge>;
  return <Badge variant="outline" className="text-[10px]">View Only</Badge>;
};

const Team = () => {
  const terms = useTerms();
  const role = useRole();
  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newPermission, setNewPermission] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const site = sitesData.find(s => s.name === selectedSite);
  // Editing rights: Admin can edit anywhere; Manager can edit within scope; others read-only.
  const canEditHere = can("team.edit", role.role) && (role.role === "admin" || (selectedSite ? inScope(selectedSite, role.role, role.scope) : false));

  const handleAddMember = () => {
    if (!newName || !newRole || !newPermission) {
      toast("Missing fields", { description: "Name, role, and permission are required." });
      return;
    }
    toast("Team member added", { description: `${newName} has been added to ${selectedSite}.` });
    setShowAddForm(false);
    setNewName(""); setNewRole(""); setNewPermission(""); setNewPhone(""); setNewEmail("");
  };

  // Site detail view
  if (selectedSite && site) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 pb-20">
        <motion.div {...fade} transition={{ duration: 0.3 }}>
          <Button variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground" onClick={() => { setSelectedSite(null); setShowAddForm(false); setExpandedStaff(null); }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> All sites
          </Button>
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h1 className="font-heading text-2xl font-bold text-foreground">{site.name}</h1>
              <p className="text-muted-foreground mt-1 text-sm">PIC: {site.pic} · {terms.count(site.residents)} · {site.staff.length} staff</p>
            </div>
            {canEditHere ? (
              <Button size="sm" className="h-9 rounded-xl font-semibold text-sm" onClick={() => setShowAddForm(!showAddForm)}>
                <UserPlus className="h-4 w-4 mr-1" /> Add member
              </Button>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground border rounded-full px-2.5 py-1 bg-secondary/40">
                <Lock className="h-3 w-3" /> Read only · {role.role === "viewonly" ? "View-only role" : role.role === "frontline" ? "Frontline staff" : "Outside your scope"}
              </span>
            )}
          </div>
        </motion.div>

        {/* Add form */}
        <AnimatePresence>
          {showAddForm && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mt-4 bg-card rounded-2xl shadow-card border border-border p-5">
                <h3 className="font-heading font-semibold text-sm text-foreground mb-4">New team member</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input placeholder="Full name *" value={newName} onChange={e => setNewName(e.target.value)} className="h-9 rounded-xl text-sm" />
                  <Input placeholder="Role / Position *" value={newRole} onChange={e => setNewRole(e.target.value)} className="h-9 rounded-xl text-sm" />
                  <Select value={newPermission} onValueChange={setNewPermission}>
                    <SelectTrigger className="h-9 rounded-xl text-sm"><SelectValue placeholder="Permission level *" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Admin">Admin</SelectItem>
                      <SelectItem value="Staff">Staff</SelectItem>
                      <SelectItem value="View Only">View Only</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input placeholder="Phone" value={newPhone} onChange={e => setNewPhone(e.target.value)} className="h-9 rounded-xl text-sm" />
                  <Input placeholder="Email" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="h-9 rounded-xl text-sm sm:col-span-2" />
                </div>
                <div className="flex gap-2 mt-4">
                  <Button size="sm" className="h-9 rounded-xl text-sm font-semibold" onClick={handleAddMember}>Add member</Button>
                  <Button size="sm" variant="ghost" className="h-9 rounded-xl text-sm" onClick={() => setShowAddForm(false)}>Cancel</Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Staff list */}
        <div className="mt-6 space-y-2">
          {site.staff.map((member, idx) => {
            const isOpen = expandedStaff === member.email;
                        return (
              <motion.div key={member.email} {...fade} transition={{ delay: idx * 0.04, duration: 0.3 }} className="bg-card rounded-xl border border-border shadow-soft overflow-hidden">
                <button className="w-full text-left p-4 flex items-center gap-3 hover:bg-secondary/20 transition-colors" onClick={() => setExpandedStaff(isOpen ? null : member.email)}>
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-heading font-bold text-xs shrink-0">
                    {member.name.split(" ").map(n => n[0]).join("")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{member.name}</p>
                      {permissionBadge(member.permission)}
                    </div>
                    <p className="text-xs text-muted-foreground">{member.role}</p>
                  </div>
                  {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
                <AnimatePresence>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="border-t border-border px-4 py-3 space-y-2 bg-secondary/10">
                        <div className="flex items-center gap-2 text-sm text-foreground">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" /> {member.phone}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-foreground">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground" /> {member.email}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-foreground">
                          <Shield className="h-3.5 w-3.5 text-muted-foreground" /> Permission: {member.permission}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  }

  // Sites overview
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 pb-20">
      <motion.div {...fade} transition={{ duration: 0.4 }}>
        <h1 className="font-heading text-2xl font-bold text-foreground">Team</h1>
        <p className="text-muted-foreground mt-1 text-sm">Manage sites, staff, and permissions across your organisation.</p>
      </motion.div>

      <div className="mt-6 space-y-3">
        {sitesData.map((s, idx) => (
          <motion.div key={s.name} {...fade} transition={{ delay: 0.08 + idx * 0.06, duration: 0.4 }}>
            <button className="w-full text-left bg-card rounded-2xl shadow-card border border-border p-5 hover:shadow-md transition-shadow" onClick={() => setSelectedSite(s.name)}>
              <div className="flex items-start gap-4">
                <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-heading font-semibold text-foreground">{s.name}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{s.pic} · {s.picTitle}</p>
                  <div className="flex gap-4 mt-2">
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> {s.staff.length} staff</span>
                    <span className="text-xs text-muted-foreground">{terms.count(s.residents)}</span>
                  </div>
                </div>
                <ArrowLeft className="h-4 w-4 text-muted-foreground rotate-180 mt-1" />
              </div>
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default Team;
