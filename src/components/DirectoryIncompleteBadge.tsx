import { Badge } from "@/components/ui/badge";

export function DirectoryIncompleteBadge({ count, className = "ml-2" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <Badge variant="outline" className={`${className} border-warning text-warning font-normal`}>
      Directory incomplete: {count} item{count === 1 ? "" : "s"}
    </Badge>
  );
}
