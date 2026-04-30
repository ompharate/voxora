import { InteraOneMode } from "./policy";

const DEFAULT_MODE: InteraOneMode = "self-host";

/**
 * Reads `INTERAONE_MODE` from the environment and normalises it.
 * Defaults to `"self-host"` if the variable is absent or unrecognised.
 */
export const getInteraOneMode = (): InteraOneMode => {
  const raw = (process.env.INTERAONE_MODE || "").toLowerCase();
  return raw === "cloud" ? "cloud" : DEFAULT_MODE;
};

/**
 * Returns `true` when the Enterprise Edition feature set should be active.
 *
 * Rules:
 * - Cloud mode: requires `INTERAONE_EE_ENABLED=true`.
 * - Self-host mode: requires a valid `INTERAONE_LICENSE_KEY` (must start with `interaone_`).
 */
export const isEeEnabledByEnv = (): boolean => {
  const mode = getInteraOneMode();
  if (mode === "cloud") {
    return (process.env.INTERAONE_EE_ENABLED || "false").toLowerCase() === "true";
  }
  const licenseKey = process.env.INTERAONE_LICENSE_KEY;
  return !!licenseKey && licenseKey.startsWith("interaone_");
};
