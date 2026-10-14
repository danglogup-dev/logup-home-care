import { useEffect, useState } from "react";
import { roleStore, type RoleState } from "@/lib/roleStore";

export function useRole(): RoleState {
  const [s, setS] = useState<RoleState>(roleStore.get());
  useEffect(() => roleStore.subscribe(setS), []);
  return s;
}
