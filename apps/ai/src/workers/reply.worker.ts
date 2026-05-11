import { Worker } from "bullmq";
import config from "../config";
import { runPipeline } from "../modules/chat/pipelines/run-pipeline";
import { AIJobData } from "../modules/chat/chat.types";
import { getBullMQConnection } from "../infrastructure/queue/bullmq.client";

const QUEUE_NAME = "ai-processing";

export function startWorker() {
  const connection = getBullMQConnection();

  const worker = new Worker<AIJobData, void, string>(
    QUEUE_NAME,
    async (job) => {
      console.log(
        `[AI Worker] Processing job ${job.id} | conversation: ${job.data.conversationId}`,
      );
      await runPipeline(job.data);
    },
    { connection, concurrency: config.worker.concurrency },
  );

  worker.on("completed", (job) =>
    console.log(`[AI Worker] Job ${job.id} completed`),
  );
  worker.on("failed", (job, err) =>
    console.error(`[AI Worker] Job ${job?.id} failed:`, err.message),
  );
  worker.on("error", (err) =>
    console.error("[AI Worker] Worker error:", err),
  );

  console.log(`[AI Worker] Started, listening on BullMQ queue: "${QUEUE_NAME}"`);
  return worker;
}
