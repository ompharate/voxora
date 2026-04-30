import type { ReactNode } from "react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import {
  canAccessEeFeature,
  getCurrentPlan,
  getRequiredPlan,
  getInteraOneMode,
  isEeEnabledByEnv,
  isEeModulePresent,
} from "@/shared/ee";
import type { EeFeature } from "@/shared/ee";

interface EeFeatureGateProps {
  feature: EeFeature;
  children: ReactNode;
}

export function EeFeatureGate({ feature, children }: EeFeatureGateProps) {
  if (canAccessEeFeature(feature)) {
    return <>{children}</>;
  }

  const mode = getInteraOneMode();
  const requiredPlan = getRequiredPlan(feature);
  const currentPlan = getCurrentPlan();
  const enabledByEnv = isEeEnabledByEnv();
  const modulePresent = isEeModulePresent();

  let reason = "Upgrade your plan to unlock this feature.";
  if (mode === "self-host" && !enabledByEnv) {
    reason = "Valid Enterprise License Key is missing. Contact sales to get a key.";
  } else if (!enabledByEnv) {
    reason = "Enterprise features are disabled by environment configuration.";
  } else if (!modulePresent) {
    reason = "Enterprise module is not present in this deployment.";
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <Card className="w-full max-w-lg border-border">
        <CardHeader>
          <CardTitle>Upgrade required</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>{reason}</p>
          <p>
            Current plan: <span className="font-semibold text-foreground uppercase">{currentPlan}</span>
          </p>
          <p>
            Required plan: <span className="font-semibold text-foreground uppercase">{requiredPlan}</span>
          </p>
          <div className="pt-2">
            <Button type="button" className="cursor-pointer" disabled>
              Upgrade required
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
