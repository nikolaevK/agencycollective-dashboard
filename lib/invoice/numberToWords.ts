const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];
const SCALES = ["", "Thousand", "Million", "Billion", "Trillion"];

function chunkToWords(n: number): string {
  if (n === 0) return "";
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;

  if (hundreds > 0) parts.push(`${ONES[hundreds]} Hundred`);

  if (remainder > 0) {
    if (remainder < 20) {
      parts.push(ONES[remainder]);
    } else {
      const tens = Math.floor(remainder / 10);
      const ones = remainder % 10;
      parts.push(ones > 0 ? `${TENS[tens]}-${ONES[ones]}` : TENS[tens]);
    }
  }

  return parts.join(" ");
}

export function numberToWords(amount: number, currencyCode: string): string {
  if (!isFinite(amount)) return "Invalid amount";
  if (amount === 0) return "Zero";

  const isNegative = amount < 0;
  const abs = Math.abs(amount);
  if (abs >= 1e15) return `${isNegative ? "-" : ""}${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencyCode}`;

  const totalCents = Math.round(abs * 100);
  const dollars = Math.floor(totalCents / 100);
  const cents = totalCents % 100;

  if (dollars === 0 && cents === 0) return "Zero";

  const chunks: number[] = [];
  let remaining = dollars;
  while (remaining > 0) {
    chunks.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }

  const dollarParts: string[] = [];
  for (let i = chunks.length - 1; i >= 0; i--) {
    if (chunks[i] === 0) continue;
    const words = chunkToWords(chunks[i]);
    dollarParts.push(SCALES[i] ? `${words} ${SCALES[i]}` : words);
  }

  const dollarStr = dollarParts.join(" ") || "Zero";
  const centsStr = cents > 0 ? ` and ${cents}/100` : "";
  const prefix = isNegative ? "Negative " : "";

  return `${prefix}${dollarStr}${centsStr} ${currencyCode}`;
}
