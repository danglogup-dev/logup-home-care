import { useState } from "react";
import { Siren } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { browserLocation } from "@/lib/visitLocation";
import { sendVisitSos } from "@/lib/visitActions";
import { useRole } from "@/hooks/useRole";

export default function VisitSos({ visitId }: { visitId: string }) {
  const role = useRole();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [eventId, setEventId] = useState("");
  async function send(withLocation = true) {
    setBusy(true); setError("");
    try {
      const location = withLocation ? await browserLocation() : undefined;
      const event = sendVisitSos(visitId, role, location);
      setEventId(event.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not send SOS."); }
    finally { setBusy(false); }
  }
  return <>
    <Button className="min-h-12 bg-emergency px-4 text-base font-bold text-emergency-foreground hover:bg-emergency/90" onClick={() => { setOpen(true); setEventId(""); setError(""); }}><Siren aria-hidden="true" /> SOS</Button>
    <Dialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next); }}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
        <DialogHeader><DialogTitle>{eventId ? "SOS recorded" : "Raise urgent SOS?"}</DialogTitle><DialogDescription>This records an urgent Event for this visit. It does not call emergency services or guarantee a response.</DialogDescription></DialogHeader>
        <p className="text-base font-semibold">If there is immediate danger, call <a href="tel:112" className="text-primary underline">112</a> or <a href="tel:999" className="text-primary underline">999</a>.</p>
        {eventId ? <><p role="status" className="break-words text-base">Urgent Event {eventId} recorded and linked to this visit.</p><Button className="min-h-12" onClick={() => setOpen(false)}>Close</Button></> : <>
          {error && <p role="alert" className="text-base text-emergency">{error}</p>}
          <Button disabled={busy} className="min-h-14 bg-emergency text-base text-emergency-foreground hover:bg-emergency/90" onClick={() => send()}>{busy ? "Recording SOS…" : "Send urgent SOS"}</Button>
          {error && <Button disabled={busy} variant="outline" className="min-h-12 whitespace-normal" onClick={() => send(false)}>Send SOS without location</Button>}
        </>}
      </DialogContent>
    </Dialog>
  </>;
}