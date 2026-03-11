/**
 * OrichalumFolder — CRUD for Folder records in the Orichalum data store.
 *
 * Folders are organisational containers. They are always visible to all users.
 * Only the GM can delete or rename folders.
 */

import { OrichalumStore } from "./OrichalumStore.js";

export class OrichalumFolder {
  // ── Read ───────────────────────────────────────────────────────────────────

  /**
   * Return all folders, sorted by their `sort` field.
   * @returns {Promise<object[]>}
   */
  static async getAll() {
    const data = await OrichalumStore.getData();
    return (data.folders ?? []).slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  }

  /**
   * Find a folder by id.
   * @param {string} id
   * @returns {Promise<object|undefined>}
   */
  static async getById(id) {
    const data = await OrichalumStore.getData();
    return (data.folders ?? []).find(f => f.id === id);
  }

  // ── Write ──────────────────────────────────────────────────────────────────

  /**
   * Create a new folder.
   * @param {string} name
   * @returns {Promise<object>} The created folder record.
   */
  static async create(name) {
    let created;
    await OrichalumStore.mutate(data => {
      const folders = data.folders ?? [];
      const maxSort = folders.reduce((m, f) => Math.max(m, f.sort ?? 0), -1);
      created = { id: foundry.utils.randomID(), name, sort: maxSort + 1 };
      folders.push(created);
      data.folders = folders;
    });
    return created;
  }

  /**
   * Rename a folder. GM only — caller must check permission.
   * @param {string} id
   * @param {string} newName
   * @returns {Promise<void>}
   */
  static async rename(id, newName) {
    await OrichalumStore.mutate(data => {
      const folder = (data.folders ?? []).find(f => f.id === id);
      if (folder) folder.name = newName;
    });
  }

  /**
   * Delete a folder and all Items (and their Notes) inside it.
   * GM only — caller must check permission.
   * @param {string} id
   * @returns {Promise<void>}
   */
  static async deleteWithContents(id) {
    await OrichalumStore.mutate(data => {
      // Collect item ids in this folder
      const itemIds = new Set(
        (data.items ?? []).filter(i => i.folderId === id).map(i => i.id)
      );
      data.folders = (data.folders ?? []).filter(f => f.id !== id);
      data.items   = (data.items ?? []).filter(i => i.folderId !== id);
      data.notes   = (data.notes ?? []).filter(n => !itemIds.has(n.itemId));
    });
  }
}
