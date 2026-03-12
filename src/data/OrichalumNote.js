/**
 * OrichalumNote — CRUD for Note records.
 *
 * Notes are the atomic unit of content. Each Note belongs to one Item,
 * has a visibility setting (private or party), an author, and a timestamp.
 */

import { OrichalumStore } from "./OrichalumStore.js";
import { VISIBILITY }     from "../constants.js";

export class OrichalumNote {
  // ── Read ───────────────────────────────────────────────────────────────────

  /**
   * Return all notes for a given item, unsorted.
   * @param {string} itemId
   * @returns {Promise<object[]>}
   */
  static async getByItem(itemId) {
    const data = await OrichalumStore.getData();
    return (data.notes ?? []).filter(n => n.itemId === itemId);
  }

  /**
   * Find a note by id.
   * @param {string} id
   * @returns {Promise<object|undefined>}
   */
  static async getById(id) {
    const data = await OrichalumStore.getData();
    return (data.notes ?? []).find(n => n.id === id);
  }

  // ── Write ──────────────────────────────────────────────────────────────────

  /**
   * Create a new note on an item.
   * @param {string} itemId
   * @param {object} fields
   * @param {string} fields.content    HTML string from the rich text editor.
   * @param {string} fields.visibility VISIBILITY.SECRET or VISIBILITY.PARTY
   * @returns {Promise<object>} The created note record.
   */
  static async create(itemId, { content = "", visibility = VISIBILITY.SECRET } = {}) {
    let created;
    const now = Date.now();
    await OrichalumStore.mutate(data => {
      const notes = data.notes ?? [];
      created = {
        id:         foundry.utils.randomID(),
        itemId,
        authorId:   game.user.id,
        authorName: game.user.name,
        content,
        visibility,
        createdAt:  now,
        updatedAt:  now,
      };
      notes.push(created);
      data.notes = notes;
    });
    return created;
  }

  /**
   * Update an existing note's content and/or visibility.
   * Automatically updates the `updatedAt` timestamp.
   * Only the author or GM may call this — caller must check permission.
   * @param {string} id
   * @param {object} changes  Partial note fields to merge.
   * @returns {Promise<void>}
   */
  static async update(id, changes) {
    await OrichalumStore.mutate(data => {
      const idx = (data.notes ?? []).findIndex(n => n.id === id);
      if (idx === -1) {
        console.warn(`orichalum | Note ${id} not found`);
        return;
      }
      data.notes[idx] = { ...data.notes[idx], ...changes, updatedAt: Date.now() };
    });
  }

  /**
   * Delete a note by id.
   * Only the author or GM may call this — caller must check permission.
   * @param {string} id
   * @returns {Promise<void>}
   */
  static async delete(id) {
    await OrichalumStore.mutate(data => {
      data.notes = (data.notes ?? []).filter(n => n.id !== id);
    });
  }
}
