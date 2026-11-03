// react-pdf + the PDF template (~500 kB) load on first use — never with the
// page or drawer that offers them. Shared by the Invoice page's PDF actions and
// the preview dialog's Exact PDF mode, so a warm-up by either serves both.
// Memoized: one fetch per page load.
let pdfKit: Promise<[typeof import("@react-pdf/renderer"), typeof import("./InvoicePdfTemplate")]> | null = null;

export function loadPdfKit() {
  if (!pdfKit) {
    pdfKit = Promise.all([import("@react-pdf/renderer"), import("./InvoicePdfTemplate")]);
    // A failed chunk load must not poison every later attempt.
    pdfKit.catch(() => {
      pdfKit = null;
    });
  }
  return pdfKit;
}
