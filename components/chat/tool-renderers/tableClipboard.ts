/**
 * Clipboard text for a chat table (pure — InlineTable's "Copy table"), kept
 * apart from the component so it is testable.
 */

/** A plain number as text ("-1,200.5", "+3", "-12%") — safe to paste even though it starts with - or +. */
const PLAIN_NUMBER_RE = /^[-+]?\d[\d,]*(\.\d+)?%?$/;
/** What a spreadsheet could read as a formula: =, +, -, @ (after any leading spaces), or a leading tab / CR. */
const FORMULA_START_RE = /^(\s*[=+\-@]|[\t\r])/;

/**
 * One tab-separated cell. Model-written text can carry a formula
 * (`=IMAGE("https://…?"&A1)`) that would run on paste, so text that starts
 * like one gets a leading `'` — the spreadsheet then keeps it as plain text.
 * Only the clipboard changes (the table shows the text as is), and numbers
 * are never prefixed: a formatted number can't be a formula, and a `'` would
 * paste a negative amount as text.
 */
export function clipboardCell(raw: unknown, formatted: string): string {
  const safe = typeof raw === "number" || PLAIN_NUMBER_RE.test(formatted) || !FORMULA_START_RE.test(formatted);
  return (safe ? formatted : `'${formatted}`).replace(/[\t\r\n]+/g, " ");
}
