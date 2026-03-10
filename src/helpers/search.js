/**
 * Filters a notes array client-side against a search query string.
 * Matches against title, content, tags, and subject reference labels.
 * Returns the full array unchanged if the query is empty.
 *
 * @param {NexusNote[]} notes  - Already-loaded, already-filtered notes to search.
 * @param {string}      query  - Raw search string from the user.
 * @returns {NexusNote[]}
 */
export function searchNotes(notes, query) {
  if (!query?.trim()) return notes;
  const q = query.toLowerCase();
  return notes.filter(note =>
    note.title?.toLowerCase().includes(q) ||
    note.content?.toLowerCase().includes(q) ||
    note.tags?.some(t => t.toLowerCase().includes(q)) ||
    note.subjectRefs?.some(r => r.label?.toLowerCase().includes(q))
  );
}
