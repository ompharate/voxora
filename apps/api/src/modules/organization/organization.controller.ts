import { Request, Response } from "express";
import { OrganizationService } from "./organization.service";
import { AuthenticatedRequest } from "@shared/middleware";
import { sendResponse, sendError } from "@shared/utils/response";
import logger from "@shared/utils/logger";
import {
    getPlanCatalog,
    invalidateOrganizationPlanCache,
    loadEeModule,
    normalizePlan,
    resolvePlanEntitlements,
} from "@shared/ee";
import { BillingCheckoutIntent, BillingSubscription, BillingWebhookEvent, Organization } from "@shared/models";
import { getOrganizationUsage } from "@shared/middleware";

const resolveAndValidateScopedOrgId = (req: Request, res: Response): string | null => {
    const { activeOrganizationId } = (req as AuthenticatedRequest).user;
    const routeOrgId = (req.params?.orgId || "").toString();
    if (routeOrgId && routeOrgId !== activeOrganizationId) {
        sendError(res, 403, "Organization scope mismatch");
        return null;
    }
    return activeOrganizationId;
};

export class OrganizationController {
    static async handleBillingWebhook(req: Request, res: Response): Promise<void> {
        try {
            const ee = loadEeModule();
            if (!ee?.billing) {
                sendResponse(res, 200, true, "EE billing module unavailable; webhook ignored");
                return;
            }

            // ── 1. Verify signature ──────────────────────────────────────────────
            const rawBody = (req as Request & { rawBody?: string }).rawBody;
            if (!rawBody) {
                sendError(res, 400, "Missing raw webhook body");
                return;
            }

            const verifier = ee.billing.verifyWebhookSignature;
            if (!verifier) {
                sendError(res, 501, "Webhook signature verifier not configured");
                return;
            }

            const verification = verifier({ headers: req.headers, rawBody });
            if (!verification.isValid) {
                logger.warn("[Billing Webhook] Signature invalid", { reason: verification.reason });
                sendError(res, 401, verification.reason || "Invalid webhook signature");
                return;
            }

            // ── 2. Parse subscription event ──────────────────────────────────────
            const parser = ee.billing.parseSubscriptionEvent;
            if (!parser) {
                sendError(res, 501, "Webhook subscription parser not configured");
                return;
            }

            const parsed = parser({ body: req.body, headers: req.headers });

            // Resolve eventId from parsed result or fallback to header
            const headerEventId = req.headers["webhook-id"] || req.headers["svix-id"];
            const eventId = parsed.eventId || (Array.isArray(headerEventId) ? headerEventId[0] : headerEventId) || "";

            if (!eventId) {
                sendError(res, 400, "Webhook event id is required");
                return;
            }

            // ── 3. Idempotency guard ─────────────────────────────────────────────
            try {
                await BillingWebhookEvent.create({
                    provider: parsed.provider || "dodo",
                    eventId,
                    eventType: parsed.eventType,
                    organizationId: parsed.organizationId,
                    targetPlan: parsed.targetPlan,
                    status: "processing",
                    rawPayload: req.body,
                });
            } catch (error: any) {
                if (error?.code === 11000) {
                    sendResponse(res, 200, true, "Webhook already processed", { eventId });
                    return;
                }
                throw error;
            }

            // ── 4. Skip unknown / unactionable events ────────────────────────────
            if (parsed.action === "unknown") {
                await BillingWebhookEvent.updateOne(
                    { provider: parsed.provider, eventId },
                    { $set: { status: "ignored", processedAt: new Date() } },
                );
                sendResponse(res, 200, true, "Webhook accepted", { eventId, action: "ignored" });
                return;
            }

            if (!parsed.organizationId && !["past_due"].includes(parsed.action)) {
                await BillingWebhookEvent.updateOne(
                    { provider: parsed.provider, eventId },
                    { $set: { status: "ignored", processedAt: new Date(), errorMessage: "No organizationId in payload" } },
                );
                sendResponse(res, 200, true, "Webhook accepted", { eventId, action: "ignored" });
                return;
            }

            // ── 5. Dispatch subscription lifecycle handler ───────────────────────
            const handler = ee.billing.handleSubscriptionEvent;
            if (!handler) {
                await BillingWebhookEvent.updateOne(
                    { provider: parsed.provider, eventId },
                    { $set: { status: "failed", errorMessage: "handleSubscriptionEvent not available", processedAt: new Date() } },
                );
                sendError(res, 503, "EE subscription handler unavailable");
                return;
            }

            const result = await handler({
                action: parsed.action,
                organizationId: parsed.organizationId,
                subscriptionId: parsed.subscriptionId,
                targetPlan: parsed.targetPlan,
                currentPeriodEnd: parsed.currentPeriodEnd,
                core: {
                    OrganizationModel: Organization,
                    BillingSubscriptionModel: BillingSubscription,
                },
            });

            // Invalidate plan cache so next request picks up the new plan immediately
            if (parsed.organizationId) {
                invalidateOrganizationPlanCache(parsed.organizationId);
            }

            await BillingWebhookEvent.updateOne(
                { provider: parsed.provider, eventId },
                { $set: { status: "processed", processedAt: new Date() } },
            );

            sendResponse(res, 200, true, "Webhook processed", { eventId, ...result });
        } catch (error: any) {
            const parsedEventId = req.body?.id || req.body?.event_id || req.body?.data?.id;

            if (parsedEventId) {
                await BillingWebhookEvent.updateOne(
                    { provider: "dodo", eventId: String(parsedEventId) },
                    { $set: { status: "failed", errorMessage: error?.message || "Webhook processing failed", processedAt: new Date() } },
                );
            }

            logger.error("[Billing Webhook] Processing failed", { error: error?.message, stack: error?.stack });
            sendError(res, 500, "Webhook processing failed");
        }
    }


