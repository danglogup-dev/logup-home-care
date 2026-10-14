import { Badge } from "@/components/ui/badge";
import { useIsHomeSupportOrg } from "@/lib/sitesStore";

export function DirectoryIncompleteBadge({ count, className = "ml-2" }: { count: number; className?: string }) {
  const homeSupport = useIsHomeSupportOrg();
  if (count <= 0 || homeSupport) return null;
  return (
    <Badge variant="outline" className={`${className} border-warning text-warning font-normal`}>
      Directory incomplete: {count} item{count === 1 ? "" : "s"}
    </Badge>
  );
}
