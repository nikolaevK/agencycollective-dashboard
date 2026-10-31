// Pure (no db imports): client components use it without pulling the
// database client into the browser bundle. lib/deals re-exports it.

/**
 * The single close-rate definition: closed / (closed + pending + in-flight),
 * one decimal. Every surface (team card, overview delta, leaderboard) must
 * call this — hand-copied variants drifted in rounding before.
 */
export function computeCloseRate(
  closedCount: number,
  pendingCount: number,
  inFlightCount: number
): number {
  const total = closedCount + pendingCount + inFlightCount;
  return total > 0 ? Math.round((closedCount / total) * 1000) / 10 : 0;
}
