/**
 * Visibility helpers — determines whether a user can see a given note.
 */

import { MODULE_ID, VISIBILITY, PRIVATE_VISIBILITY_MODE } from "../constants.js";

/**
 * Return true if `viewer` is allowed to read `note`.
 *
 * Party notes are visible to everyone.
 * Private notes are visible to their author always, and to the GM only when
 * the world setting "playerPrivateVisibility" is "openTable".
 *
 * @param {object} note    A note record from the data store.
 * @param {User}   viewer  The Foundry User viewing the note.
 * @returns {boolean}
 */
export function canSeeNote(note, viewer) {
  if (note.visibility === VISIBILITY.PARTY) return true;
  // Private
  if (note.authorId === viewer.id) return true;
  if (viewer.isGM) {
    const mode = game.settings.get(MODULE_ID, "playerPrivateVisibility");
    return mode === PRIVATE_VISIBILITY_MODE.OPEN_TABLE;
  }
  return false;
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
