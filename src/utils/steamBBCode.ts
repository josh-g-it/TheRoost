/**
 * Steam news article content parser.
 *
 * Steam's GetNewsForApp API returns article bodies in two formats:
 *   - Official/developer posts: BBCode markup ([p], [b], [url], [list], etc.)
 *   - Third-party news sites: HTML markup (<p>, <a>, <img>, etc.)
 *
 * This module detects the format and converts both to safe, styled HTML.
 */

// ── Public API ──────────────────────────────────────────────────

/** Convert article content (BBCode or HTML) into sanitised HTML for rendering. */
export function parseNewsContent(raw: string): string {
  if (isHtmlContent(raw)) {
    return sanitizeHtml(raw);
  }
  return parseBBCode(raw);
}

/** Strip all markup (BBCode or HTML) and return plain text for card snippets. */
export function stripMarkup(raw: string): string {
  if (isHtmlContent(raw)) {
    return stripHtml(raw);
  }
  return stripBBCode(raw);
}

// ── Format Detection ────────────────────────────────────────────

/** Detect whether the content is HTML (vs BBCode). */
function isHtmlContent(raw: string): boolean {
  // Check for common HTML tags that wouldn't appear in BBCode
  return /<(?:p|div|a |img |br|span|h[1-6]|strong|em|ul|ol|li|blockquote|table)\b/i.test(
    raw,
  );
}

// ── HTML Sanitizer ──────────────────────────────────────────────

/** Allowlisted HTML tags and their permitted attributes. */
const ALLOWED_TAGS: Record<string, Set<string>> = {
  p: new Set(),
  br: new Set(),
  strong: new Set(),
  b: new Set(),
  em: new Set(),
  i: new Set(),
  u: new Set(),
  s: new Set(),
  a: new Set(["href", "title"]),
  img: new Set(["src", "alt", "width", "height"]),
  h1: new Set(),
  h2: new Set(),
  h3: new Set(),
  h4: new Set(),
  h5: new Set(),
  h6: new Set(),
  ul: new Set(),
  ol: new Set(),
  li: new Set(),
  blockquote: new Set(),
  hr: new Set(),
  table: new Set(),
  thead: new Set(),
  tbody: new Set(),
  tr: new Set(),
  th: new Set(),
  td: new Set(),
  pre: new Set(),
  code: new Set(),
  div: new Set(),
  span: new Set(),
  figure: new Set(),
  figcaption: new Set(),
};

/**
 * Sanitize HTML by allowlisting tags and attributes.
 * All non-allowed tags are stripped; all non-allowed attributes are removed.
 * Links get target="_blank" + rel="noopener noreferrer".
 * Images get class for styling + lazy loading.
 */
