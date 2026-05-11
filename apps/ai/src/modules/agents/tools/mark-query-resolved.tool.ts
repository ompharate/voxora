import { randomUUID } from "crypto";
import { Tool, ToolExecutionContext, ToolParameterSchema } from "../agent.types";
import { connectDB, ConversationModel } from "../../../infrastructure/db";

export class MarkQueryResolvedTool implements Tool {
  readonly name = "mark_query_resolved";
  readonly description = "Record that the current user query has been resolved without closing the conversation.";

  readonly parameters: Record<string, ToolParameterSchema> = {
    summary: {
      type: "string",
      description: "Short summary of what was resolved.",
      required: false,
    },
    reason: {
      type: "string",
      description: "Why the query is considered resolved (e.g., user confirmed success).",
      required: false,
    },
    query: {
      type: "string",
      description: "Optional original user query text.",
      required: false,
    },
    organizationId: {
      type: "string",
      description: "Organization ID. Usually injected from runtime context.",
      required: false,
    },
    conversationId: {
      type: "string",
      description: "Conversation ID. Usually injected from runtime context.",
      required: false,
    },
    messageId: {
      type: "string",
      description: "Message ID associated with the resolved query.",
      required: false,
    },
  };

  async execute(args: Record<string, unknown>, context?: ToolExecutionContext): Promise<unknown> {
    try {
      const summary = typeof args.summary === "string" ? args.summary.trim() : "";
      const reason = typeof args.reason === "string" ? args.reason.trim() : "";
      const query = typeof args.query === "string" ? args.query.trim() : "";

      const organizationId =
        (typeof args.organizationId === "string" ? args.organizationId : "") ||
        context?.organizationId ||
        "";
      const conversationId =
        (typeof args.conversationId === "string" ? args.conversationId : "") ||
        context?.conversationId ||
        "";
      const messageId =
        (typeof args.messageId === "string" ? args.messageId : "") ||
        context?.messageId ||
        "";

      if (!organizationId || !conversationId) {
        throw new Error("organizationId and conversationId are required to mark a query as resolved");
      }

      if (!summary && !reason && !query) {
        throw new Error("summary, reason, or query must be provided");
      }

      const resolvedAt = new Date();
      const resolutionId = randomUUID();

      const resolutionEntry: Record<string, unknown> = {
        id: resolutionId,
        resolvedAt,
        resolvedBy: "ai_tool",
        summary: summary || reason || query,
      };

      if (reason) resolutionEntry.reason = reason;
      if (query) resolutionEntry.query = query;
      if (messageId) resolutionEntry.messageId = messageId;

      await connectDB();

      const result = await (ConversationModel as any).updateOne(
        { _id: conversationId, organizationId },
        {
          $push: { "metadata.resolvedQueries": resolutionEntry },
          $set: {
            "metadata.lastResolvedAt": resolvedAt,
            "metadata.lastResolvedBy": "ai_tool",
          },
        },
      );

      if (!result.matchedCount) {
        throw new Error("Conversation not found for resolution tracking");
      }

      return { status: "ok", resolutionId };
    } catch (e: any) {
      return {
        status: "error",
        message: e?.response?.data?.message || e.message || "Failed to mark query resolved",
      };
    }
  }
}
