/**
 * Release feature flags. Modules switched off are hidden from the sidebar and
 * their routes show a "Not part of this release" panel. Code is kept intact.
 */
export const featureFlags = {
  audits: true,
  tasks: true,
  policies: true,
  workforce: true,
  visits: true,
} as const;

export type FeatureFlag = keyof typeof featureFlags;

const PREFIX_TO_FLAG: Record<string, FeatureFlag> = {
  audits: "audits",
  tasks: "tasks",
  policies: "policies",
  workforce: "workforce",
  visits: "visits",
};

/** Flag governing a module key such as "audits.my", or undefined if ungated. */
export function flagForModuleKey(key: string): FeatureFlag | undefined {
  return PREFIX_TO_FLAG[key.split(".")[0]];
}

/** True when the module key belongs to a released (or ungated) module. */
export function isModuleKeyReleased(key: string): boolean {
  const f = flagForModuleKey(key);
  return f ? featureFlags[f] : true;
}
