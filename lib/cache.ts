interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class InMemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(cleanupIntervalMs = 60_000) {
    // Periodically remove expired entries
    if (typeof setInterval !== "undefined") {
      this.cleanupInterval = setInterval(
        () => this.cleanup(),
        cleanupIntervalMs
      );
    }
  }

  set<T>(key: string, data: T, ttlSeconds: number): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    Array.from(this.store.entries()).forEach(([key, entry]) => {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    });
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }
}

// Singleton cache instance
const cache = new InMemoryCache();
export default cache;

// TTL values
export const TTL = {
  ACCOUNTS: 300,    // 5 minutes
  INSIGHTS: 300,    // 5 minutes
  CAMPAIGNS: 300,   // 5 minutes
  ADSETS: 300,      // 5 minutes
  ADS: 300,         // 5 minutes
  ALERTS: 180,      // 3 minutes
  CREATIVES: 300,   // 5 minutes
  PAGES: 300,       // 5 minutes
} as const;

// Cache key builders
export const CacheKeys = {
  accounts: () => "accounts:list",
  accountInsights: (accountId: string, dateRange: string) =>
    `insights:${accountId}:${dateRange}`,
  allInsights: (dateRange: string) => `all_insights:${dateRange}`,
  campaigns: (accountId: string) => `campaigns:${accountId}`,
  campaignInsights: (campaignId: string, dateRange: string) =>
    `campaign_insights:${campaignId}:${dateRange}`,
  adsets: (campaignId: string) => `adsets:${campaignId}`,
  adsetInsights: (adsetId: string, dateRange: string) =>
    `adset_insights:${adsetId}:${dateRange}`,
  ads: (adsetId: string) => `ads:${adsetId}`,
  alerts: (dateRange: string) => `alerts:${dateRange}`,
  campaignCreatives: (campaignId: string, dateRange: string) =>
    `campaign_creatives:${campaignId}:${dateRange}`,
  timeSeries: (accountId: string, dateRange: string) =>
    `timeseries:${accountId}:${dateRange}`,
  accountPages: (accountId: string) => `account_pages:${accountId}`,
} as const;
