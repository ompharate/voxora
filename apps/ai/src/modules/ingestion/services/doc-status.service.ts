import { connectDB, KnowledgeModel } from "../../../infrastructure/db";

export async function setDocStatus(
  organizationId: string,
  documentId: string,
  update: {
    status: "indexing" | "indexed" | "failed";
    wordCount?: number;
    chunkCount?: number;
    lastIndexed?: Date;
    errorMessage?: string;
    failedChunkCount?: number;
    totalChunkCount?: number;
  },
): Promise<void> {
  await connectDB();
  
  await (KnowledgeModel as any).findOneAndUpdate(
    { _id: documentId, organizationId },
    { $set: update },
  );
}
