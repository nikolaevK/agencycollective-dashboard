import { useQuery } from "@tanstack/react-query";

export interface ProjectionBaseline {
  /** Number of clients with status === "active". */
  activeClientCount: number;
  /** Average Monthly MRR across all active clients, in whole dollars. */
  averageMrr: number;
  /** Sum of Monthly MRR across all active clients, in whole dollars. */
  totalMrr: number;
  generatedAt: string;
}

/**
 * Live Client Directory baseline (active-client count + average Monthly MRR)
 * used to seed the Revenue Projection levers. Returns null on any non-OK
 * response so the tool falls back to its illustrative defaults.
 */
export function useProjectionBaseline() {
  return useQuery<ProjectionBaseline | null>({
    queryKey: ["projection-baseline"],
    queryFn: async () => {
      const res = await fetch("/api/admin/projection/baseline");
      if (!res.ok) return null;
      const json = await res.json();
      return (json.data as ProjectionBaseline) ?? null;
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