function sanitizeHtml(raw: string): string {
  // Process tag by tag
  const result = raw.replace(
    /<(\/?)(\w+)(\s[^>]*)?\s*\/?>/gi,
    (_match, slash, tagName, attrStr) => {
      const tag = tagName.toLowerCase();
      if (!(tag in ALLOWED_TAGS)) return "";

      // Closing tag
      if (slash) return `</${tag}>`;

      // Self-closing / void tags
      const isVoid = tag === "br" || tag === "hr" || tag === "img";
      const allowed = ALLOWED_TAGS[tag];

      // Parse and filter attributes
      let attrs = "";
      if (attrStr && allowed.size > 0) {
        const attrRegex = /(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/gi;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
          const attrName = attrMatch[1].toLowerCase();
          const attrVal = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";
          if (allowed.has(attrName)) {
            // Validate URL attributes
            if (attrName === "href" || attrName === "src") {
              if (!isSafeUrl(attrVal)) continue;
            }
            attrs += ` ${attrName}="${escapeAttr(attrVal)}"`;
          }
        }
      }

      // Add safety attributes to links
      if (tag === "a") {
        attrs += ' target="_blank" rel="noopener noreferrer"';
      }

      // Add styling attributes to images
      if (tag === "img") {
        attrs += ' class="news-body__img" loading="lazy"';
      }

      // Downsize headings to fit detail panel (h1→h3, h2→h4)
      const mappedTag = tag === "h1" ? "h3" : tag === "h2" ? "h4" : tag;

      return isVoid ? `<${mappedTag}${attrs} />` : `<${mappedTag}${attrs}>`;
    },
  );

  // Collapse excessive whitespace/newlines
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

/** Strip all HTML tags for plain text. */
function stripHtml(raw: string): string {
  let s = raw;
  // Remove <img> tags entirely (don't want alt text noise)
  s = s.replace(/<img[^>]*>/gi, "");
  // Strip all tags
  s = s.replace(/<[^>]+>/g, "");
  // Decode common entities
  s = s.replace(/&amp;/g, "&");
  s = s.replace(/&lt;/g, "<");
  s = s.replace(/&gt;/g, ">");
  s = s.replace(/&quot;/g, '"');
  s = s.replace(/&#39;/g, "'");
  s = s.replace(/&nbsp;/g, " ");
  // Collapse whitespace
  s = s.replace(/\n{2,}/g, " ");
  s = s.replace(/\s{2,}/g, " ");
  return s.trim();
}

// ── BBCode Parser ───────────────────────────────────────────────

/** Convert Steam BBCode to sanitised HTML. */
function parseBBCode(raw: string): string {
  let s = raw;

  // ── 1. Escape HTML entities (prevent XSS) ──────────────────────
  s = s.replace(/&/g, "&amp;");
  s = s.replace(/</g, "&lt;");
  s = s.replace(/>/g, "&gt;");

  // ── 2. YouTube previews → clickable link ───────────────────────
  s = s.replace(
    /\[previewyoutube=([^\];]+)[^\]]*\][\s\S]*?\[\/previewyoutube\]/gi,
    (_, id) => {
      const videoId = id.split(";")[0];
      return `<a class="news-body__yt-link" href="https://youtube.com/watch?v=${encodeURIComponent(videoId)}" target="_blank" rel="noopener noreferrer">\u25b6 Watch on YouTube</a>`;
    },
  );

  // ── 3. Headings (map Steam h1→h3 so they fit inside the detail panel) ──
  s = s.replace(/\[h1\]([\s\S]*?)\[\/h1\]/gi, "<h3>$1</h3>");
  s = s.replace(/\[h2\]([\s\S]*?)\[\/h2\]/gi, "<h4>$1</h4>");
  s = s.replace(/\[h3\]([\s\S]*?)\[\/h3\]/gi, "<h5>$1</h5>");

  // ── 4. Paragraphs ─────────────────────────────────────────────
  s = s.replace(/\[p\]\s*\[\/p\]/gi, ""); // remove empties
  s = s.replace(/\[p\]([\s\S]*?)\[\/p\]/gi, "<p>$1</p>");

  // ── 5. Text formatting ────────────────────────────────────────
  s = s.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, "<strong>$1</strong>");
  s = s.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, "<em>$1</em>");
  s = s.replace(/\[u\]([\s\S]*?)\[\/u\]/gi, "<u>$1</u>");
  s = s.replace(/\[strike\]([\s\S]*?)\[\/strike\]/gi, "<s>$1</s>");

  // ── 6. URLs ───────────────────────────────────────────────────
  s = s.replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, (_, href, text) =>
    bbcodeLink(href, text),
  );
  s = s.replace(/\[url\]([\s\S]*?)\[\/url\]/gi, (_, href) => bbcodeLink(href, href));

  // ── 7. Lists ──────────────────────────────────────────────────
  s = s.replace(/\[list\]/gi, "<ul>");
  s = s.replace(/\[\/list\]/gi, "</ul>");
  s = s.replace(/\[olist\]/gi, "<ol>");
  s = s.replace(/\[\/olist\]/gi, "</ol>");
  // [*] starts a list item; [/*] is the optional explicit close — strip it
  s = s.replace(/\[\/\*\]/g, "");
  s = s.replace(/\[\*\]/g, "</li><li>");
  // Clean stray </li> right after opening tag
  s = s.replace(/<ul>\s*<\/li>/g, "<ul>");
  s = s.replace(/<ol>\s*<\/li>/g, "<ol>");
  // Close the last <li> before the closing list tag
  s = s.replace(/<\/ul>/g, "</li></ul>");
  s = s.replace(/<\/ol>/g, "</li></ol>");
  // Remove any double </li> that slipped through
  s = s.replace(/<\/li>\s*<\/li>/g, "</li>");

  // ── 8. Images ─────────────────────────────────────────────────
  s = s.replace(
    /\[img\]([\s\S]*?)\[\/img\]/gi,
    '<img class="news-body__img" src="$1" alt="" loading="lazy" />',
  );

  // ── 9. Horizontal rule ────────────────────────────────────────
  s = s.replace(/\[hr\]\[\/hr\]/gi, "<hr />");
  s = s.replace(/\[hr\]/gi, "<hr />");

  // ── 10. Spoiler ───────────────────────────────────────────────
  s = s.replace(
    /\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi,
    '<details class="news-body__spoiler"><summary>Spoiler</summary>$1</details>',
  );

  // ── 11. Quotes ────────────────────────────────────────────────
  s = s.replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi, "<blockquote>$1</blockquote>");

  // ── 12. Code blocks ───────────────────────────────────────────
  s = s.replace(/\[code\]([\s\S]*?)\[\/code\]/gi, "<pre><code>$1</code></pre>");

  // ── 13. Tables ────────────────────────────────────────────────
  s = s.replace(/\[table\]([\s\S]*?)\[\/table\]/gi, "<table>$1</table>");
  s = s.replace(/\[tr\]([\s\S]*?)\[\/tr\]/gi, "<tr>$1</tr>");
  s = s.replace(/\[td\]([\s\S]*?)\[\/td\]/gi, "<td>$1</td>");
  s = s.replace(/\[th\]([\s\S]*?)\[\/th\]/gi, "<th>$1</th>");

  // ── 14. Strip unrecognised BBCode tags ────────────────────────
  s = s.replace(/\[\/?\w+(?:=[^\]]+)?\]/g, "");

  // ── 15. Newlines → <br> ───────────────────────────────────────
  s = s.replace(/\n/g, "<br />");
  // Collapse excessive breaks
  s = s.replace(/(<br \/>){3,}/g, "<br /><br />");
  // Remove breaks right after block openings / before block closings
  s = s.replace(
    /(<(?:p|h[345]|ul|ol|li|blockquote|table|tr|td|th|hr)(?:\s[^>]*)?>)\s*<br \/>/gi,
    "$1",
  );
  s = s.replace(
    /<br \/>\s*(<\/(?:p|h[345]|ul|ol|li|blockquote|table|tr|td|th)>)/gi,
    "$1",
  );

  // Remove empty paragraphs
  s = s.replace(/<p>\s*(<br \/>)*\s*<\/p>/g, "");

  return s.trim();
}

/** Strip all BBCode tags for plain text. */
function stripBBCode(raw: string): string {
  let s = raw;
  // Remove YouTube previews entirely
  s = s.replace(/\[previewyoutube=[^\]]*\][\s\S]*?\[\/previewyoutube\]/gi, "");
  // Remove images
  s = s.replace(/\[img\][\s\S]*?\[\/img\]/gi, "");
  // Strip all BBCode tags (including [*] and [/*])
  s = s.replace(/\[\/?\*\]/g, "");
  s = s.replace(/\[\/?\w+(?:=[^\]]+)?\]/g, "");
  // Collapse whitespace
  s = s.replace(/\n{2,}/g, " ");
  s = s.replace(/\s{2,}/g, " ");
  return s.trim();
}

// ── Helpers ──────────────────────────────────────────────────────

/** Only allow http(s) URLs. */
function isSafeUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** Escape characters for use inside HTML attribute values. */
function escapeAttr(val: string): string {
  return val
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Create a safe link from BBCode (input is already HTML-escaped). */
function bbcodeLink(rawHref: string, text: string): string {
  const href = rawHref.replace(/&amp;/g, "&");
  if (isSafeUrl(href)) {
    return `<a href="${rawHref}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  }
  return text;
}
