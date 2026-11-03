// Money formatters shared by the projection page and its (lazy) charts —
// kept out of ProjectionCharts so the page never imports recharts statically.

/** Compact money: $1.23M / $45K / $900. */
export const fmtMoney = (v: number) => {
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1e6) return sign + "$" + (a / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return sign + "$" + (a / 1e3).toFixed(0) + "K";
  return sign + "$" + Math.round(a).toLocaleString();
};

/** Exact money: $12,345 / -$12,345. */
export const fullMoney = (v: number) => (v < 0 ? "-$" : "$") + Math.round(Math.abs(v)).toLocaleString();
