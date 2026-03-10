import { SUBJECT_TYPES } from "../constants.js";

/**
 * Resolves a subjectRef to a display label and Font Awesome icon class.
 * Falls back to the snapshot label if the source document no longer exists.
 *
 * @param {SubjectRef|null} subjectRef
 * @returns {Promise<{label: string, icon: string}|null>}
 */
export async function resolveSubject(subjectRef) {
  if (!subjectRef || subjectRef.type === SUBJECT_TYPES.NONE) return null;

  if (subjectRef.type === SUBJECT_TYPES.CUSTOM) {
    return { label: subjectRef.label, icon: "fa-tag" };
  }

  try {
    // Map type → game collection key: "Actor" → game.actors, "Scene" → game.scenes, etc.
    const collectionKey = subjectRef.type.toLowerCase() + "s";
    const doc = game[collectionKey]?.get(subjectRef.documentId);

    const icon =
      subjectRef.type === SUBJECT_TYPES.ACTOR        ? "fa-user"  :
      subjectRef.type === SUBJECT_TYPES.SCENE        ? "fa-map"   :
      subjectRef.type === SUBJECT_TYPES.JOURNAL_ENTRY ? "fa-book" :
      "fa-file";

    return { label: doc?.name ?? subjectRef.label, icon };
  } catch {
    return { label: subjectRef.label, icon: "fa-question" };
  }
}
