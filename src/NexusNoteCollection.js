import { NOTES_PAGE_NAME } from "./constants.js";

/**
 * CRUD operations for the notes stored inside a vault JournalEntry.
 *
 * Notes are persisted as a JSON array in the `text.content` field of the
 * JournalEntryPage named "notes" inside the vault.
 */
export class NexusNoteCollection {
  /**
   * Load and return all notes from a vault.
   *
   * @param {JournalEntry} vault
   * @returns {Promise<NexusNote[]>}
   */
  static async getAll(vault) {
    const page = vault.pages.getName(NOTES_PAGE_NAME);
    if (!page) return [];
    try {
      return JSON.parse(page.text.content ?? "[]");
    } catch (err) {
      console.error(`orichalum | Failed to parse notes for vault ${vault.id}:`, err);
      return [];
    }
  }

  /**
   * Append a new note to the vault and persist.
   *
   * @param {JournalEntry} vault
   * @param {NexusNote}    note
   * @returns {Promise<void>}
   */
  static async add(vault, note) {
    const notes = await NexusNoteCollection.getAll(vault);
    notes.push(note);
    await NexusNoteCollection._save(vault, notes);
  }

  /**
   * Merge changes into an existing note by id and persist.
   * Automatically sets `updatedAt` to the current timestamp.
   *
   * @param {JournalEntry}      vault
   * @param {string}            noteId
   * @param {Partial<NexusNote>} changes
   * @returns {Promise<void>}
   */
  static async update(vault, noteId, changes) {
    const notes = await NexusNoteCollection.getAll(vault);
    const idx = notes.findIndex(n => n.id === noteId);
    if (idx === -1) {
      console.warn(`orichalum | Note ${noteId} not found in vault ${vault.id}`);
      return;
    }
    notes[idx] = { ...notes[idx], ...changes, updatedAt: Date.now() };
    await NexusNoteCollection._save(vault, notes);
  }

  /**
   * Remove a note by id from the vault and persist.
   *
   * @param {JournalEntry} vault
   * @param {string}       noteId
   * @returns {Promise<void>}
   */
  static async delete(vault, noteId) {
    const notes = await NexusNoteCollection.getAll(vault);
    const filtered = notes.filter(n => n.id !== noteId);
    await NexusNoteCollection._save(vault, filtered);
  }

  /**
   * Serialise notes array and write it to the vault's notes page.
   *
   * @param {JournalEntry} vault
   * @param {NexusNote[]}  notes
   * @returns {Promise<void>}
   * @private
   */
  static async _save(vault, notes) {
    const page = vault.pages.getName(NOTES_PAGE_NAME);
    if (!page) throw new Error(`orichalum | No "${NOTES_PAGE_NAME}" page found in vault ${vault.id}`);
    await page.update({ "text.content": JSON.stringify(notes) });
  }
}
