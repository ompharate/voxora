import mongoose from "mongoose";
import { Schema, Document } from "mongoose";
import { Worker, Queue, ConnectionOptions } from "bullmq";
import config from "../config";

export const SUBSCRIPTION_EXPIRY_QUEUE = "subscription-expiry";

// ── Grace period constants ───────────────────────────────────────────────────
/** Downgrade after 2 days of being in past_due state */
const PAST_DUE_GRACE_PERIOD_MS = 2 * 24 * 60 * 60 * 1000;

// ── Minimal inline schemas ────────────────────────────────────────────────────
// The worker is a separate process from the API and does not share its module
// graph. We define minimal schemas here — enough for the queries we need —
// rather than importing the full @InteraOne/api models package.

interface IBillingSubscriptionLean {
  organizationId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date;
  updatedAt: Date;
}

interface IOrganizationLean {
  _id: string;
}

function getModels() {
  const BillingSubscription =
    mongoose.models["BillingSubscription"] ||
    mongoose.model(
      "BillingSubscription",
      new Schema(
        {
          organizationId: String,
          provider: String,
          providerId: String,
          plan: String,
          status: String,
          currentPeriodStart: Date,
          currentPeriodEnd: Date,
          cancelAtPeriodEnd: { type: Boolean, default: false },
          lastEventId: String,
        },
        { timestamps: true },
      ),
    );

  const Organization =
    mongoose.models["Organization"] ||
    mongoose.model(
      "Organization",
      new Schema(
        {
          plan: String,
          subscriptionStatus: String,
          cancelAtPeriodEnd: Boolean,
        },
        { timestamps: true, strict: false },
      ),
    );

  return { BillingSubscription, Organization };
}

// ── DB connection ─────────────────────────────────────────────────────────────

async function connectDb(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(config.database.mongoUri);
}

// ── Worker processor ─────────────────────────────────────────────────────────

async function processSubscriptionExpiry(): Promise<void> {
  await connectDb();
  const { BillingSubscription, Organization } = getModels();

  const now = new Date();
  const pastDueCutoff = new Date(now.getTime() - PAST_DUE_GRACE_PERIOD_MS);

  // ── Case 1: past_due for more than 2 days → downgrade to free ───────────
  const pastDueExpired = await BillingSubscription.find({
    status: "past_due",
    updatedAt: { $lt: pastDueCutoff },
  })
    .select("organizationId")
    .lean() as IBillingSubscriptionLean[];

  for (const sub of pastDueExpired) {
    try {
      await BillingSubscription.updateOne(
        { organizationId: sub.organizationId },
        { $set: { status: "cancelled", plan: "free" } },
      );
      await Organization.findByIdAndUpdate(sub.organizationId, {
        $set: { plan: "free", subscriptionStatus: "cancelled", cancelAtPeriodEnd: false },
      });
      console.log(
        `[Subscription Expiry] Downgraded org ${sub.organizationId} — past_due grace period exceeded`,
      );
    } catch (err: any) {
      console.error(
        `[Subscription Expiry] Failed to downgrade org ${sub.organizationId}:`,
        err.message,
      );
    }
  }

  // ── Case 2: cancelAtPeriodEnd subscriptions past their period end ────────
  // Safety net for missed subscription.expired webhooks from Dodo.
  const periodExpired = await BillingSubscription.find({
    status: { $in: ["active", "cancelled"] },
    cancelAtPeriodEnd: true,
    currentPeriodEnd: { $lt: now },
  })
    .select("organizationId")
    .lean() as IBillingSubscriptionLean[];

  for (const sub of periodExpired) {
    try {
      await BillingSubscription.updateOne(
        { organizationId: sub.organizationId },
        { $set: { status: "cancelled", plan: "free" } },
      );
      await Organization.findByIdAndUpdate(sub.organizationId, {
        $set: { plan: "free", subscriptionStatus: "cancelled", cancelAtPeriodEnd: false },
      });
      console.log(
        `[Subscription Expiry] Downgraded org ${sub.organizationId} — period ended with cancelAtPeriodEnd`,
      );
    } catch (err: any) {
      console.error(
        `[Subscription Expiry] Failed to downgrade org ${sub.organizationId}:`,
        err.message,
      );
    }
  }

  console.log(
    `[Subscription Expiry] Scan complete — past_due: ${pastDueExpired.length}, period-end: ${periodExpired.length}`,
  );
}

// ── Queue + Worker setup ──────────────────────────────────────────────────────

export function startSubscriptionExpiryWorker() {
  const connection: ConnectionOptions = {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    maxRetriesPerRequest: null,
  };

  // Register the repeatable job — runs every hour
  const queue = new Queue(SUBSCRIPTION_EXPIRY_QUEUE, { connection });
  queue.upsertJobScheduler(
    "subscription-expiry-hourly",
    { every: 60 * 60 * 1000 },
    { name: "subscription-expiry", data: {} },
  );

  const worker = new Worker(
    SUBSCRIPTION_EXPIRY_QUEUE,
    async () => { await processSubscriptionExpiry(); },
    { connection, concurrency: 1 },
  );

  worker.on("completed", () =>
    console.log("[Subscription Expiry Worker] Scan job completed"),
  );
  worker.on("failed", (_job, err) =>
    console.error("[Subscription Expiry Worker] Job failed:", err.message),
  );
  worker.on("error", (err) =>
    console.error("[Subscription Expiry Worker] Worker error:", err),
  );

  console.log(`[Subscription Expiry Worker] Started — runs every 1h`);
  return worker;
}
