/**
 * react-pdf's <Image> renders only PNG and JPEG — an SVG / WebP / GIF logo or
 * signature makes PDF generation (and so every invoice send) fail. One rule
 * for every upload path (invoice logo, agency default logo, agency profiles,
 * signature) and the routes that store them. Pure — client and server.
 */
export const PDF_IMAGE_ACCEPT = "image/png,image/jpeg";
export const PDF_IMAGE_ERROR = "Use a PNG or JPEG image — other formats can't be printed on the invoice PDF";

export function isPdfImageType(mimeType: string): boolean {
  return /^image\/(png|jpe?g)$/i.test(mimeType);
}

/** A stored image value the PDF can render: empty, a PNG/JPEG data URL, or a
 *  non-data URL (e.g. a static asset path — not ours to second-guess). */
export function isPdfSafeImageValue(value: string): boolean {
  if (!value.startsWith("data:")) return true;
  return /^data:image\/(png|jpe?g);base64,/i.test(value);
}
