/**
 * linksTo — compute the "Links to" list for an Item.
 *
 * Gathers all targets referenced by:
 *   1. [[wiki-link]] syntax in any note visible to the viewer.
 *   2. Character field values (all six fields).
 *
 * Returns deduplicated item names (preserving original casing from their
 * canonical item record, falling back to the first casing seen in links).
 */

import { extractWikiLinks } from "./wikilinks.js";
import { filterVisibleNotes } from "./visibility.js";
import { ITEM_TYPE } from "../constants.js";

/**
 * Return sorted array of linked item names for the given item.
 *
 * @param {object}   item       The item record to compute links for.
 * @param {object[]} allNotes   All notes from the data store.
 * @param {object[]} allItems   All items from the data store.
 * @param {User}     viewer     The viewing user (controls note visibility).
 * @returns {string[]}          Sorted array of linked item names.
 */
export function computeLinksTo(item, allNotes, allItems, viewer) {
  const rawNames = new Set();

  // ── 1. Wiki-links from visible notes ──────────────────────────────────────
  const itemNotes   = allNotes.filter(n => n.itemId === item.id);
  const visibleNotes = filterVisibleNotes(itemNotes, viewer);
  for (const note of visibleNotes) {
    for (const name of extractWikiLinks(note.content ?? "")) {
      rawNames.add(name.trim());
    }
  }

  // ── 2. Character field values ──────────────────────────────────────────────
  if (item.type === ITEM_TYPE.CHARACTER && item.characterFields) {
    const cf = item.characterFields;
    for (const field of ["race", "home", "occupation", "faction", "lastSeen"]) {
      const val = cf[field];
      if (val?.trim()) rawNames.add(val.trim());
    }
    for (const multiField of ["knownAccomplices", "enemies"]) {
      for (const val of cf[multiField] ?? []) {
        if (val?.trim()) rawNames.add(val.trim());
      }
    }
  }

  // ── Resolve to canonical item names where possible ─────────────────────────
  const itemMap = new Map(allItems.map(i => [i.name.toLowerCase(), i.name]));
  const resolved = [];
  for (const raw of rawNames) {
    // Don't link an item to itself
    if (raw.toLowerCase() === item.name.toLowerCase()) continue;
    resolved.push(itemMap.get(raw.toLowerCase()) ?? raw);
  }

  return resolved.sort((a, b) => a.localeCompare(b));
}
