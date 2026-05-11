import { Worker, ConnectionOptions } from "bullmq";
import mongoose, { Schema } from "mongoose";
import config from "../config";

export const ANALYTICS_QUEUE = "platform-analytics";

export interface AnalyticsJobData {
  event: string;
  organizationId: string;
  category: "ai" | "agent" | "system";
  metadata?: Record<string, any>;
}

// ── Config ────────────────────────────────────────────────────────────────────
const BATCH_SIZE = 10;
const FLUSH_INTERVAL_MS = 5_000; // flush at least every 5s regardless of batch size

// ── In-memory event buffer ────────────────────────────────────────────────────
interface BufferedEvent {
  organizationId: string;
  type: string;
  category: string;
  metadata: Record<string, any>;
  createdAt: Date;
}

const eventBuffer: BufferedEvent[] = [];

// ── Minimal inline schema ─────────────────────────────────────────────────────
function getModels() {
  const AnalyticsEvent =
    mongoose.models["AnalyticsEvent"] ||
    mongoose.model(
      "AnalyticsEvent",
      new Schema(
        {
          organizationId: { type: String, required: true, index: true },
          type: { type: String, required: true, index: true },
          category: { type: String, required: true, enum: ["ai", "agent", "system"], index: true },
          metadata: { type: Schema.Types.Mixed, default: {} },
        },
        { timestamps: { createdAt: true, updatedAt: false } }
      )
    );
  return { AnalyticsEvent };
}

// ── DB connection ─────────────────────────────────────────────────────────────
async function connectDb(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(config.database.mongoUri);
}

// ── Flush buffer to MongoDB ───────────────────────────────────────────────────
async function flushBuffer(): Promise<void> {
  if (eventBuffer.length === 0) return;

  // Drain the buffer atomically to avoid race conditions with the interval
  const batch = eventBuffer.splice(0, eventBuffer.length);

  try {
    await connectDb();
    const { AnalyticsEvent } = getModels();
    await AnalyticsEvent.insertMany(batch, { ordered: false });
    console.log(`[Analytics Worker] Flushed ${batch.length} event(s) to MongoDB`);
  } catch (err: any) {
    console.error("[Analytics Worker] Bulk insert failed:", err.message);
    // Push failed events back to the front of the buffer so they're retried next flush
    eventBuffer.unshift(...batch);
  }
}

// ── Worker ────────────────────────────────────────────────────────────────────
export function startAnalyticsWorker() {
  const connection: ConnectionOptions = {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    maxRetriesPerRequest: null,
  };

  const worker = new Worker<AnalyticsJobData, void, string>(
    ANALYTICS_QUEUE,
    async (job) => {
      const { event, organizationId, category, metadata } = job.data;

      eventBuffer.push({
        organizationId,
        type: event,
        category,
        metadata: metadata || {},
        createdAt: new Date(),
      });

      console.log(
        `[Analytics Worker] Buffered event: "${event}" | org: ${organizationId} | buffer: ${eventBuffer.length}/${BATCH_SIZE}`
      );

      // Flush immediately once batch size is reached
      if (eventBuffer.length >= BATCH_SIZE) {
        await flushBuffer();
      }
    },
    { connection, concurrency: config.worker.concurrency },
  );

  // Periodic flush — ensures events don't sit in the buffer forever in low-traffic periods
  const flushTimer = setInterval(() => {
    flushBuffer().catch((err) =>
      console.error("[Analytics Worker] Periodic flush error:", err)
    );
  }, FLUSH_INTERVAL_MS);

  worker.on("completed", (job) =>
    console.log(`[Analytics Worker] Job ${job.id} accepted — event: "${job.data.event}"`)
  );
  worker.on("failed", (job, err) =>
    console.error(`[Analytics Worker] Job ${job?.id} failed:`, err.message)
  );
  worker.on("error", (err) =>
    console.error("[Analytics Worker] Worker error:", err)
  );

  // Clean up the interval timer on graceful shutdown
  worker.on("closing", () => clearInterval(flushTimer));

  console.log(
    `[Analytics Worker] Started — queue: "${ANALYTICS_QUEUE}" | batch: ${BATCH_SIZE} | flush interval: ${FLUSH_INTERVAL_MS / 1000}s`
  );
  return worker;
}
