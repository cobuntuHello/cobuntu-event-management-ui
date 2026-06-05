/**
 * Flatten an HTML rich-text string into a plain-text preview: strip tags
 * AND decode the common entities a WYSIWYG editor emits (&nbsp;, &amp;,
 * &#39;, …). The previous inline `replace(/<[^>]*>/g, "")` stripped tags
 * but left entities raw, so descriptions previewed as
 * "Two&nbsp;communities.&nbsp;One&nbsp;room." in the event drawer.
 *
 * Only used for compact previews — the stored description stays HTML and
 * is rendered as HTML on the public surfaces.
 */
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/(&#0*39;|&apos;)/gi, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => safeCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, n: string) => safeCodePoint(parseInt(n, 16)))
    // &amp; last so it doesn't double-decode an already-decoded entity.
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function safeCodePoint(cp: number): string {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return "";
  try {
    return String.fromCodePoint(cp);
  } catch {
    return "";
  }
}
