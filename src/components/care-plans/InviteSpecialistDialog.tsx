import { useTerms } from "@/hooks/useTerms";
import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Info, Copy, CheckCircle2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import {
  specialistContributionsStore,
  REGISTRATION_BODIES, REGULATED_BODIES,
  CARE_PLAN_SECTIONS, ACCESS_LEVELS,
  type AccessScopeType, type AccessLevel, type CarePlanSectionKey,
  type RegistrationBody, type SpecialistInvite,
} from "@/lib/specialistContributionsStore";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  personId: string;
  personName: string;
  site?: string;
  unit?: string;
  invitedBy: string;
}

export function InviteSpecialistDialog({
  open, onOpenChange, personId, personName, site, unit, invitedBy,
}: Props) {
  const terms = useTerms();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [profession, setProfession] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [registrationBody, setRegistrationBody] = useState<RegistrationBody>("CORU");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [scopeType, setScopeType] = useState<AccessScopeType>("person");
  const [sections, setSections] = useState<CarePlanSectionKey[]>([]);
  const [levels, setLevels] = useState<AccessLevel[]>(["contributory_notes"]);
  const [expiryDate, setExpiryDate] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [created, setCreated] = useState<SpecialistInvite | null>(null);

  const isRegulated = REGULATED_BODIES.includes(registrationBody);

  const scopeLabel = useMemo(() => {
    switch (scopeType) {
      case "person": return `${personName} only`;
      case "selected_people": return `Selected ${terms.plural}`;
      case "unit": return unit ? `${unit}` : "This unit / house";
      case "site": return site ? `${site}` : "This site";
    }
  }, [scopeType, personName, site, unit]);

  const canSubmit =
    fullName.trim() &&
    email.trim() &&
    profession.trim() &&
    organisation.trim() &&
    (!isRegulated || registrationNumber.trim()) &&
    sections.length > 0 &&
    levels.length > 0 &&
    reason.trim();

  const toggleSection = (k: CarePlanSectionKey) => {
    setSections((prev) => prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]);
  };
  const toggleLevel = (l: AccessLevel) => {
    setLevels((prev) => prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]);
  };

  const reset = () => {
    setFullName(""); setEmail(""); setProfession(""); setOrganisation("");
    setRegistrationBody("CORU"); setRegistrationNumber("");
    setScopeType("person"); setSections([]); setLevels(["contributory_notes"]);
    setExpiryDate(""); setReason(""); setMessage(""); setCreated(null);
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    const invite = specialistContributionsStore.createInvite({
      contributorName: fullName.trim(),
      contributorEmail: email.trim(),
      profession: profession.trim(),
      organisation: organisation.trim(),
      registrationBody,
      registrationNumber: isRegulated ? registrationNumber.trim() : "",
      invitedBy,
      accessScopeType: scopeType,
      accessScopeLabel: scopeLabel,
      personIds: scopeType === "person" || scopeType === "selected_people" ? [personId] : [],
      siteId: scopeType === "site" ? site : undefined,
      unitId: scopeType === "unit" ? unit : undefined,
      sectionAccess: sections,
      accessLevel: levels,
      expiryDate: expiryDate || undefined,
      reasonForAccess: reason.trim(),
      message: message.trim() || undefined,
    });
    setCreated(invite);
    toast({ title: "Specialist invite created", description: `${invite.contributorName} — ${scopeLabel}` });
  };

  const copyLink = () => {
    if (!created) return;
    navigator.clipboard?.writeText(window.location.origin + created.inviteLink);
    toast({ title: "Invite link copied" });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite specialist contributor</DialogTitle>
          <DialogDescription>
            Specialists may contribute notes, propose section updates, or upload documents.
            Care plan changes still go through the normal approval chain before publication.
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-4">
            <Alert className="border-emerald-200 bg-emerald-50">
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
              <AlertDescription className="text-sm">
                Invite created for <strong>{created.contributorName}</strong> ({created.profession}) — scope: {created.accessScopeLabel}.
                Email delivery is simulated in this prototype.
              </AlertDescription>
            </Alert>
            <div className="rounded-md border p-3 space-y-2">
              <Label className="text-xs uppercase text-muted-foreground">Invite link</Label>
              <div className="flex gap-2 items-center">
                <Input readOnly value={window.location.origin + created.inviteLink} className="font-mono text-xs" />
                <Button type="button" onClick={copyLink} size="sm"><Copy className="h-3.5 w-3.5 mr-1" /> Copy invite link</Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { reset(); }}>Send another invite</Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-5">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Professional registration details are recorded for governance and audit purposes.
                LogUp does not verify registration in this prototype.
              </AlertDescription>
            </Alert>

            {/* Identity */}
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label>Full name</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Sarah Keane" />
              </div>
              <div>
                <Label>Email address</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
              </div>
              <div>
                <Label>Profession / discipline{isRegulated && <span className="text-destructive"> *</span>}</Label>
                <Input value={profession} onChange={(e) => setProfession(e.target.value)} placeholder="e.g. Dietitian" />
              </div>
              <div>
                <Label>Organisation / employer</Label>
                <Input value={organisation} onChange={(e) => setOrganisation(e.target.value)} placeholder="e.g. Community Dietetics Team" />
              </div>
              <div>
                <Label>Registration body</Label>
                <select
                  value={registrationBody}
                  onChange={(e) => setRegistrationBody(e.target.value as RegistrationBody)}
                  className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                >
                  {REGISTRATION_BODIES.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <Label>Professional registration number{isRegulated && <span className="text-destructive"> *</span>}</Label>
                <Input
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value)}
                  placeholder={isRegulated ? "e.g. DT12345" : "Not required"}
                  disabled={!isRegulated}
                />
                {!isRegulated && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    This contributor is not recorded as a regulated professional.
                  </p>
                )}
              </div>
            </div>

            {/* Scope */}
            <div>
              <Label>Access scope</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
                {([
                  { v: "person", l: "This person only" },
                  { v: "selected_people", l: "Selected people" },
                  { v: "unit", l: "This unit / house" },
                  { v: "site", l: "This site" },
                ] as const).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setScopeType(o.v)}
                    className={`text-left rounded-md border p-2 text-sm ${scopeType === o.v ? "border-primary bg-primary/5" : "border-border"}`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Scope: {scopeLabel}</p>
            </div>

            {/* Sections */}
            <div>
              <Label>Care plan sections they can access</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 mt-1 rounded-md border p-3">
                {CARE_PLAN_SECTIONS.map((s) => (
                  <label key={s.key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={sections.includes(s.key)}
                      onCheckedChange={() => toggleSection(s.key)}
                    />
                    <span>{s.label}</span>
                  </label>
                ))}
              </div>
              {sections.length === 0 && <p className="text-[11px] text-destructive mt-1">Select at least one section.</p>}
            </div>

            {/* Access levels */}
            <div>
              <Label>Access level</Label>
              <div className="space-y-2 mt-1">
                {ACCESS_LEVELS.map((l) => (
                  <label key={l.value} className="flex items-start gap-3 rounded-md border p-3 cursor-pointer">
                    <Checkbox
                      checked={levels.includes(l.value)}
                      onCheckedChange={() => toggleLevel(l.value)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{l.label}</div>
                      <div className="text-xs text-muted-foreground">{l.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label>Access expiry date</Label>
                <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
              </div>
              <div>
                <Label>Reason for access</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Dietetic input following weight loss" />
              </div>
            </div>

            <div>
              <Label>Message to contributor (optional)</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Add a note the contributor will see with the invite." />
            </div>

            <div className="rounded-md bg-muted/40 border p-3 text-xs text-muted-foreground flex flex-wrap items-center gap-2">
              <Badge variant="outline">Governance</Badge>
              Any proposed section updates or notes still require Manager/PIC review and go through the approval chain before publication.
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={!canSubmit}>Create invite</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
