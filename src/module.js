/**
 * Orichalum — entry point.
 *
 * Registers settings, Handlebars helpers, hooks for:
 *   - toolbar button (getSceneControlButtons, v13 API)
 *   - data-store initialisation (ready)
 *   - live re-render on data changes (updateJournalEntryPage)
 *   - actor right-click integration (getActorContextOptions, getTokenContextOptions)
 */

import {
  MODULE_ID,
  DATA_STORE_FLAG,
  PRIVATE_VISIBILITY_MODE,
  VISIBILITY,
  ITEM_TYPE,
} from "./constants.js";
import { OrichalumStore }  from "./data/OrichalumStore.js";
import { OrichalumItem }   from "./data/OrichalumItem.js";
import { OrichalumFolder } from "./data/OrichalumFolder.js";
import { OrichalumApp }    from "./ui/OrichalumApp.js";

// ── Init ──────────────────────────────────────────────────────────────────────

Hooks.once("init", () => {
  // ── Settings ──────────────────────────────────────────────────────────────

  /**
   * World setting: how the GM can see private notes.
   */
  game.settings.register(MODULE_ID, "playerPrivateVisibility", {
    name:   "NEXUSNOTES.Settings.PlayerPrivateVisibility.Name",
    hint:   "NEXUSNOTES.Settings.PlayerPrivateVisibility.Hint",
    scope:  "world",
    config: true,
    type:   String,
    choices: {
      [PRIVATE_VISIBILITY_MODE.SECRET_KEEPER]: "NEXUSNOTES.Settings.PlayerPrivateVisibility.SecretKeeper",
      [PRIVATE_VISIBILITY_MODE.OPEN_TABLE]:    "NEXUSNOTES.Settings.PlayerPrivateVisibility.OpenTable",
    },
    default: PRIVATE_VISIBILITY_MODE.SECRET_KEEPER,
  });

  /** Client setting: pre-selected visibility when creating a new note. */
  game.settings.register(MODULE_ID, "defaultNoteVisibility", {
    name:   "NEXUSNOTES.Settings.DefaultNoteVisibility.Name",
    hint:   "NEXUSNOTES.Settings.DefaultNoteVisibility.Hint",
    scope:  "client",
    config: true,
    type:   String,
    choices: {
      [VISIBILITY.PRIVATE]: "NEXUSNOTES.Visibility.Private",
      [VISIBILITY.PARTY]:   "NEXUSNOTES.Visibility.Party",
    },
    default: VISIBILITY.PRIVATE,
  });

  // ── Handlebars helpers ────────────────────────────────────────────────────

  /** Equality test: {{#if (eq a b)}} */
  Handlebars.registerHelper("eq", (a, b) => a === b);

  /** Join array to delimited string: {{join arr ", "}} */
  Handlebars.registerHelper("join", (arr, sep) =>
    Array.isArray(arr) ? arr.join(typeof sep === "string" ? sep : ", ") : ""
  );

  console.log("orichalum | Registered settings and Handlebars helpers.");
});

// ── Settings UI — inject ⓘ tooltip ────────────────────────────────────────────

Hooks.on("renderSettingsConfig", (_app, html) => {
  const hintEl = html.querySelector(
    `[data-setting-id="${MODULE_ID}.playerPrivateVisibility"] .notes`
  );
  if (!hintEl) return;

  const icon    = document.createElement("span");
  icon.innerHTML = " ⓘ";
  icon.title    = game.i18n.localize("NEXUSNOTES.Settings.PlayerPrivateVisibility.Tooltip");
  icon.style.cssText = "cursor:help;color:var(--color-text-secondary)";
  hintEl.appendChild(icon);
});

// ── Ready ─────────────────────────────────────────────────────────────────────

Hooks.once("ready", async () => {
  if (game.user.isGM) {
    await OrichalumStore.initAsGM();
    console.log("orichalum | Data store ready.");
  }
  console.log("orichalum | Ready.");
});

