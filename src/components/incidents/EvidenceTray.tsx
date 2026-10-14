import { useRef } from "react";
import { Camera, ImagePlus, FileUp, Mic, Video, X, FileText, Music2, Film, Image as ImageIcon, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  EvidenceItem, EvidenceKind, fileToDataUrl, kindFromMime, formatBytes, nowStamp,
} from "@/lib/evidence";
import { toast } from "sonner";

interface EvidenceTrayProps {
  items: EvidenceItem[];
  uploadedBy: string;
  onAdd: (item: EvidenceItem) => void;
  onRemove?: (id: string) => void;
  /** Hide uploader buttons (read-only render). */
  readOnly?: boolean;
  /** Compact label / spacing for use inside dialogs. */
  compact?: boolean;
}

const KIND_ICON: Record<EvidenceKind, typeof FileText> = {
  image: ImageIcon,
  document: FileText,
  audio: Music2,
  video: Film,
};

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB per file — pragmatic in-memory cap

export function EvidenceTray({
  items, uploadedBy, onAdd, onRemove, readOnly = false, compact = false,
}: EvidenceTrayProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (
    files: FileList | null,
    capturedVia: "camera" | "upload",
    kindHint?: EvidenceKind,
  ) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name} is too large`, {
          description: `Files must be 20 MB or smaller. ${formatBytes(file.size)} provided.`,
        });
        continue;
      }
      try {
        const dataUrl = await fileToDataUrl(file);
        const kind = kindHint ?? kindFromMime(file.type);
        const item: EvidenceItem = {
          id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          mime: file.type || "application/octet-stream",
          kind,
          size: file.size,
          dataUrl,
          uploadedBy,
          uploadedAt: nowStamp(),
          capturedVia,
        };
        onAdd(item);
      } catch {
        toast.error(`Could not read ${file.name}`);
      }
    }
  };

  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="rounded-lg gap-1.5"
            onClick={() => cameraRef.current?.click()}>
            <Camera className="h-3.5 w-3.5" /> Take photo
          </Button>
          <Button type="button" variant="outline" size="sm" className="rounded-lg gap-1.5"
            onClick={() => imageRef.current?.click()}>
            <ImagePlus className="h-3.5 w-3.5" /> Upload image
          </Button>
          <Button type="button" variant="outline" size="sm" className="rounded-lg gap-1.5"
            onClick={() => docRef.current?.click()}>
            <FileUp className="h-3.5 w-3.5" /> Upload document
          </Button>
          <Button type="button" variant="outline" size="sm" className="rounded-lg gap-1.5"
            onClick={() => audioRef.current?.click()}>
            <Mic className="h-3.5 w-3.5" /> Upload audio
          </Button>
          <Button type="button" variant="outline" size="sm" className="rounded-lg gap-1.5"
            onClick={() => videoRef.current?.click()}>
            <Video className="h-3.5 w-3.5" /> Upload video
          </Button>

          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => { handleFiles(e.target.files, "camera", "image"); e.target.value = ""; }} />
          <input ref={imageRef} type="file" accept="image/*" multiple hidden
            onChange={(e) => { handleFiles(e.target.files, "upload", "image"); e.target.value = ""; }} />
          <input ref={docRef} type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.rtf,.odt,application/pdf"
            multiple hidden
            onChange={(e) => { handleFiles(e.target.files, "upload", "document"); e.target.value = ""; }} />
          <input ref={audioRef} type="file" accept="audio/*" multiple hidden
            onChange={(e) => { handleFiles(e.target.files, "upload", "audio"); e.target.value = ""; }} />
          <input ref={videoRef} type="file" accept="video/*" multiple hidden
            onChange={(e) => { handleFiles(e.target.files, "upload", "video"); e.target.value = ""; }} />
        </div>
      )}

      {items.length === 0 ? (
        <div className={`rounded-lg border border-dashed border-border ${compact ? "p-3" : "p-4"} text-center`}>
          <Paperclip className="h-4 w-4 text-muted-foreground mx-auto mb-1.5" />
          <p className="text-xs text-muted-foreground">
            No evidence attached yet. {readOnly ? "" : "Add photos, documents, audio or video."}
          </p>
        </div>
      ) : (
        <ul className={`grid gap-2 ${compact ? "sm:grid-cols-1" : "sm:grid-cols-2"}`}>
          {items.map((e) => {
            const Icon = KIND_ICON[e.kind];
            return (
              <li key={e.id}
                className="group flex gap-3 items-start rounded-lg border border-border bg-card p-2.5">
                {/* Preview */}
                <div className="h-14 w-14 shrink-0 rounded-md bg-secondary/40 border border-border overflow-hidden flex items-center justify-center">
                  {e.kind === "image" ? (
                    <img src={e.dataUrl} alt={e.name} className="h-full w-full object-cover" />
                  ) : e.kind === "video" ? (
                    <video src={e.dataUrl} className="h-full w-full object-cover" muted />
                  ) : (
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>

                {/* Meta */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px] capitalize">{e.kind}</Badge>
                    {e.capturedVia === "camera" && (
                      <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">
                        Camera
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs font-medium text-foreground truncate mt-1" title={e.name}>{e.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatBytes(e.size)} · {e.uploadedAt} · {e.uploadedBy}
                  </p>
                  {/* Inline preview controls for audio */}
                  {e.kind === "audio" && (
                    <audio src={e.dataUrl} controls className="mt-1.5 w-full h-7" />
                  )}
                  <div className="mt-1.5 flex items-center gap-2">
                    <a
                      href={e.dataUrl}
                      download={e.name}
                      className="text-[10px] text-primary hover:underline"
                    >
                      Download
                    </a>
                    {e.kind === "image" || e.kind === "video" ? (
                      <a
                        href={e.dataUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-primary hover:underline"
                      >
                        Open
                      </a>
                    ) : null}
                  </div>
                </div>

                {!readOnly && onRemove && (
                  <button
                    type="button"
                    onClick={() => onRemove(e.id)}
                    aria-label={`Remove ${e.name}`}
                    className="h-6 w-6 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
