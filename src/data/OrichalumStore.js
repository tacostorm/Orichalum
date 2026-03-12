/**
 * OrichalumStore — low-level read/write access to the Orichalum data
 * JournalEntry that acts as the shared database for all clients.
 *
 * Storage: one hidden JournalEntry (flagged isDataStore) holds a single
 * JournalEntryPage whose text.content is the JSON-serialised data blob:
 *   { folders: [...], items: [...], notes: [...] }
 *
 * The JournalEntry is created by the first GM on login with
 * ownership: { default: OWNER } so all users can write directly.
 * Foundry broadcasts page updates to all connected clients automatically,
 * so there is no need for manual socket synchronisation on writes.
 *
 * Socket messages are only used so that player write calls that arrive
 * before the JournalEntry is set up can be queued and retried.
 */

import {
  MODULE_ID,
  DATA_STORE_FLAG,
  DATA_FOLDER_NAME,
  DATA_PAGE_NAME,
  DEFAULT_FOLDERS,
} from "../constants.js";

/** @typedef {{ folders: object[], items: object[], notes: object[] }} StoreData */

export class OrichalumStore {
  /** @type {StoreData|null} Last successfully parsed state; returned on parse failures. */
  static _lastKnownGoodData = null;

  /** @type {boolean} Whether a parse-error warning has already been logged this session. */
  static _parseErrorLogged = false;
  // ── Initialisation ─────────────────────────────────────────────────────────

  /**
   * Called by the GM on the `ready` hook to ensure the data-store JournalEntry
   * exists with correct permissions and default data.
   * @returns {Promise<JournalEntry>}
   */
  static async initAsGM() {
    let journal = OrichalumStore._findDataJournal();

    if (!journal) {
      // Create the hidden folder if it does not exist
      let folder = game.folders.find(
        f => f.name === DATA_FOLDER_NAME && f.type === "JournalEntry"
      );
      if (!folder) {
        folder = await Folder.create({
          name: DATA_FOLDER_NAME,
          type: "JournalEntry",
          sorting: "a",
        });
      }

      // Build default folder data
      const defaultFolders = DEFAULT_FOLDERS.map((name, i) => ({
        id: foundry.utils.randomID(),
        name,
        sort: i,
      }));

      journal = await JournalEntry.create({
        name: "Orichalum Data",
        folder: folder.id,
        ownership: { default: 3 }, // OWNER for all users
        flags: { [MODULE_ID]: { [DATA_STORE_FLAG]: true } },
        pages: [{
          name: DATA_PAGE_NAME,
          type: "text",
          text: {
            content: JSON.stringify({ folders: defaultFolders, items: [], notes: [] }),
          },
        }],
      });

      console.log("orichalum | Data store JournalEntry created.");
    } else {
      // Ensure ownership is OWNER for all (may have been reset)
      if (journal.ownership.default !== 3) {
        await journal.update({ ownership: { default: 3 } });
      }
    }

    return journal;
  }

  // ── Data access ────────────────────────────────────────────────────────────

  /**
   * Read and return the full data blob.
   * @returns {Promise<StoreData>}
   */
  static async getData() {
    const fallback = OrichalumStore._lastKnownGoodData ?? { folders: [], items: [], notes: [] };

    const journal = OrichalumStore._findDataJournal();
    if (!journal) return fallback;

    const page = journal.pages.getName(DATA_PAGE_NAME);
    if (!page) return fallback;

    try {
      const parsed = JSON.parse(page.text.content ?? "{}");
      // Cache the successfully parsed state and reset the one-shot warning flag
      OrichalumStore._lastKnownGoodData = parsed;
      OrichalumStore._parseErrorLogged  = false;
      return parsed;
    } catch (err) {
      // Log the warning exactly once per run of bad data to avoid console spam
      if (!OrichalumStore._parseErrorLogged) {
        console.warn("orichalum | Data store parse failed — using last known good state.", err);
        OrichalumStore._parseErrorLogged = true;
      }
      return fallback;
    }
  }

  /**
   * Overwrite the full data blob.
   * All users have OWNER permission on the journal, so this works for everyone.
   * @param {StoreData} data
   * @returns {Promise<void>}
   */
  static async setData(data) {
    const journal = OrichalumStore._findDataJournal();
    if (!journal) {
      console.warn("orichalum | Data store not found — cannot write.");
      return;
    }

    const page = journal.pages.getName(DATA_PAGE_NAME);
    if (!page) {
      console.warn("orichalum | Data page not found — cannot write.");
      return;
    }

    await page.update({ "text.content": JSON.stringify(data) });
  }

  /**
   * Apply a mutation function to the data and persist.
   * @param {(data: StoreData) => void} mutator  Called with the full data object.
   * @returns {Promise<StoreData>} The updated data.
   */
  static async mutate(mutator) {
    const data = await OrichalumStore.getData();
    mutator(data);
    await OrichalumStore.setData(data);
    return data;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Locate the data-store JournalEntry in the world journal collection.
   * @returns {JournalEntry|undefined}
   * @private
   */
  static _findDataJournal() {
    return game.journal.find(
      j => j.getFlag(MODULE_ID, DATA_STORE_FLAG) === true
    );
  }
}
