import dotenv from "dotenv";
dotenv.config();

import { startEmailWorker } from "./workers/email.worker";
import { startAnalyticsWorker } from "./workers/analytics.worker";
import { startSubscriptionExpiryWorker } from "./workers/subscription-expiry.worker";
import { isEeEnabled } from "./config";

console.log("[InteraOne Worker] Starting platform worker service...");

const emailWorker = startEmailWorker();
const analyticsWorker = startAnalyticsWorker();

// The subscription expiry worker is an EE-only concern.
// It must never start on OSS deployments where no license key is present.
const subscriptionExpiryWorker = isEeEnabled()
  ? startSubscriptionExpiryWorker()
  : null;

if (!subscriptionExpiryWorker) {
  console.log("[InteraOne Worker] EE not enabled — subscription expiry worker skipped.");
}

const shutdown = async (signal: string) => {
  console.log(`[InteraOne Worker] Received ${signal}, shutting down gracefully...`);
  await Promise.all([
    emailWorker.close(),
    analyticsWorker.close(),
    subscriptionExpiryWorker?.close(),
  ]);
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  console.error("[InteraOne Worker] Unhandled rejection:", reason);
  process.exit(1);
});
