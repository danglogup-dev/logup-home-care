// Evidence is a first-class object on every incident.
// Shared types and small helpers used by the capture flow, the Board
// dialog and any future evidence surfaces.

export type EvidenceKind = "image" | "document" | "audio" | "video";

export interface EvidenceItem {
  id: string;
  name: string;
  mime: string;
  kind: EvidenceKind;
  size: number;             // bytes
  /** Data URL — works as preview source for image/audio/video and as a download href for docs. */
  dataUrl: string;
  uploadedBy: string;
  uploadedAt: string;       // human-friendly stamp e.g. "12 Apr · 09:14"
  capturedVia?: "camera" | "upload";
}

/** Derive evidence kind from a MIME type. Falls back to "document". */
export function kindFromMime(mime: string): EvidenceKind {
  if (!mime) return "document";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Read a File into a data URL. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function nowStamp(): string {
  const d = new Date();
  const day = d.getDate();
  const month = d.toLocaleString("en-IE", { month: "short" });
  const time = d.toTimeString().slice(0, 5);
  return `${day} ${month} · ${time}`;
}
