import { AnalyticsEvent } from "@shared/models";
import dayjs from "dayjs";

export class AnalyticsService {
  /**
   * Get a summary of key metrics for an organization
   */
  static async getSummary(organizationId: string) {
    const thirtyDaysAgo = dayjs().subtract(30, "days").toDate();

    const stats = await AnalyticsEvent.aggregate([
      {
        $match: {
          organizationId,
          createdAt: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
        },
      },
    ]);

    const summary: Record<string, number> = {
      message_sent: 0,
      fallback_triggered: 0,
      widget_load: 0,
    };

    stats.forEach((s) => {
      if (s._id in summary) {
        summary[s._id] = s.count;
      }
    });

    // Calculate AI Resolution Rate
    // (Total Messages - Fallbacks) / Total Messages
    const totalMessages = summary.message_sent || 0;
    const fallbacks = summary.fallback_triggered || 0;
    const resolutionRate = totalMessages > 0 
      ? Math.round(((totalMessages - fallbacks) / totalMessages) * 100) 
      : 100;

    return {
      totalConversations: totalMessages, // Simplified for now
      fallbacks,
      resolutionRate,
      widgetLoads: summary.widget_load,
    };
  }

  /**
   * Get daily volume trends for charts
   */
  static async getTrends(organizationId: string, days = 7) {
    const startDate = dayjs().subtract(days, "days").startOf("day").toDate();

    const trends = await AnalyticsEvent.aggregate([
      {
        $match: {
          organizationId,
          type: "message_sent",
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return trends.map((t) => ({
      date: t._id,
      count: t.count,
    }));
  }
}