    static async createOrganization(req: Request, res: Response): Promise<void> {
        try {
            const { userId, email } = (req as AuthenticatedRequest).user;
            const { name, slug } = req.body;

            // Create org + owner membership, then switch context to new org
            await OrganizationService.createOrganization(userId, { name, slug });
            const org = await OrganizationService.getUserOrganizations(userId);
            const newOrg = org.find((o) => o.organization.name === name);
            if (!newOrg) throw new Error("Failed to create organization");

            const tokens = await OrganizationService.switchOrganization(
                userId,
                email,
                newOrg.organization._id.toString(),
            );

            sendResponse(res, 201, true, "Organization created successfully", {
                organization: tokens.organization,
                role: tokens.role,
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
            });
        } catch (error: any) {
            sendError(res, 400, error.message);
        }
    }

    static async getMyOrganizations(req: Request, res: Response): Promise<void> {
        try {
            const { userId } = (req as AuthenticatedRequest).user;
            const orgs = await OrganizationService.getUserOrganizations(userId);
            sendResponse(res, 200, true, "Organizations retrieved", { organizations: orgs });
        } catch (error: any) {
            sendError(res, 500, error.message);
        }
    }

    static async getOrganization(req: Request, res: Response): Promise<void> {
        try {
            const { userId } = (req as AuthenticatedRequest).user;
            const { orgId } = req.params as { orgId?: string | string[] };
            const resolvedOrgId = Array.isArray(orgId) ? orgId[0] : orgId;
            if (!resolvedOrgId) {
                sendError(res, 400, "Organization id is required");
                return;
            }
            const result = await OrganizationService.getOrganization(userId, resolvedOrgId);
            sendResponse(res, 200, true, "Organization retrieved", result);
        } catch (error: any) {
            sendError(res, 404, error.message);
        }
    }

    static async updateOrganization(req: Request, res: Response): Promise<void> {
        try {
            const { activeOrganizationId } = (req as AuthenticatedRequest).user;
            const org = await OrganizationService.updateOrganization(activeOrganizationId, req.body);
            sendResponse(res, 200, true, "Organization updated", { organization: org });
        } catch (error: any) {
            sendError(res, 400, error.message);
        }
    }

    static async switchOrganization(req: Request, res: Response): Promise<void> {
        try {
            const { userId, email } = (req as AuthenticatedRequest).user;
            const { orgId } = req.params as { orgId?: string | string[] };
            const resolvedOrgId = Array.isArray(orgId) ? orgId[0] : orgId;
            if (!resolvedOrgId) {
                sendError(res, 400, "Organization id is required");
                return;
            }

            const result = await OrganizationService.switchOrganization(userId, email, resolvedOrgId);

            sendResponse(res, 200, true, "Switched organization successfully", {
                organization: result.organization,
                role: result.role,
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
            });
        } catch (error: any) {
            sendError(res, 403, error.message);
        }
    }

    static async deleteOrganization(req: Request, res: Response): Promise<void> {
        try {
            const { activeOrganizationId } = (req as AuthenticatedRequest).user;
            await OrganizationService.deleteOrganization(activeOrganizationId);
            sendResponse(res, 200, true, "Organization deactivated");
        } catch (error: any) {
            sendError(res, 400, error.message);
        }
    }

