import { MetricCard } from "../components/metric-card";
import { Card } from "@/shared/ui/card";
import {
  MessageSquare,
  Activity,
  Globe,
  Bot,
} from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/shared/ui/chart";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { useAnalyticsSummary, useAnalyticsTrends } from "../hooks/use-analytics";
import { Loader } from "@/shared/ui/loader";

const chartConfig = {
  count: {
    label: "Conversations",
    color: "var(--color-primary)",
  },
};

export function AdminDashboard() {
  const { data: summary, isLoading: summaryLoading } = useAnalyticsSummary();
  const { data: trends, isLoading: trendsLoading } = useAnalyticsTrends(7);

  if (summaryLoading || trendsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Support operations and team performance insights.
        </p>
      </div>

      {/* Main Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Messages"
          value={summary?.totalConversations || 0}
          icon={MessageSquare}
          description="Last 30 days"
        />
        <MetricCard
          title="AI Resolution Rate"
          value={`${summary?.resolutionRate || 100}%`}
          changeType="positive"
          icon={Bot}
          description="Resolved by AI"
        />
        <MetricCard
          title="Widget Loads"
          value={summary?.widgetLoads || 0}
          icon={Globe}
          description="Total impressions"
        />
        <MetricCard
          title="Fallbacks"
          value={summary?.fallbacks || 0}
          changeType="negative"
          icon={Activity}
          description="Escalated to human"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-1">
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Conversation Volume (Last 7 Days)</h3>
          <div className="h-[350px] w-full">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends || []}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#845C6C" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#845C6C" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                    tickFormatter={(str) => {
                      const date = new Date(str);
                      return date.toLocaleDateString('en-US', { weekday: 'short' });
                    }}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#845C6C"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorCount)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
