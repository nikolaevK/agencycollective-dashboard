export interface ApiResponse<T> {
  data: T;
  meta: {
    cached: boolean;
    timestamp: number;
    dateRange?: string;
  };
}

export interface ApiError {
  error: string;
  code?: number;
  retryAfter?: number;
}

export interface DateRangeInput {
  preset?: DatePreset;
  since?: string; // YYYY-MM-DD
  until?: string; // YYYY-MM-DD
}

export type DatePreset =
  | "today"
  | "yesterday"
  | "last_7d"
  | "last_14d"
  | "last_30d"
  | "last_90d"
  | "this_month"
  | "last_month";

export interface PaginatedResponse<T> {
  data: T[];
  paging?: {
    cursors?: { before?: string; after?: string };
    next?: string;
  };
}
