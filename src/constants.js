/** The module identifier used for flags, settings, and socket events. */
export const MODULE_ID = "orichalum";

/**
 * Note visibility options.
 * @enum {string}
 */
export const VISIBILITY = {
  /** Visible to the author and the GM only. */
  SECRET: "secret",
  /** Visible to all players and the GM. */
  PARTY: "party",
};

/**
 * Item types — "character" items live in the Characters folder and have extra fields.
 * @enum {string}
 */
export const ITEM_TYPE = {
  CHARACTER: "character",
  STANDARD:  "standard",
};

/** Flag key marking the data-store JournalEntry. */
export const DATA_STORE_FLAG = "isDataStore";

/** Name of the hidden folder holding the data-store JournalEntry. */
export const DATA_FOLDER_NAME = "Orichalum Data (internal)";

/** Name of the JournalEntryPage that holds the serialised JSON blob. */
export const DATA_PAGE_NAME = "data";

/** Default folder names created on first launch. */
export const DEFAULT_FOLDERS = ["Characters", "Misc"];
