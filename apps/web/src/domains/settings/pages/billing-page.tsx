import { useEffect, useState } from "react";
import { authApi } from "@/domains/auth/api/auth.api";
import { apiClient } from "@/shared/lib/api-client";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardDescription } from "@/shared/ui/card";
import {
  Check,
  Sparkles,
  Zap,
  Building2,
  MessageSquare,
  Users,
  UserCheck,
  BookUser,
  ArrowRight,
  Loader2,
  Crown,
  Star,
  ServerIcon,
  LockIcon,
  InfoIcon,
  ExternalLink,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type BillingPortalResponse = {
  success: boolean;
  message: string;
  data?: { url: string; provider?: string };
};

type PlanTier = "free" | "pro" | "proplus" | "enterprise";
type PaidPlan = "pro" | "proplus";

type PlanDefinition = {
  plan: PlanTier;
  priceMonthlyUsd: number;
  summary: string;
  features: string[];
  limits: Record<"messages" | "teams" | "humanAgents" | "contacts", number | null>;
};

type EntitlementsResponse = {
  success: boolean;
  message: string;
  data?: {
    currentPlan: PlanTier;
    plans: PlanDefinition[];
    entitlements: {
      mode: "cloud" | "self-host";
      ee: { enabledByEnv: boolean; modulePresent: boolean; isAvailable: boolean };
      eeFeatures: {
        billing?: { enabled: boolean; requiredPlan: PlanTier };
        contacts?: { enabled: boolean; requiredPlan: PlanTier };
        "white-label"?: { enabled: boolean; requiredPlan: PlanTier };
      };
      limits: PlanDefinition["limits"];
    };
  };
};

type UsageStat = { used: number; limit: number | null; pct: number };
type UsageSnapshot = {
  period: string;
  resetsAt: string;
  usage: Record<string, UsageStat>;
};
type UsageResponse = { success: boolean; data: UsageSnapshot };

// ─── Static data ──────────────────────────────────────────────────────────────

const FALLBACK_PLANS: PlanDefinition[] = [
  {
    plan: "free",
    priceMonthlyUsd: 0,
    summary: "Starter plan for small support workflows.",
    features: ["Everything in OSS core", "Voxora branding", "Community support"],
    limits: { messages: 50, teams: 1, humanAgents: 2, contacts: 10 },
  },
  {
    plan: "pro",
    priceMonthlyUsd: 10,
    summary: "Built for growing support teams.",
    features: ["Voxora branding", "Standard email support", "Advanced analytics", "API access"],
    limits: { messages: 500, teams: 2, humanAgents: 5, contacts: 500 },
  },
  {
    plan: "proplus",
    priceMonthlyUsd: 39,
    summary: "High-volume plan for fast scaling teams.",
    features: ["Voxora branding", "Priority support", "Custom integrations", "SLA guarantee", "Audit logs"],
    limits: { messages: 5000, teams: 10, humanAgents: 50, contacts: 5000 },
  },
  {
    plan: "enterprise",
    priceMonthlyUsd: 0,
    summary: "Custom unlimited plan for enterprise customers.",
    features: [
      "No Voxora branding",
      "Everything unlimited",
      "Custom contract and onboarding",
      "Dedicated SLA",
      "SSO & SAML",
    ],
    limits: { messages: null, teams: null, humanAgents: null, contacts: null },
  },
];

const formatLimit = (value: number | null, selfHost = false): string => {
  if (selfHost || value === null) return "Unlimited";
  return value.toLocaleString();
};

const planMeta: Record<
  PlanTier,
  { icon: React.ReactNode; color: string; gradient: string; accentStrip: string }
> = {
  free: {
    icon: <Star className="h-4 w-4" />,
    color: "text-muted-foreground",
    gradient: "from-muted/60 to-muted/20",
    accentStrip: "from-muted to-muted/50",
  },
  pro: {
    icon: <Zap className="h-4 w-4" />,
    color: "text-primary",
    gradient: "from-primary/10 to-primary/5",
    accentStrip: "from-primary to-primary/60",
  },
  proplus: {
    icon: <Crown className="h-4 w-4" />,
    color: "text-amber-500",
    gradient: "from-amber-500/10 to-amber-500/5",
    accentStrip: "from-amber-500 to-amber-400/60",
  },
  enterprise: {
    icon: <Building2 className="h-4 w-4" />,
    color: "text-purple-500",
    gradient: "from-purple-500/10 to-purple-500/5",
    accentStrip: "from-purple-500 to-purple-400/60",
  },
};

const planDisplayName: Record<PlanTier, string> = {
  free: "Free",
  pro: "Pro",
  proplus: "Pro+",
  enterprise: "Enterprise",
};

const limitItems: {
  key: "messages" | "teams" | "humanAgents" | "contacts";
  label: string;
  icon: React.ReactNode;
}[] = [
  { key: "messages", label: "Messages/month", icon: <MessageSquare className="h-3.5 w-3.5" /> },
  { key: "teams", label: "Teams", icon: <Users className="h-3.5 w-3.5" /> },
  { key: "humanAgents", label: "Human agents", icon: <UserCheck className="h-3.5 w-3.5" /> },
  { key: "contacts", label: "Contacts", icon: <BookUser className="h-3.5 w-3.5" /> },
];

// ─── Self-hosted banner ───────────────────────────────────────────────────────

function SelfHostedBanner({
  currentPlanDef,
}: {
  currentPlanDef: PlanDefinition | undefined;
}) {
  return (
    <div className="space-y-4">
      {/* Hero notice */}
      <div className="flex items-start gap-4 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-5">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <ServerIcon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="font-semibold">Self-hosted deployment — all features unlocked</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You are running Voxora on your own infrastructure. All OSS core features are available
            without limits. Billing and paid EE features do not apply to self-hosted deployments.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="secondary" className="text-[10px] uppercase">Self-hosted</Badge>
            <Badge variant="outline" className="text-[10px] uppercase text-primary border-primary/30">
              All OSS Features Active
            </Badge>
            <Badge variant="outline" className="text-[10px] uppercase">
              EE billing N/A
            </Badge>
          </div>
        </div>
      </div>

      {/* Current usage status */}
      {currentPlanDef && (
        <div className="rounded-xl border bg-gradient-to-br from-muted/40 to-muted/10 p-4">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <InfoIcon className="h-3 w-3" />
            Your current access
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {limitItems.map(({ key, label, icon }) => (
              <div
                key={key}
                className="flex flex-col gap-1 rounded-lg border bg-background/60 px-3 py-2"
              >
                <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {icon}
                  {label}
                </span>
                <span className="text-sm font-bold text-primary">
                  {formatLimit(currentPlanDef.limits[key], true)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* What EE would give you */}
      <div className="rounded-xl border border-dashed px-4 py-3">
        <p className="mb-1 text-xs font-semibold text-muted-foreground">
          Looking for EE features like white-labelling, advanced contacts & SLA?
        </p>
        <p className="text-xs text-muted-foreground">
          Enterprise Edition (EE) features are available for self-hosted users via a separate
          license. Contact us to learn more.
        </p>
        <a
          href="mailto:sales@voxora.cloud?subject=Voxora%20EE%20Self-hosted%20License"
          className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline underline-offset-2"
        >
          Contact sales about EE licensing
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

// ─── Plan card (cloud) ────────────────────────────────────────────────────────

interface PlanCardProps {
  plan: PlanDefinition;
  isPopular: boolean;
  canBuy: boolean; // cloud + EE enabled
  loading: boolean;
  selectedPlan: PaidPlan;
  onUpgrade: (plan: PaidPlan) => void;
}

function PlanCard({ plan, isPopular, canBuy, loading, selectedPlan, onUpgrade }: PlanCardProps) {
  const meta = planMeta[plan.plan];
  const isUpgradeable = plan.plan === "pro" || plan.plan === "proplus";

  return (
    <div className="relative flex flex-col">
      {isPopular && (
        <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground shadow-sm">
            <Sparkles className="h-2.5 w-2.5" />
            Most Popular
          </span>
        </div>
      )}

      <Card
        className={`relative flex flex-col h-full transition-all duration-200 ${
          !canBuy
            ? "opacity-60 grayscale-[30%]"
            : isPopular
            ? "ring-1 ring-primary/40 shadow-sm hover:shadow-md hover:ring-primary/60"
            : "hover:shadow-sm hover:ring-foreground/20"
        }`}
      >
        {/* Locked overlay indicator */}
        {!canBuy && (
          <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-md border bg-muted/80 px-1.5 py-0.5 text-[10px] text-muted-foreground backdrop-blur-sm">
            <LockIcon className="h-2.5 w-2.5" />
            EE required
          </div>
        )}

        {/* Accent strip */}
        <div className={`h-1 w-full rounded-t-xl bg-gradient-to-r ${meta.accentStrip}`} />

        <CardHeader className="pb-2 pt-4">
          <div className={`flex items-center gap-1.5 ${meta.color} font-medium text-sm`}>
            {meta.icon}
            <span>{planDisplayName[plan.plan]}</span>
          </div>
          <div className="mt-2 flex items-end gap-1">
            {plan.priceMonthlyUsd === 0 && plan.plan === "enterprise" ? (
              <span className="text-2xl font-bold">Custom</span>
            ) : (
              <>
                <span className="text-2xl font-bold">${plan.priceMonthlyUsd}</span>
                <span className="mb-0.5 text-xs text-muted-foreground">/mo</span>
              </>
            )}
          </div>
          <CardDescription className="text-xs">{plan.summary}</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-4">
          {/* Features */}
          <ul className="space-y-1.5">
            {plan.features.map((feature) => (
              <li
                key={`${plan.plan}-${feature}`}
                className="flex items-start gap-2 text-xs text-muted-foreground"
              >
                <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${meta.color}`} />
                {feature}
              </li>
            ))}
          </ul>

          <div className="border-t border-dashed" />

          {/* Limits */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            {limitItems.map(({ key, label, icon }) => (
              <div key={key} className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  {icon}
                  {label}
                </span>
                <span className="text-xs font-semibold">{formatLimit(plan.limits[key])}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="mt-auto pt-1">
            {isUpgradeable && (
              <Button
                onClick={() => canBuy && onUpgrade(plan.plan as PaidPlan)}
                className={`group w-full transition-all ${
                  canBuy ? "cursor-pointer" : "cursor-not-allowed"
                } ${
                  plan.plan === "proplus"
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500 hover:text-white dark:text-amber-400 dark:hover:text-white"
                    : ""
                }`}
                variant={plan.plan === "proplus" ? "outline" : "default"}
                disabled={!canBuy || loading}
              >
                {loading && selectedPlan === plan.plan ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Redirecting…
                  </>
                ) : (
                  <>
                    {canBuy ? (
                      <>
                        Upgrade to {planDisplayName[plan.plan]}
                        <ArrowRight className="ml-1.5 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </>
                    ) : (
                      <>
                        <LockIcon className="mr-1.5 h-3.5 w-3.5" />
                        Requires EE module
                      </>
                    )}
                  </>
                )}
              </Button>
            )}

            {plan.plan === "enterprise" && (
              <Button
                onClick={() => {
                  window.location.href =
                    "mailto:sales@voxora.cloud?subject=Voxora%20Enterprise%20Plan";
                }}
                className="group w-full cursor-pointer"
                variant="outline"
              >
                Contact sales
                <ArrowRight className="ml-1.5 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function BillingPage() {
  const localPlan = (authApi.getOrgPlan() || "free") as PlanTier;
  const [currentPlan, setCurrentPlan] = useState<PlanTier>(localPlan);
  const [plans, setPlans] = useState<PlanDefinition[]>(FALLBACK_PLANS);
  const [mode, setMode] = useState<"cloud" | "self-host">("self-host");
  const [eeAvailable, setEeAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PaidPlan>("pro");
  const [error, setError] = useState<string | null>(null);
  const [usageSnapshot, setUsageSnapshot] = useState<UsageSnapshot | null>(null);

  useEffect(() => {
    const orgId = authApi.getActiveOrgId();
    if (!orgId) return;

    const loadEntitlements = async () => {
      try {
        const res = await apiClient.get<EntitlementsResponse>(
          `/organizations/${orgId}/billing/entitlements`
        );
        const data = res.data;
        if (!data) return;
        setCurrentPlan(data.currentPlan || localPlan);
        setPlans(data.plans?.length ? data.plans : FALLBACK_PLANS);
        setMode(data.entitlements?.mode || "self-host");
        setEeAvailable(Boolean(data.entitlements?.ee?.isAvailable));
      } catch {
        // Keep fallback values when entitlements endpoint is unavailable.
      }
    };

    const loadUsage = async () => {
      try {
        const res = await apiClient.get<UsageResponse>(
          `/organizations/${orgId}/billing/usage`
        );
        if (res?.data) setUsageSnapshot(res.data);
      } catch {
        // Non-critical — usage bars are informational only.
      }
    };

    void loadEntitlements();
    void loadUsage();
  }, [localPlan]);

  const openBillingPortal = async (plan: PaidPlan) => {
    const orgId = authApi.getActiveOrgId();
    if (!orgId) {
      setError("Organization not found");
      return;
    }
    setLoading(true);
    setError(null);
    setSelectedPlan(plan);
    try {
      const res = await apiClient.get<BillingPortalResponse>(
        `/organizations/${orgId}/billing/portal?targetPlan=${plan}`
      );
      const url = res.data?.url || null;
      if (url) window.location.href = url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to open billing portal");
    } finally {
      setLoading(false);
    }
  };

  const isSelfHost = mode === "self-host";
  // Upgrades are only interactive on cloud with EE enabled.
  const canBuy = !isSelfHost && eeAvailable;

  const order: PlanTier[] = ["free", "pro", "proplus", "enterprise"];
  const allSortedPlans = plans
    .slice()
    .sort((a, b) => order.indexOf(a.plan) - order.indexOf(b.plan));
  const currentPlanDef = allSortedPlans.find((p) => p.plan === currentPlan);

  // On cloud, hide the current plan from the grid (it's in the banner).
  // On self-host, don't show the plan grid at all.
  const plansForGrid = isSelfHost
    ? []
    : allSortedPlans.filter((p) => p.plan !== currentPlan);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Billing &amp; Plans
        </h2>
        <p className="text-sm text-muted-foreground">
          {isSelfHost
            ? "You are running a self-hosted instance. All OSS features are unrestricted."
            : "Manage your subscription and unlock advanced capabilities for your team."}
        </p>
      </div>

      {/* ── Self-hosted: full open-source banner ── */}
      {isSelfHost && (
        <SelfHostedBanner currentPlanDef={currentPlanDef} />
      )}

      {/* ── Cloud: current plan status banner ── */}
      {!isSelfHost && currentPlanDef && (
        <div
          className={`relative overflow-hidden rounded-xl border bg-gradient-to-br ${planMeta[currentPlan].gradient} p-4`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 rounded-lg bg-background/60 p-1.5 ${planMeta[currentPlan].color} backdrop-blur-sm`}
              >
                {planMeta[currentPlan].icon}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{planDisplayName[currentPlan]} Plan</p>
                  <Badge
                    variant={currentPlan === "free" ? "outline" : "default"}
                    className="text-[10px] uppercase px-1.5 py-0"
                  >
                    Active
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] uppercase px-1.5 py-0">
                    {mode}
                  </Badge>
                  {eeAvailable && (
                    <Badge variant="default" className="text-[10px] uppercase px-1.5 py-0">
                      EE
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{currentPlanDef.summary}</p>
              </div>
            </div>

            {/* Active plan limit pills */}
            <div className="flex flex-wrap gap-2">
              {limitItems.map(({ key, label, icon }) => (
                <div
                  key={key}
                  className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-background/50 px-2.5 py-1 backdrop-blur-sm"
                >
                  <span className="text-muted-foreground">{icon}</span>
                  <span className="text-xs font-medium">
                    {formatLimit(currentPlanDef.limits[key])}
                  </span>
                  <span className="text-[10px] text-muted-foreground hidden sm:inline">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Cloud: live usage bars ── */}
      {!isSelfHost && usageSnapshot && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Usage this period
            </p>
            <p className="text-[10px] text-muted-foreground">
              Resets{" "}
              {new Date(usageSnapshot.resetsAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              { key: "messages", label: "Messages", icon: <MessageSquare className="h-3 w-3" /> },
              { key: "humanAgents", label: "Human agents", icon: <UserCheck className="h-3 w-3" /> },
              { key: "contacts", label: "Contacts", icon: <BookUser className="h-3 w-3" /> },
              { key: "teams", label: "Teams", icon: <Users className="h-3 w-3" /> },
            ] as { key: string; label: string; icon: React.ReactNode }[]).map(({ key, label, icon }) => {
              const stat = usageSnapshot.usage[key];
              if (!stat) return null;
              const pct = stat.pct;
              const barColor =
                pct >= 100
                  ? "bg-destructive"
                  : pct >= 80
                  ? "bg-amber-500"
                  : "bg-primary";
              const textColor =
                pct >= 100
                  ? "text-destructive"
                  : pct >= 80
                  ? "text-amber-500"
                  : "text-muted-foreground";
              return (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      {icon}
                      {label}
                    </span>
                    <span className={`font-medium tabular-nums ${textColor}`}>
                      {stat.limit === null
                        ? `${stat.used.toLocaleString()} / ∞`
                        : `${stat.used.toLocaleString()} / ${stat.limit.toLocaleString()}`}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Cloud: plan upgrade grid ── */}
      {!isSelfHost && plansForGrid.length > 0 && (
        <>
          {/* Section label */}
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Available plans
            </p>
            {!eeAvailable && (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                <LockIcon className="h-2.5 w-2.5" />
                Upgrades locked — EE module not enabled
              </span>
            )}
          </div>

          <div
            className={`grid gap-4 ${
              plansForGrid.length === 1
                ? "sm:grid-cols-1 max-w-xs"
                : plansForGrid.length === 2
                ? "sm:grid-cols-2 max-w-xl"
                : "sm:grid-cols-2 xl:grid-cols-3"
            }`}
          >
            {plansForGrid.map((plan) => (
              <PlanCard
                key={plan.plan}
                plan={plan}
                isPopular={plan.plan === "pro" && currentPlan === "free"}
                canBuy={canBuy}
                loading={loading}
                selectedPlan={selectedPlan}
                onUpgrade={openBillingPortal}
              />
            ))}
          </div>

          {/* Cloud + EE unavailable notice */}
          {!eeAvailable && (
            <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 px-4 py-3">
              <p className="text-xs text-amber-600 dark:text-amber-400">
                <strong>Enterprise Edition module not detected.</strong> To enable paid plan
                upgrades, the EE module must be present and active on your deployment. Contact your
                admin or check your server configuration.
              </p>
            </div>
          )}
        </>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}
    </div>
  );
}
