import { cacheRedis } from "./redis.client";
import { connectDB, ConversationModel } from "../db";

const CACHE_TTL_SECONDS = parseInt(
  process.env.CONVERSATION_CACHE_TTL_SECONDS || "5",
  10,
);
const CACHE_PREFIX = "ai:conversation";

export interface ConversationGate {
  status?: string;
  assignedTo?: string | null;
  metadata?: {
    escalatedAt?: string | null;
    humanJoinedAt?: string | null;
  };
}

interface CachedGate {
  missing?: boolean;
  status?: string;
  assignedTo?: string | null;
  metadata?: {
    escalatedAt?: string | null;
    humanJoinedAt?: string | null;
  };
}

export async function getConversationGate(
  conversationId: string,
): Promise<ConversationGate | null> {
  if (!conversationId) return null;
  const key = `${CACHE_PREFIX}:${conversationId}`;

  const cached = await cacheRedis.get(key);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as CachedGate;
      if (parsed.missing) return null;
      return {
        status: parsed.status,
        assignedTo: parsed.assignedTo ?? null,
        metadata: parsed.metadata ?? {},
      };
    } catch {
      await cacheRedis.del(key);
    }
  }

  await connectDB();
  const conv = await (ConversationModel as any)
    .findById(conversationId)
    .select("status metadata assignedTo")
    .lean();

  if (!conv) {
    await cacheRedis.set(key, JSON.stringify({ missing: true }), "EX", CACHE_TTL_SECONDS);
    return null;
  }

  const gate: ConversationGate = {
    status: conv?.status,
    assignedTo: conv?.assignedTo?.toString() || null,
    metadata: {
      escalatedAt: conv?.metadata?.escalatedAt
        ? new Date(conv.metadata.escalatedAt).toISOString()
        : null,
      humanJoinedAt: conv?.metadata?.humanJoinedAt
        ? new Date(conv.metadata.humanJoinedAt).toISOString()
        : null,
    },
  };

  await cacheRedis.set(key, JSON.stringify(gate), "EX", CACHE_TTL_SECONDS);
  return gate;
}

export async function invalidateConversationGate(conversationId: string): Promise<void> {
  if (!conversationId) return;
  await cacheRedis.del(`${CACHE_PREFIX}:${conversationId}`);
}
