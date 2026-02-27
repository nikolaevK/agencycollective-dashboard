/**
 * Custom pLimit implementation — limits concurrent async operations
 */
export function pLimit(concurrency: number) {
  if (concurrency < 1) throw new Error("Concurrency must be >= 1");

  const queue: Array<() => void> = [];
  let activeCount = 0;

  function next() {
    activeCount--;
    if (queue.length > 0) {
      queue.shift()!();
    }
  }

  function run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const execute = () => {
        activeCount++;
        fn().then(resolve, reject).finally(next);
      };

      if (activeCount < concurrency) {
        execute();
      } else {
        queue.push(execute);
      }
    });
  }

  return { run };
}

/**
 * Fetch multiple items concurrently with a concurrency limit.
 * Uses Promise.allSettled so a single failure does not abort others.
 */
export async function fetchWithConcurrency<TInput, TOutput>(
  items: TInput[],
  fetcher: (item: TInput) => Promise<TOutput>,
  concurrency: number
): Promise<Array<{ status: "fulfilled"; value: TOutput } | { status: "rejected"; reason: unknown; input: TInput }>> {
  const limit = pLimit(concurrency);

  const results = await Promise.allSettled(
    items.map((item) => limit.run(() => fetcher(item)))
  );

  return results.map((result, i) => {
    if (result.status === "fulfilled") {
      return { status: "fulfilled", value: result.value };
    }
    return { status: "rejected", reason: result.reason, input: items[i] };
  });
}

/**
 * Get concurrency limit from env, with fallback
 */
export function getConcurrencyLimit(): number {
  const raw = process.env.META_CONCURRENCY_LIMIT;
  const parsed = raw ? parseInt(raw, 10) : 5;
  return isNaN(parsed) || parsed < 1 ? 5 : parsed;
}
