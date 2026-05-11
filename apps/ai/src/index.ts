import dotenv from "dotenv";
dotenv.config();

import { startWorker } from "./workers/reply.worker";
import { startIngestionWorker } from "./workers/ingestion.worker";
import { startHealthServer } from "./health/health.server";

console.log("[InteraOne AI] Starting AI service...");

const chatWorker = startWorker();
const ingestionWorker = startIngestionWorker();
const healthServer = startHealthServer();

const shutdown = async (signal: string) => {
  console.log(`[InteraOne AI] Received ${signal}, shutting down gracefully...`);
  await Promise.all([
    chatWorker.close(),
    ingestionWorker.close(),
    new Promise<void>((resolve) => healthServer.close(() => resolve())),
  ]);
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  console.error("[InteraOne AI] Unhandled rejection:", reason);
  process.exit(1);
});