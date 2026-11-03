"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface TokenUsageStatsProps {
  tokenId: string;
}

interface UsageDay {
  day: string;
  count: number;
}

async function fetchUsage(tokenId: string): Promise<UsageDay[]> {
  const res = await fetch(`/api/admin/api-tokens/${tokenId}/usage?days=30`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data?.usage ?? [];
}

/** 30-day request volume for one token. Loaded lazily by TokenCard (recharts). */
export function TokenUsageStats({ tokenId }: TokenUsageStatsProps) {
  const { data: usage = [], isLoading } = useQuery({
    queryKey: ["api-token-usage", tokenId],
    queryFn: () => fetchUsage(tokenId),
    staleTime: 60_000,
  });

  if (isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }
  if (usage.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-muted-foreground">
        No requests in the last 30 days.
      </p>
    );
  }

  return (
    <div className="h-24">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={usage} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="day"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(d: string) => d.slice(5)}
            interval="preserveStartEnd"
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))", opacity: 0.6 }}
            contentStyle={{
              background: "hsl(var(--popover))",
              color: "hsl(var(--popover-foreground))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 12,
              fontSize: 12,
            }}
            labelStyle={{ color: "hsl(var(--muted-foreground))" }}
            itemStyle={{ color: "hsl(var(--popover-foreground))" }}
            formatter={(value: number) => [value, "requests"]}
          />
          <Bar dataKey="count" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
