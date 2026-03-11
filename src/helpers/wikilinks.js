/**
 * Wiki-link helpers.
 *
 * Syntax: [[Item Name]]
 * - Parsed from raw note content (HTML string).
 * - Rendered as clickable spans in view mode.
 * - Resolved case-insensitively; the original casing is preserved in display.
 */

/** Regex that matches [[...]] wiki-link syntax (greedy inner capture). */
const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

/**
 * Extract all [[link]] target names from an HTML string.
 * Returns raw text as written (not HTML-decoded), so the caller must
 * compare case-insensitively.
 * @param {string} html
 * @returns {string[]}
 */
export function extractWikiLinks(html) {
  const names = [];
  let match;
  WIKILINK_RE.lastIndex = 0;
  while ((match = WIKILINK_RE.exec(html)) !== null) {
    names.push(match[1].trim());
  }
  return names;
}

/**
 * Replace all [[Item Name]] occurrences in `html` with a clickable
 * `<span>` element.  The `data-wikilink` attribute holds the raw target
 * name for the click handler.
 *
 * @param {string}   html       The raw note HTML.
 * @param {object[]} allItems   Full items array from the data store (for link colouring).
 * @returns {string}            HTML with wiki-links replaced by spans.
 */
export function renderWikiLinks(html, allItems = []) {
  const itemNameSet = new Set(allItems.map(i => i.name.toLowerCase()));
  return html.replace(WIKILINK_RE, (_, name) => {
    const exists = itemNameSet.has(name.trim().toLowerCase());
    const cls    = exists ? "orichalum-wikilink" : "orichalum-wikilink orichalum-wikilink--stub";
    return `<span class="${cls}" data-wikilink="${_escapeAttr(name.trim())}">${_escapeHtml(name.trim())}</span>`;
  });
}

// ── Private helpers ──────────────────────────────────────────────────────────

function _escapeAttr(str) {
  return str.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function _escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
