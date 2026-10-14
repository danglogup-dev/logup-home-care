import { useMemo, useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/use-toast";
import {
  AlertTriangle, CheckCircle2, ShieldCheck, Lock, FileText, MessageSquare, Upload, Info,
} from "lucide-react";
import LogUpLogo from "@/components/LogUpLogo";
import {
  useSpecialistContributions, specialistContributionsStore,
  REGISTRATION_BODIES, REGULATED_BODIES, CARE_PLAN_SECTIONS,
  type RegistrationBody, type ContributionType, type CarePlanSectionKey,
} from "@/lib/specialistContributionsStore";
import { useCarePlans, SECTION_LABELS, formatDate } from "@/lib/carePlansStore";

function InvalidState({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <ExternalHeader />
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="max-w-lg w-full">
          <CardContent className="p-8 text-center space-y-3">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-secondary">
              <Lock className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="font-semibold text-lg">{title}</div>
            <p className="text-sm text-muted-foreground">{message}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ExternalHeader() {
  return (
    <header className="border-b bg-background">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-3">
        <LogUpLogo />
        <div className="text-xs text-muted-foreground">External specialist contribution portal</div>
      </div>
    </header>
  );
}

export default function CarePlanContribution() {
  const { inviteId = "" } = useParams();
  const state = useSpecialistContributions();
  const invite = state.invites.find((i) => i.id === inviteId);
  const { people, plans } = useCarePlans();

  const [confirmed, setConfirmed] = useState(false);
  const [declared, setDeclared] = useState(false);

  // Editable professional details (prefilled)
  const [fullName, setFullName] = useState(invite?.contributorName ?? "");
  const [email, setEmail] = useState(invite?.contributorEmail ?? "");
  const [profession, setProfession] = useState(invite?.profession ?? "");
  const [organisation, setOrganisation] = useState(invite?.organisation ?? "");
  const [registrationBody, setRegistrationBody] = useState<RegistrationBody>(invite?.registrationBody ?? "CORU");
  const [registrationNumber, setRegistrationNumber] = useState(invite?.registrationNumber ?? "");

  // Contribution form state
  const [contributionType, setContributionType] = useState<ContributionType | null>(null);
  const [affected, setAffected] = useState<CarePlanSectionKey[]>([]);
  const [note, setNote] = useState("");
  const [proposedSection, setProposedSection] = useState<CarePlanSectionKey | "">("");
  const [proposedText, setProposedText] = useState("");
  const [rationale, setRationale] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [docType, setDocType] = useState("");
  const [docNotes, setDocNotes] = useState("");
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const isRegulated = REGULATED_BODIES.includes(registrationBody);

  const personId = invite?.personIds[0];
  const person = people.find((p) => p.id === personId);
  const plan = plans.find((p) => p.personId === personId);
  const current = plan?.versions.find((v) => v.id === plan.currentVersionId);

  const allowedSections = invite?.sectionAccess ?? [];

  const priorContributions = useMemo(
    () => (invite ? state.contributions.filter((c) => c.inviteId === invite.id) : []),
    [state.contributions, invite],
  );

  // Record that the invite link was opened (audit trail)
  useEffect(() => {
    if (invite && invite.status !== "revoked" && invite.status !== "expired" && !invite.openedAt) {
      specialistContributionsStore.markInviteOpened(invite.id);
    }
  }, [invite]);

  // Guards
  if (!invite) return <InvalidState title="Invitation not found" message="We could not find this contribution invitation." />;
  if (invite.status === "expired") return <InvalidState title="Link expired" message="This contribution link has expired. Please contact the care provider for a new invitation." />;
  if (invite.status === "revoked") return <InvalidState title="Access revoked" message="This access has been revoked." />;

  const canProfNotes = invite.accessLevel.includes("contributory_notes");
  const canProposeUpdate = invite.accessLevel.includes("propose_section_update");
  const canUpload = invite.accessLevel.includes("upload_supporting_document");

  const professionalOk =
    fullName.trim() && email.trim() && profession.trim() && organisation.trim() &&
    (!isRegulated || registrationNumber.trim()) && declared;

  const canSubmit = (() => {
    if (!contributionType) return false;
    if (contributionType === "professional_note") return affected.length > 0 && note.trim().length > 0;
    if (contributionType === "proposed_section_update") return !!proposedSection && proposedText.trim().length > 0;
    if (contributionType === "supporting_document") return docTitle.trim().length > 0;
    return false;
  })();

  const toggleAffected = (k: CarePlanSectionKey) => {
    setAffected((prev) => prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]);
  };

  const handleSubmit = () => {
    if (!canSubmit || !personId || !contributionType) return;
    const rec = specialistContributionsStore.submitContribution({
      inviteId: invite.id,
      personId,
      contributorName: fullName.trim(),
      contributorEmail: email.trim(),
      profession: profession.trim(),
      organisation: organisation.trim(),
      registrationBody,
      registrationNumber: isRegulated ? registrationNumber.trim() : "",
      contributionType,
      affectedSections:
        contributionType === "professional_note" ? affected
          : contributionType === "proposed_section_update" ? [proposedSection as CarePlanSectionKey]
          : affected,
      note: contributionType === "professional_note" ? note.trim() : undefined,
      proposedText: contributionType === "proposed_section_update" ? proposedText.trim() : undefined,
      rationale: contributionType === "proposed_section_update" ? rationale.trim() : undefined,
      documentTitle: contributionType === "supporting_document" ? docTitle.trim() : undefined,
      documentType: contributionType === "supporting_document" ? docType.trim() : undefined,
    });
    setSubmittedId(rec.id);
    toast({ title: "Contribution submitted", description: "Manager/PIC review required before any care plan change." });
    // Reset form fields but keep confirmed identity
    setContributionType(null);
    setAffected([]); setNote(""); setProposedSection(""); setProposedText("");
    setRationale(""); setDocTitle(""); setDocType(""); setDocNotes("");
  };

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <ExternalHeader />

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-6 space-y-4">
        {/* Invite summary */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Care plan contribution invitation</div>
                <div className="text-lg font-semibold mt-0.5">
                  {person?.name ?? invite.accessScopeLabel}
                </div>
                <div className="text-sm text-muted-foreground">
                  {person ? `${person.site}${person.unit ? ` · ${person.unit}` : ""}` : invite.accessScopeLabel}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200 capitalize">
                  {invite.status}
                </Badge>
                <Badge variant="outline">{invite.profession}</Badge>
              </div>
            </div>
            <Separator />
            <div className="grid md:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-[11px] uppercase text-muted-foreground">Contributor</div>
                <div className="font-medium">{invite.contributorName}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-muted-foreground">Registration</div>
                <div className="font-medium">{invite.registrationBody}{invite.registrationNumber ? ` · ${invite.registrationNumber}` : ""}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-muted-foreground">Access expiry</div>
                <div className="font-medium">{invite.expiryDate ? formatDate(invite.expiryDate) : "No expiry set"}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-muted-foreground">Permitted sections</div>
                <div className="font-medium">{allowedSections.length} of {CARE_PLAN_SECTIONS.length}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Read-only approved care plan</AlertTitle>
          <AlertDescription className="text-sm">
            You can only view sections listed in this invitation. Any note or proposed change goes to Manager/PIC review — it does not update the live care plan. AI never approves or publishes.
          </AlertDescription>
        </Alert>

        {/* Step 1: Professional declaration */}
        {!confirmed && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Professional declaration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Professional registration details are recorded for governance and audit purposes.
                  LogUp does not verify registration in this prototype.
                </AlertDescription>
              </Alert>
              <div className="grid md:grid-cols-2 gap-3">
                <div><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
                <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><Label>Profession / discipline</Label><Input value={profession} onChange={(e) => setProfession(e.target.value)} /></div>
                <div><Label>Organisation / employer</Label><Input value={organisation} onChange={(e) => setOrganisation(e.target.value)} /></div>
                <div>
                  <Label>Registration body</Label>
                  <select value={registrationBody} onChange={(e) => setRegistrationBody(e.target.value as RegistrationBody)} className="w-full h-9 rounded-md border bg-background px-3 text-sm">
                    {REGISTRATION_BODIES.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Professional registration number{isRegulated && <span className="text-destructive"> *</span>}</Label>
                  <Input value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} disabled={!isRegulated} placeholder={isRegulated ? "Required" : "Not required"} />
                </div>
              </div>
              <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer">
                <Checkbox checked={declared} onCheckedChange={(v) => setDeclared(!!v)} className="mt-0.5" />
                <div className="text-sm">
                  I confirm I am contributing in my professional capacity and that the registration details provided are accurate.
                </div>
              </label>
              <div className="flex justify-end">
                <Button disabled={!professionalOk} onClick={() => setConfirmed(true)}>Confirm and continue</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Confirmation state */}
        {confirmed && submittedId && (
          <Alert className="border-emerald-200 bg-emerald-50">
            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
            <AlertTitle>Contribution submitted</AlertTitle>
            <AlertDescription className="text-sm">
              Your contribution has been sent for Manager/PIC review. It is not part of the approved care plan until reviewed and approved through the provider's care plan governance process.
            </AlertDescription>
          </Alert>
        )}

        {/* Step 2: Scoped care plan view + contribution form */}
        {confirmed && (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-4">
            {/* Left: permitted sections read-only */}
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Permitted care plan sections</div>
              {!current && (
                <Card><CardContent className="p-6 text-sm text-muted-foreground">Care plan not available.</CardContent></Card>
              )}
              {current && allowedSections.map((k) => {
                const sec = current.sections.find((s) => s.key === k);
                const sectionContribs = priorContributions.filter((c) => c.affectedSections.includes(k));
                return (
                  <Card key={k}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="font-medium">{SECTION_LABELS[k as keyof typeof SECTION_LABELS] ?? k}</div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">v{current.versionNumber}</Badge>
                          <Badge variant="outline" className="text-[10px] bg-muted">Read-only approved care plan</Badge>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{sec?.body ?? "Not recorded."}</p>
                      <div className="text-[11px] text-muted-foreground">Last reviewed {formatDate(current.publishedAt)}</div>
                      {sectionContribs.length > 0 && (
                        <>
                          <Separator />
                          <div className="text-[11px] uppercase text-muted-foreground">Previous specialist contributions</div>
                          <div className="space-y-1.5">
                            {sectionContribs.map((c) => (
                              <div key={c.id} className="rounded-md border p-2 text-xs">
                                <div className="flex items-center justify-between">
                                  <span className="font-medium">{c.contributorName} — {c.profession}</span>
                                  <Badge variant="outline" className="capitalize text-[10px]">{c.status.replace(/_/g, " ")}</Badge>
                                </div>
                                {c.note && <div className="mt-1 text-muted-foreground">"{c.note}"</div>}
                                {c.proposedText && <div className="mt-1 italic">Proposed: {c.proposedText}</div>}
                                <div className="text-muted-foreground mt-1">{formatDate(c.submittedAt)}</div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Right: contribution form */}
            <aside className="space-y-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Add a contribution</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-col gap-2">
                    {canProfNotes && (
                      <button type="button" onClick={() => setContributionType("professional_note")} className={`text-left rounded-md border p-3 text-sm flex gap-2 items-start ${contributionType === "professional_note" ? "border-primary bg-primary/5" : ""}`}>
                        <MessageSquare className="h-4 w-4 mt-0.5 text-primary" />
                        <div><div className="font-medium">Professional note</div><div className="text-xs text-muted-foreground">Contribute a clinical/professional note.</div></div>
                      </button>
                    )}
                    {canProposeUpdate && (
                      <button type="button" onClick={() => setContributionType("proposed_section_update")} className={`text-left rounded-md border p-3 text-sm flex gap-2 items-start ${contributionType === "proposed_section_update" ? "border-primary bg-primary/5" : ""}`}>
                        <FileText className="h-4 w-4 mt-0.5 text-primary" />
                        <div><div className="font-medium">Proposed section update</div><div className="text-xs text-muted-foreground">Requires Manager/PIC review.</div></div>
                      </button>
                    )}
                    {canUpload && (
                      <button type="button" onClick={() => setContributionType("supporting_document")} className={`text-left rounded-md border p-3 text-sm flex gap-2 items-start ${contributionType === "supporting_document" ? "border-primary bg-primary/5" : ""}`}>
                        <Upload className="h-4 w-4 mt-0.5 text-primary" />
                        <div><div className="font-medium">Supporting document</div><div className="text-xs text-muted-foreground">Attach an assessment or report.</div></div>
                      </button>
                    )}
                  </div>

                  {contributionType === "professional_note" && (
                    <div className="space-y-2">
                      <Label className="text-xs">Sections affected</Label>
                      <div className="space-y-1 rounded-md border p-2 max-h-40 overflow-auto">
                        {allowedSections.map((k) => (
                          <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox checked={affected.includes(k)} onCheckedChange={() => toggleAffected(k)} />
                            <span>{SECTION_LABELS[k as keyof typeof SECTION_LABELS] ?? k}</span>
                          </label>
                        ))}
                      </div>
                      <Label className="text-xs">Note</Label>
                      <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5} placeholder="Your professional note…" />
                    </div>
                  )}

                  {contributionType === "proposed_section_update" && (
                    <div className="space-y-2">
                      <Label className="text-xs">Section</Label>
                      <select value={proposedSection} onChange={(e) => setProposedSection(e.target.value as CarePlanSectionKey)} className="w-full h-9 rounded-md border bg-background px-3 text-sm">
                        <option value="">Select section…</option>
                        {allowedSections.map((k) => <option key={k} value={k}>{SECTION_LABELS[k as keyof typeof SECTION_LABELS] ?? k}</option>)}
                      </select>
                      <Label className="text-xs">Proposed wording</Label>
                      <Textarea value={proposedText} onChange={(e) => setProposedText(e.target.value)} rows={5} placeholder="Suggested wording for the section…" />
                      <Label className="text-xs">Rationale</Label>
                      <Textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={3} placeholder="Why is this change proposed?" />
                    </div>
                  )}

                  {contributionType === "supporting_document" && (
                    <div className="space-y-2">
                      <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                        <Upload className="h-5 w-5 mx-auto mb-1" /> File upload placeholder (prototype)
                      </div>
                      <Label className="text-xs">Document title</Label>
                      <Input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="e.g. Falls risk reassessment" />
                      <Label className="text-xs">Document type</Label>
                      <Input value={docType} onChange={(e) => setDocType(e.target.value)} placeholder="e.g. Assessment, Report" />
                      <Label className="text-xs">Notes</Label>
                      <Textarea value={docNotes} onChange={(e) => setDocNotes(e.target.value)} rows={3} />
                    </div>
                  )}

                  <div className="rounded-md bg-muted/40 border p-2 text-[11px] text-muted-foreground flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />
                    Specialist contribution only — Manager/PIC review required. This does not update the live care plan.
                  </div>

                  <Button className="w-full" disabled={!canSubmit} onClick={handleSubmit}>Submit contribution</Button>
                </CardContent>
              </Card>

              <div className="text-[11px] text-muted-foreground text-center">
                <Link to="/signin" className="underline">Not you? Sign out</Link>
              </div>
            </aside>
          </div>
        )}
      </main>

      <footer className="border-t bg-background">
        <div className="max-w-5xl mx-auto px-6 py-3 text-[11px] text-muted-foreground">
          LogUp external contribution portal · Specialist contributions require Manager/PIC review before any care plan change.
        </div>
      </footer>
    </div>
  );
}
