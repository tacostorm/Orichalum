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
import { ITEM_TYPE }        from "../constants.js";

/** @typedef {object} CharacterFields
 * @property {string}   race
 * @property {string}   home
 * @property {string}   occupation
 * @property {string}   faction
 * @property {string}   lastSeen
 * @property {string[]} knownAccomplices
 * @property {string[]} enemies
 */

/** @returns {CharacterFields} */
function emptyCharacterFields() {
  return { race: "", home: "", occupation: "", faction: "", lastSeen: "", knownAccomplices: [], enemies: [] };
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
   * When moved into the Characters folder the item gains CHARACTER type and
   * any missing character fields are initialised with empty values.
   * When moved out of the Characters folder the item reverts to STANDARD type
   * (stored characterFields are retained but not displayed).
   * @param {string} id
   * @param {string} newFolderId
   * @returns {Promise<void>}
   */
  static async move(id, newFolderId) {
    await OrichalumStore.mutate(data => {
      const item = (data.items ?? []).find(i => i.id === id);
      if (!item) return;

      item.folderId = newFolderId;

      const destFolder  = (data.folders ?? []).find(f => f.id === newFolderId);
      const isCharFolder = destFolder?.name === "Characters";

      if (isCharFolder && item.type !== ITEM_TYPE.CHARACTER) {
        item.type = ITEM_TYPE.CHARACTER;
        // Merge existing fields (if any) with empty defaults so all keys exist
        item.characterFields = { ...emptyCharacterFields(), ...(item.characterFields ?? {}) };
      } else if (!isCharFolder && item.type === ITEM_TYPE.CHARACTER) {
        item.type = ITEM_TYPE.STANDARD;
        // characterFields data is preserved but won't be displayed in non-character items
      }
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
