import { authApi } from "@/domains/auth/api/auth.api";
import { EE_FEATURE_POLICY, PLAN_WEIGHT } from "./policy";
import type { EeFeature, PlanTier, InteraOneMode } from "./policy";
export type { EeFeature, PlanTier, InteraOneMode } from "./policy";

const env = (import.meta as any).env || {};

export const getInteraOneMode = (): InteraOneMode => {
  const raw = (env.VITE_INTERAONE_MODE || env.INTERAONE_MODE || "self-host").toLowerCase();
  return raw === "cloud" ? "cloud" : "self-host";
};

export const isEeEnabledByEnv = (): boolean => {
  const mode = getInteraOneMode();
  if (mode === "cloud") return true;
  const licenseKey = String(env.VITE_INTERAONE_LICENSE_KEY || env.INTERAONE_LICENSE_KEY || "");
  if (licenseKey.startsWith("interaone_")) return true;
  return false;
};

export const isEeModulePresent = (): boolean => {
  const raw = String(env.VITE_INTERAONE_EE_MODULE_PRESENT || "true").toLowerCase();
  return raw !== "false";
};

export const normalizePlan = (plan?: string | null): PlanTier => {
  const normalized = (plan || "").toLowerCase();
  if (normalized === "pro" || normalized === "proplus" || normalized === "enterprise") return normalized;
  return "free";
};

export const getCurrentPlan = (): PlanTier => {
  return normalizePlan(authApi.getOrgPlan());
};

export const getRequiredPlan = (feature: EeFeature): PlanTier => EE_FEATURE_POLICY[feature].requiredPlan;

export const isFeatureEnabledForMode = (feature: EeFeature): boolean => {
  return EE_FEATURE_POLICY[feature].enabledModes.includes(getInteraOneMode());
};

export const canAccessEeFeature = (feature: EeFeature): boolean => {
  if (!isFeatureEnabledForMode(feature)) return false;
  if (!isEeEnabledByEnv() || !isEeModulePresent()) return false;

  const current = getCurrentPlan();
  return PLAN_WEIGHT[current] >= PLAN_WEIGHT[getRequiredPlan(feature)];
};