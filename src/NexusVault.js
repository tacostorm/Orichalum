import { MODULE_ID, FLAG_KEYS, VAULT_FOLDER_NAME, NOTES_PAGE_NAME, SOCKET_EVENTS } from "./constants.js";

/**
 * Manages the lifecycle of Nexus vault JournalEntries.
 *
 * One vault per user, stored inside a hidden "Nexus Vaults" folder.
 * Each vault contains a single JournalEntryPage named "notes" that
 * holds the serialised JSON array of NexusNotes.
 */
export class NexusVault {
  /**
   * Returns the vault JournalEntry for a given userId, or null if not yet created.
   *
   * @param {string} userId
   * @returns {Promise<JournalEntry|null>}
   */
  static async getForUser(userId) {
    return game.journal.find(j =>
      j.getFlag(MODULE_ID, FLAG_KEYS.IS_VAULT) === true &&
      j.getFlag(MODULE_ID, FLAG_KEYS.OWNER_ID) === userId
    ) ?? null;
  }

  /**
   * Creates a new vault JournalEntry for the given userId.
   * Should only be called from a GM client.
   *
   * @param {string} userId
   * @returns {Promise<JournalEntry>}
   */
  static async createForUser(userId) {
    // Ensure the hidden folder exists
    let folder = game.folders.find(
      f => f.name === VAULT_FOLDER_NAME && f.type === "JournalEntry"
    );
    if (!folder) {
      folder = await Folder.create({
        name: VAULT_FOLDER_NAME,
        type: "JournalEntry",
        sorting: "a",
      });
    }

    const user = game.users.get(userId);
    const vaultName = `${user?.name ?? userId}'s Vault`;

    // Build ownership: owner gets OWNER, everyone else gets NONE
    const ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE };
    ownership[userId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;

    const vault = await JournalEntry.create({
      name: vaultName,
      folder: folder.id,
      ownership,
      flags: {
        [MODULE_ID]: {
          [FLAG_KEYS.IS_VAULT]: true,
          [FLAG_KEYS.OWNER_ID]: userId,
        },
      },
    });

    // Create the notes storage page inside the vault
    await JournalEntryPage.create(
      { name: NOTES_PAGE_NAME, type: "text", text: { content: "[]", format: 1 } },
      { parent: vault }
    );

    return vault;
  }

  /**
   * Returns the vault for the current user, triggering creation via socket if needed.
   *
   * - If GM: creates vault directly if missing.
   * - If player: emits `requestVaultCreation` and waits for `vaultCreated` reply.
   * - If player and no GM is online: returns null (caller should surface an error).
   *
   * @returns {Promise<JournalEntry|null>}
   */
  static async getOrCreateMine() {
    const existing = await NexusVault.getForUser(game.user.id);
    if (existing) return existing;

    if (game.user.isGM) {
      return NexusVault.createForUser(game.user.id);
    }

    // Check whether any GM is currently connected
    const gmOnline = game.users.some(u => u.isGM && u.active);
    if (!gmOnline) return null;

    // Ask the GM client to create the vault, then wait for confirmation
    return new Promise(resolve => {
      /** @param {object} data */
      const onCreated = async data => {
        if (data.type === SOCKET_EVENTS.VAULT_CREATED && data.userId === game.user.id) {
          game.socket.off(`module.${MODULE_ID}`, onCreated);
          resolve(await NexusVault.getForUser(game.user.id));
        }
      };
      game.socket.on(`module.${MODULE_ID}`, onCreated);
      game.socket.emit(`module.${MODULE_ID}`, {
        type: SOCKET_EVENTS.REQUEST_VAULT_CREATION,
        userId: game.user.id,
      });
    });
  }

  /**
   * Returns all vault JournalEntries that the current user can read.
   *
   * @returns {Promise<JournalEntry[]>}
   */
  static async getAllVisible() {
    return game.journal.filter(
      j =>
        j.getFlag(MODULE_ID, FLAG_KEYS.IS_VAULT) === true &&
        j.testUserPermission(game.user, "OBSERVER")
    );
  }
}