    static async getBillingPortal(req: Request, res: Response): Promise<void> {
        try {
            const activeOrganizationId = resolveAndValidateScopedOrgId(req, res);
            if (!activeOrganizationId) {
                return;
            }
            const { userId } = (req as AuthenticatedRequest).user;
            const requestedPlan = (req.query.targetPlan || "pro").toString().toLowerCase();
            const targetPlan = requestedPlan === "proplus" ? "proplus" : "pro";
            const ee = loadEeModule();

            if (!ee?.billing?.createPortalSession) {
                sendError(res, 503, "EE billing module unavailable");
                return;
            }

            const data = await ee.billing.createPortalSession({
                organizationId: activeOrganizationId,
                userId,
                targetPlan,
            });

            const raw = (data as { raw?: Record<string, unknown> })?.raw;
            const checkoutSessionId =
                (raw?.checkout_session_id as string | undefined) ||
                (raw?.checkoutSessionId as string | undefined) ||
                (raw?.session_id as string | undefined) ||
                (raw?.id as string | undefined);

            if (checkoutSessionId) {
                await BillingCheckoutIntent.updateOne(
                    { checkoutSessionId, status: { $ne: "consumed" } },
                    {
                        $set: {
                            organizationId: activeOrganizationId,
                            userId,
                            targetPlan,
                            status: "pending",
                        },
                        $unset: {
                            consumedAt: "",
                        },
                    },
                    { upsert: true },
                );
            }

            sendResponse(res, 200, true, "Billing portal ready", data);
        } catch (error: any) {
            sendError(res, 400, error.message);
        }
    }

    static async getBillingEntitlements(req: Request, res: Response): Promise<void> {
        try {
            const activeOrganizationId = resolveAndValidateScopedOrgId(req, res);
            if (!activeOrganizationId) {
                return;
            }
            const org = await Organization.findById(activeOrganizationId).select("plan").lean<{ plan?: string }>();
            const currentPlan = normalizePlan(org?.plan);

            const data = {
                currentPlan,
                plans: getPlanCatalog(),
                entitlements: resolvePlanEntitlements(currentPlan),
            };

            sendResponse(res, 200, true, "Billing entitlements retrieved", data);
        } catch (error: any) {
            sendError(res, 400, error.message || "Failed to fetch billing entitlements");
        }
    }

    static async getBillingUsage(req: Request, res: Response): Promise<void> {
        try {
            const activeOrganizationId = resolveAndValidateScopedOrgId(req, res);
            if (!activeOrganizationId) return;
            const snapshot = await getOrganizationUsage(activeOrganizationId);
            sendResponse(res, 200, true, "Usage retrieved", snapshot);
        } catch (error: any) {
            sendError(res, 400, error.message || "Failed to fetch usage");
        }
    }

    static async upgradePlan(req: Request, res: Response): Promise<void> {
        try {
            const activeOrganizationId = resolveAndValidateScopedOrgId(req, res);
            if (!activeOrganizationId) {
                return;
            }
            const targetPlan = (req.body?.targetPlan || "").toString().toLowerCase();

            if (!["pro", "proplus", "enterprise"].includes(targetPlan)) {
                sendError(res, 400, "Invalid target plan");
                return;
            }

            const ee = loadEeModule();
            if (!ee?.billing?.upgradePlan) {
                sendError(res, 503, "EE billing module unavailable");
                return;
            }

            const data = await ee.billing.upgradePlan({
                organizationId: activeOrganizationId,
                targetPlan: targetPlan as "pro" | "proplus" | "enterprise",
                core: {
                    OrganizationModel: Organization,
                },
            });

            invalidateOrganizationPlanCache(activeOrganizationId);

            sendResponse(res, 200, true, "Plan upgraded", data);
        } catch (error: any) {
            sendError(res, 400, error.message);
        }
    }

    static async updateWhiteLabel(req: Request, res: Response): Promise<void> {
        try {
            const { activeOrganizationId } = (req as AuthenticatedRequest).user;
            const removeBranding = Boolean(req.body?.removeBranding);
            const ee = loadEeModule();

            if (ee?.whiteLabel?.updateSettings) {
                const data = await ee.whiteLabel.updateSettings({
                    organizationId: activeOrganizationId,
                    removeBranding,
                    core: {
                        OrganizationModel: Organization,
                    },
                });
                await OrganizationService.updateOrganization(activeOrganizationId, {
                    whiteLabelEnabled: data.removeBranding,
                });
                sendResponse(res, 200, true, "White-label settings updated", data);
                return;
            }

            // Keep a safe fallback for OSS deployments where the EE module isn't shipped.
            await OrganizationService.updateOrganization(activeOrganizationId, {
                whiteLabelEnabled: removeBranding,
            });

            sendResponse(res, 200, true, "White-label settings updated", {
                removeBranding,
            });
        } catch (error: any) {
            sendError(res, 400, error.message);
        }
    }
}
