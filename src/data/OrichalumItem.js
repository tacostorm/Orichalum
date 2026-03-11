/**
 * OrichalumItem — CRUD for Item records.
 *
 * Items belong to exactly one Folder. Names are unique per folder
 * (case-insensitive). An Item is visible to a user only if they can see
 * at least one Note inside it.
 *
 * Character Items (in the Characters folder) carry six auto-linking fields.
 * All other Items are Standard Items.
 */

import { OrichalumStore }  from "./OrichalumStore.js";
import { canSeeNote }       from "../helpers/visibility.js";
import { ITEM_TYPE }        from "../constants.js";

/** @typedef {object} CharacterFields
 * @property {string}   race
 * @property {string}   home
 * @property {string}   occupation
 * @property {string}   lastSeen
 * @property {string[]} knownAccomplices
 * @property {string[]} enemies
 */

/** @returns {CharacterFields} */
function emptyCharacterFields() {
  return { race: "", home: "", occupation: "", lastSeen: "", knownAccomplices: [], enemies: [] };
}

export class OrichalumItem {
  // ── Read ───────────────────────────────────────────────────────────────────

  /**
   * Return all items, sorted by name within each folder.
   * @returns {Promise<object[]>}
   */
  static async getAll() {
    const data = await OrichalumStore.getData();
    return (data.items ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Return all items in a given folder.
   * @param {string} folderId
   * @returns {Promise<object[]>}
   */
  static async getByFolder(folderId) {
    const all = await OrichalumItem.getAll();
    return all.filter(i => i.folderId === folderId);
  }

  /**
   * Find an item by id.
   * @param {string} id
   * @returns {Promise<object|undefined>}
   */
  static async getById(id) {
    const data = await OrichalumStore.getData();
    return (data.items ?? []).find(i => i.id === id);
  }

  /**
   * Find an item by name (case-insensitive), searching all folders.
   * @param {string} name
   * @returns {Promise<object|undefined>}
   */
  static async getByName(name) {
    const all  = await OrichalumItem.getAll();
    const norm = name.trim().toLowerCase();
    return all.find(i => i.name.toLowerCase() === norm);
  }

  /**
   * Find an item by name within a specific folder (case-insensitive).
   * @param {string} folderId
   * @param {string} name
   * @returns {Promise<object|undefined>}
   */
  static async getByNameInFolder(folderId, name) {
    const items = await OrichalumItem.getByFolder(folderId);
    const norm  = name.trim().toLowerCase();
    return items.find(i => i.name.toLowerCase() === norm);
  }

  /**
   * Return all items visible to the given user (at least one visible note).
   * @param {User}     viewer
   * @param {object[]} [allNotes] Pre-loaded notes array (avoids re-fetching).
   * @returns {Promise<object[]>}
   */
  static async getVisible(viewer, allNotes = null) {
    const data  = await OrichalumStore.getData();
    const notes = allNotes ?? (data.notes ?? []);
    return (data.items ?? []).filter(item => {
      const itemNotes = notes.filter(n => n.itemId === item.id);
      // An item with no notes is hidden from all users
      return itemNotes.some(n => canSeeNote(n, viewer));
    });
  }

  // ── Write ──────────────────────────────────────────────────────────────────

  /**
   * Create a new item in the given folder.
   * If an item with the same name already exists in that folder, the existing
   * item is returned instead (name uniqueness enforcement).
   * @param {string} folderId
   * @param {string} name
   * @param {string} [type]   ITEM_TYPE.CHARACTER or ITEM_TYPE.STANDARD
   * @returns {Promise<{ item: object, created: boolean }>}
   */
  static async create(folderId, name, type = ITEM_TYPE.STANDARD) {
    // Check for existing item with same name in folder
    const existing = await OrichalumItem.getByNameInFolder(folderId, name);
    if (existing) return { item: existing, created: false };

    let created;
    await OrichalumStore.mutate(data => {
      const items = data.items ?? [];
      created = {
        id:       foundry.utils.randomID(),
        folderId,
        name,
        type,
        characterFields: type === ITEM_TYPE.CHARACTER ? emptyCharacterFields() : null,
        sort: items.filter(i => i.folderId === folderId).length,
      };
      items.push(created);
      data.items = items;
    });
    return { item: created, created: true };
  }

  /**
   * Rename an item.
   * @param {string} id
   * @param {string} newName
   * @returns {Promise<void>}
   */
  static async rename(id, newName) {
    await OrichalumStore.mutate(data => {
      const item = (data.items ?? []).find(i => i.id === id);
      if (item) item.name = newName;
    });
  }

  /**
   * Move an item to a different folder.
   * @param {string} id
   * @param {string} newFolderId
   * @returns {Promise<void>}
   */
  static async move(id, newFolderId) {
    await OrichalumStore.mutate(data => {
      const item = (data.items ?? []).find(i => i.id === id);
      if (item) item.folderId = newFolderId;
    });
  }

  /**
   * Update the character fields of a Character Item.
   * @param {string}           id
   * @param {CharacterFields}  fields
   * @returns {Promise<void>}
   */
  static async updateCharacterFields(id, fields) {
    await OrichalumStore.mutate(data => {
      const item = (data.items ?? []).find(i => i.id === id);
      if (item) item.characterFields = { ...item.characterFields, ...fields };
    });
  }

  /**
   * Delete an item and all Notes inside it. GM only — caller must check permission.
   * @param {string} id
   * @returns {Promise<void>}
   */
  static async deleteWithNotes(id) {
    await OrichalumStore.mutate(data => {
      data.items = (data.items ?? []).filter(i => i.id !== id);
      data.notes = (data.notes ?? []).filter(n => n.itemId !== id);
    });
  }
}
