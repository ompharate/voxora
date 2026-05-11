import { AnalyticsEventType } from "../models";
import { analyticsQueue } from "../config/queue";
import logger from "./logger";

/**
 * Global analytics tracker.
 * Events are added to the platform-analytics queue asynchronously.
 */
export const tracker = {
  trackEvent: (
    organizationId: string,
    type: AnalyticsEventType,
    category: "ai" | "agent" | "system",
    metadata: Record<string, any> = {}
  ) => {
    // Enqueue job to offload DB write from the main API process
    analyticsQueue.add(
      type,
      {
        event: type,
        organizationId,
        category,
        metadata,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
      }
    ).catch((err) => {
      logger.error(`[Tracker] Failed to enqueue event ${type}:`, err);
    });
  },

  /**
   * Helper for tracking message events
   */
  trackMessage: (organizationId: string, sender: "ai" | "agent", metadata: Record<string, any> = {}) => {
    tracker.trackEvent(organizationId, "message_sent", sender, metadata);
  },

  /**
   * Helper for tracking fallbacks
   */
  trackFallback: (organizationId: string, metadata: Record<string, any> = {}) => {
    tracker.trackEvent(organizationId, "fallback_triggered", "system", metadata);
  }
};
