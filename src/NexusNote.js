import { VISIBILITY, DEFAULT_COLORS } from "./constants.js";

/**
 * The shape of a NexusNote stored in the vault's JSON page.
 *
 * @typedef {object} NexusNote
 * @property {string}   id            - Unique ID: `nn_${randomID(16)}`
 * @property {string}   title         - Short label, e.g. "Mira the Innkeeper"
 * @property {string}   content       - Note body (plain text in v0.1)
 * @property {string}   visibility    - One of VISIBILITY.PRIVATE | PARTY | GM
 * @property {string[]} tags          - Free-text tag strings
 * @property {SubjectRef[]} subjectRefs - Foundry documents this note references (0 or more)
 * @property {string[]} linkedNoteIds - IDs of other NexusNotes — unused in v0.1, reserved for v0.2 graph
 * @property {string}   color         - Hex colour for node graph (defaults by visibility)
 * @property {number}   createdAt     - Unix timestamp ms
 * @property {number}   updatedAt     - Unix timestamp ms
 * @property {boolean}  pinned        - Pinned notes appear at top of the list
 */

/**
 * @typedef {object} SubjectRef
 * @property {string}      type        - SUBJECT_TYPES value
 * @property {string|null} documentId  - Foundry document id, or null for custom
 * @property {string}      label       - Name snapshot preserved if the document is deleted
 */

/**
 * Factory that creates a new NexusNote plain object with all required fields initialised.
 *
 * @param {Partial<NexusNote>} data - Overrides for any field.
 * @returns {NexusNote}
 */
export function createNote(data = {}) {
  const now = Date.now();
  const visibility = data.visibility ?? VISIBILITY.PRIVATE;
  return {
    id: `nn_${foundry.utils.randomID(16)}`,
    title: data.title ?? "",
    content: data.content ?? "",
    visibility,
    tags: data.tags ?? [],
    subjectRefs: data.subjectRefs ?? [],
    linkedNoteIds: [], // Always [] in v0.1 — ready for v0.2 graph without migration
    color: data.color ?? DEFAULT_COLORS[visibility] ?? DEFAULT_COLORS[VISIBILITY.PRIVATE],
    createdAt: data.createdAt ?? now,
    updatedAt: data.updatedAt ?? now,
    pinned: data.pinned ?? false,
  };
}
