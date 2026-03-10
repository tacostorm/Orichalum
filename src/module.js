/**
 * Nexus Notes — entry point.
 * Registers settings, hooks, the toolbar button, and the socket handler.
 */

import { MODULE_ID, SOCKET_EVENTS, VAULT_FOLDER_NAME } from "./constants.js";
import { NexusVault } from "./NexusVault.js";
import { NexusPanel } from "./ui/NexusPanel.js";

// ── Settings ──────────────────────────────────────────────────────────────────

Hooks.once("init", () => {
  /**
   * World setting: GM can read all private notes from all vaults.
   * Default: on (transparent play style).
   */
  game.settings.register(MODULE_ID, "gmTransparency", {
    name: "NEXUSNOTES.Settings.GmTransparency.Name",
    hint: "NEXUSNOTES.Settings.GmTransparency.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  /**
   * Client setting: default visibility for newly created notes.
   */
  game.settings.register(MODULE_ID, "defaultVisibility", {
    name: "NEXUSNOTES.Settings.DefaultVisibility.Name",
    hint: "NEXUSNOTES.Settings.DefaultVisibility.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      private: "NEXUSNOTES.Visibility.Private",
      party:   "NEXUSNOTES.Visibility.Party",
    },
    default: "private",
  });
});

// ── Ready ─────────────────────────────────────────────────────────────────────

Hooks.once("ready", async () => {
  // Ensure the Nexus Vaults folder exists for GMs on first login
  if (game.user.isGM) {
    const exists = game.folders.find(
      f => f.name === VAULT_FOLDER_NAME && f.type === "JournalEntry"
    );
    if (!exists) {
      await Folder.create({ name: VAULT_FOLDER_NAME, type: "JournalEntry", sorting: "a" });
      console.log("nexus-notes | Created Nexus Vaults folder.");
    }
  }

  // Register socket listener
  game.socket.on(`module.${MODULE_ID}`, _onSocketMessage);

  console.log("nexus-notes | Ready.");
});

// ── Toolbar Button ─────────────────────────────────────────────────────────────

Hooks.on("getSceneControlButtons", controls => {
  controls.push({
    name: "nexus-notes",
    title: game.i18n.localize("NEXUSNOTES.ToolbarButton"),
    icon: "fa-solid fa-book-open",
    layer: "controls",
    tools: [],
    activeTool: null,
    onClick: () => NexusPanel.open(),
    button: true,
  });
});

// ── Socket Handler ────────────────────────────────────────────────────────────

/**
 * Dispatch incoming socket messages to the appropriate handler.
 * @param {object} data
 */
async function _onSocketMessage(data) {
  switch (data.type) {
    case SOCKET_EVENTS.REQUEST_VAULT_CREATION:
      await _handleRequestVaultCreation(data);
      break;
    case SOCKET_EVENTS.VAULT_CREATED:
      await _handleVaultCreated(data);
      break;
    default:
      console.warn(`nexus-notes | Unknown socket event: ${data.type}`);
  }
}

/**
 * GM-side handler: create the vault for the requesting player, then broadcast confirmation.
 * Only the active GM client with the lowest user id responds to avoid duplicate creation.
 *
 * @param {{ type: string, userId: string }} data
 */
async function _handleRequestVaultCreation(data) {
  if (!game.user.isGM) return;

  // Only the first active GM handles this to prevent race conditions
  const activeGMs = game.users.filter(u => u.isGM && u.active).sort((a, b) => a.id.localeCompare(b.id));
  if (activeGMs[0]?.id !== game.user.id) return;

  const { userId } = data;

  // Guard: vault may already exist if two quick open events fired
  const existing = await NexusVault.getForUser(userId);
  if (!existing) {
    await NexusVault.createForUser(userId);
    console.log(`nexus-notes | Created vault for user ${userId}.`);
  }

  // Notify all clients (the requesting player listens for this)
  game.socket.emit(`module.${MODULE_ID}`, {
    type: SOCKET_EVENTS.VAULT_CREATED,
    userId,
  });
}

/**
 * Player-side handler: the vault is now ready — open the panel.
 * The promise resolution in NexusVault.getOrCreateMine handles loading
 * the vault; this handler triggers the panel to render if it is already open.
 *
 * @param {{ type: string, userId: string }} data
 */
async function _handleVaultCreated(data) {
  if (data.userId !== game.user.id) return;
  // The NexusPanel may already be open showing the "no GM" warning — re-render it.
  if (NexusPanel._instance?.rendered) {
    NexusPanel._instance.render();
  }
}
