/**
 * Parse service_category from DB (backward-compatible).
 * Handles: null, empty string, JSON array string, or legacy single value.
 */
export function parseServiceCategory(value: string | null): string[] {
  if (!value || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch {
    // Legacy single-value format
  }
  return [value];
}

/**
 * Serialize selected services to JSON string for DB storage.
 * Returns null if empty.
 */
export function serializeServiceCategory(values: string[]): string | null {
  const filtered = values.filter(Boolean);
  if (filtered.length === 0) return null;
  return JSON.stringify(filtered);
}
