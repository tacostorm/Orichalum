/** The module identifier used for flags, settings, and socket events. */
export const MODULE_ID = "orichalum";

/** Flag keys stored on vault JournalEntries. */
export const FLAG_KEYS = {
  /** Boolean — marks this JournalEntry as a Nexus vault. */
  IS_VAULT: "isVault",
  /** String — the game.users id of the vault owner. */
  OWNER_ID: "ownerId",
};

/**
 * Note visibility levels.
 * @enum {string}
 */
export const VISIBILITY = {
  /** Visible only to the author (and the GM when gmTransparency is on). */
  PRIVATE: "private",
  /** Visible to all players and the GM. */
  PARTY: "party",
  /** Visible only to GM clients. */
  GM: "gm",
};

/**
 * Document types a note can reference as its subject.
 * @enum {string}
 */
export const SUBJECT_TYPES = {
  ACTOR: "Actor",
  SCENE: "Scene",
  JOURNAL_ENTRY: "JournalEntry",
  /** Free-text subject not tied to a Foundry document. */
  CUSTOM: "custom",
  /** No subject. */
  NONE: "none",
};

/**
 * Socket event type strings exchanged between clients.
 * @enum {string}
 */
export const SOCKET_EVENTS = {
  /** Player → GM: request vault creation for a given userId. */
  REQUEST_VAULT_CREATION: "requestVaultCreation",
  /** GM → all clients: vault has been created for a given userId. */
  VAULT_CREATED: "vaultCreated",
};

/**
 * Default node-graph colours by visibility level (used in v0.2; stored now to avoid migration).
 */
export const DEFAULT_COLORS = {
  [VISIBILITY.PRIVATE]: "#7B68EE",
  [VISIBILITY.PARTY]: "#3CB371",
  [VISIBILITY.GM]: "#DC143C",
};

/** Name of the hidden folder that holds all vault JournalEntries. */
export const VAULT_FOLDER_NAME = "Nexus Vaults";

/** Name of the JournalEntryPage inside each vault that stores the JSON notes array. */
export const NOTES_PAGE_NAME = "notes";