// ── Live re-render when data store changes ────────────────────────────────────

/**
 * Foundry broadcasts updateJournalEntryPage to all connected clients whenever
 * any user saves to the data store page. Re-render the app if it is open.
 */
Hooks.on("updateJournalEntryPage", page => {
  if (page.parent?.getFlag(MODULE_ID, DATA_STORE_FLAG) !== true) return;
  if (OrichalumApp._instance?.rendered) {
    OrichalumApp._instance.render();
  }
});

// ── Toolbar button (Foundry v13 API) ──────────────────────────────────────────
//
// In v13, getSceneControlButtons receives a Record<string, SceneControl>
// instead of an array. Tools are also a Record. Callback is `onChange`.
// Reference: https://foundryvtt.com/api/v13/functions/hookEvents.getSceneControlButtons.html

Hooks.on("getSceneControlButtons", controls => {
  controls.orichalum = {
    name:  "orichalum",
    title: "NEXUSNOTES.App.Title",
    icon:  "fa-solid fa-book-open",
    tools: {
      open: {
        name:     "open",
        title:    "NEXUSNOTES.App.Title",
        icon:     "fa-solid fa-book-open",
        order:    0,
        button:   true,
        visible:  true,
        onChange: () => OrichalumApp.open(),
      },
    },
    activeTool: "open",
  };
});

// ── Actor sidebar right-click ─────────────────────────────────────────────────

/**
 * Add "Add Orichalum Note" to the Actor sidebar entry context menu.
 * @param {jQuery}   _html
 * @param {object[]} options  Mutable context-menu options array.
 */
Hooks.on("getActorContextOptions", (_html, options) => {
  options.push({
    name:      "NEXUSNOTES.Context.AddNote",
    icon:      "<i class='fa-solid fa-book-open'></i>",
    condition: () => true,
    callback:  li => {
      const el      = li instanceof HTMLElement ? li : li[0];
      const actorId = el?.dataset?.documentId ?? el?.dataset?.entryId;
      const actor   = actorId ? game.actors.get(actorId) : null;
      if (actor) _openNoteForActor(actor);
      else console.warn("orichalum | Could not resolve actor from context menu li:", li);
    },
  });
});

// ── Canvas token right-click ──────────────────────────────────────────────────

/**
 * Add "Add Orichalum Note" to the canvas token context menu.
 * @param {jQuery}   _html
 * @param {object[]} options
 */
Hooks.on("getTokenContextOptions", (_html, options) => {
  options.push({
    name:      "NEXUSNOTES.Context.AddNote",
    icon:      "<i class='fa-solid fa-book-open'></i>",
    condition: () => true,
    callback:  target => {
      let actor;
      if (target instanceof HTMLElement) {
        // v13 canvas context menus pass the <li> element
        const el      = target;
        const tokenId = el.dataset?.documentId ?? el.dataset?.entryId;
        const token   = canvas.tokens?.placeables?.find(
          t => t.id === tokenId || t.document?.id === tokenId
        );
        actor = token?.actor;
      } else {
        // Token placeable object
        actor = target.actor ?? game.actors.get(target.document?.actorId);
      }
      if (actor) _openNoteForActor(actor);
      else console.warn("orichalum | Could not resolve actor from token context menu target:", target);
    },
  });
});

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Find or create a Character Item for the given actor, then open the
 * Orichalum window on that item with a new note editor.
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
async function _openNoteForActor(actor) {
  const data = await OrichalumStore.getData();
  let charFolder = (data.folders ?? []).find(f => f.name === "Characters");
  if (!charFolder) {
    charFolder = await OrichalumFolder.create("Characters");
  }
  const { item } = await OrichalumItem.create(
    charFolder.id,
    actor.name,
    ITEM_TYPE.CHARACTER
  );
  OrichalumApp.open({ itemId: item.id, newNote: true });
}
