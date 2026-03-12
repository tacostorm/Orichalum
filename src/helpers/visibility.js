/**
 * Visibility helpers — determines whether a user can see a given note.
 */

import { VISIBILITY } from "../constants.js";

/**
 * Return true if the note's visibility value is "secret" (or "private", the
 * legacy pre-0.2.1 value that maps to the same meaning).
 * @param {string} visibility
 * @returns {boolean}
 */
function isSecret(visibility) {
  return visibility === VISIBILITY.SECRET || visibility === "private";
}

/**
 * Normalise a stored visibility value to the current enum.
 * Legacy notes stored with "private" are treated as VISIBILITY.SECRET.
 * @param {string} v
 * @returns {string}
 */
export function normalizeVisibility(v) {
  if (v === VISIBILITY.PARTY) return VISIBILITY.PARTY;
  return VISIBILITY.SECRET; // "secret", legacy "private", or any unknown value
}

/**
 * Return true if `viewer` is allowed to read `note`.
 *
 * Party notes are visible to everyone.
 * Secret notes are visible to their author always, and to the GM always.
 *
 * @param {object} note    A note record from the data store.
 * @param {User}   viewer  The Foundry User viewing the note.
 * @returns {boolean}
 */
export function canSeeNote(note, viewer) {
  if (!isSecret(note.visibility)) return true;
  // Secret: author always sees their own note; GM always sees all secret notes
  return note.authorId === viewer.id || viewer.isGM;
}

/**
 * Return true if `viewer` can edit or delete `note`.
 * @param {object} note
 * @param {User}   viewer
 * @returns {boolean}
 */
export function canEditNote(note, viewer) {
  return viewer.isGM || note.authorId === viewer.id;
}

/**
 * Filter an array of notes to only those visible to `viewer`.
 * @param {object[]} notes
 * @param {User}     viewer
 * @returns {object[]}
 */
export function filterVisibleNotes(notes, viewer) {
  return notes.filter(n => canSeeNote(n, viewer));
}
