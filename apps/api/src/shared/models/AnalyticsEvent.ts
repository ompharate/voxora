import mongoose, { Document, Schema } from "mongoose";

export type AnalyticsEventType = 
  | "message_sent" 
  | "fallback_triggered" 
  | "widget_load" 
  | "knowledge_view"
  | "qr_scan";

export interface IAnalyticsEvent extends Document {
  organizationId: string;
  type: AnalyticsEventType;
  category: "ai" | "agent" | "system";
  metadata: Record<string, any>;
  createdAt: Date;
}

const analyticsEventSchema = new Schema<IAnalyticsEvent>(
  {
    organizationId: { type: String, required: true, index: true },
    type: { type: String, required: true, index: true },
    category: { type: String, required: true, enum: ["ai", "agent", "system"], index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { 
    timestamps: { createdAt: true, updatedAt: false },
    // Capped collection would be nice for high volume, but standard for now
  }
);

// Compound index for efficient aggregation
analyticsEventSchema.index({ organizationId: 1, type: 1, createdAt: -1 });

export const AnalyticsEvent = mongoose.model<IAnalyticsEvent>("AnalyticsEvent", analyticsEventSchema);
