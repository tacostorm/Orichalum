/** The module identifier used for flags, settings, and socket events. */
export const MODULE_ID = "orichalum";

/**
 * Note visibility options.
 * @enum {string}
 */
export const VISIBILITY = {
  /** Visible only to the author (and GM when playerPrivateVisibility = "openTable"). */
  PRIVATE: "private",
  /** Visible to all players and the GM. */
  PARTY: "party",
};

/**
 * Player private note visibility world setting values.
 * @enum {string}
 */
export const PRIVATE_VISIBILITY_MODE = {
  /** Private notes are truly private — the GM cannot read them. */
  SECRET_KEEPER: "secretKeeper",
  /** The GM can read all notes including private ones. Players are warned. */
  OPEN_TABLE: "openTable",
};

/**
 * Socket event type strings.
 * @enum {string}
 */
export const SOCKET_EVENTS = {
  /** Any client → GM: perform a write operation on the data store. */
  WRITE_REQUEST: "writeRequest",
  /** GM → all clients: data was updated, re-render. */
  DATA_UPDATED: "dataUpdated",
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
