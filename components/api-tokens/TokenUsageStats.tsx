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

/** 30-day request volume for one token. */
export function TokenUsageStats({ tokenId }: TokenUsageStatsProps) {
  const { data: usage = [], isLoading } = useQuery({
    queryKey: ["api-token-usage", tokenId],
    queryFn: () => fetchUsage(tokenId),
    staleTime: 60_000,
  });

  if (isLoading) {
    return <div className="h-24 animate-pulse rounded-lg bg-muted/40" />;
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
            tick={{ fontSize: 10 }}
            tickFormatter={(d: string) => d.slice(5)}
            interval="preserveStartEnd"
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value: number) => [value, "requests"]}
          />
          <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
