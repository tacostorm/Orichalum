import { MODULE_ID, VISIBILITY } from "../constants.js";

/**
 * Returns true if `viewerUser` is allowed to read `note` authored by `authorUser`.
 *
 * Rules:
 * - GM always sees party and gm notes.
 * - GM sees private notes only when the `gmTransparency` world setting is on.
 * - Players never see gm-visibility notes.
 * - Players never see another player's private notes.
 * - Party notes are visible to everyone.
 *
 * @param {NexusNote} note
 * @param {User}      viewerUser
 * @param {User}      authorUser
 * @returns {boolean}
 */
export function canView(note, viewerUser, authorUser) {
  if (viewerUser.isGM) {
    if (note.visibility === VISIBILITY.PRIVATE) {
      return game.settings.get(MODULE_ID, "gmTransparency");
    }
    return true; // party and gm always visible to GM
  }

  // Players
  if (note.visibility === VISIBILITY.GM) return false;
  if (note.visibility === VISIBILITY.PRIVATE) return authorUser.id === viewerUser.id;
  return true; // VISIBILITY.PARTY
}

/**
 * Returns true if `user` is allowed to modify `note` authored by `authorUser`.
 * GMs can edit any note. Players can only edit their own.
 *
 * @param {NexusNote} note
 * @param {User}      user
 * @param {User}      authorUser
 * @returns {boolean}
 */
export function canEdit(note, user, authorUser) {
  if (user.isGM) return true;
  return authorUser.id === user.id;
}

/**
 * Filters a notes array to those visible to `viewerUser`.
 *
 * @param {NexusNote[]} notes
 * @param {User}        viewerUser
 * @param {User}        authorUser
 * @returns {NexusNote[]}
 */
export function filterVisible(notes, viewerUser, authorUser) {
  return notes.filter(n => canView(n, viewerUser, authorUser));
}
