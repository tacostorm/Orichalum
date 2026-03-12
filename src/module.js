/**
 * Orichalum — entry point.
 *
 * Registers settings, Handlebars helpers, hooks for:
 *   - toolbar button (getSceneControlButtons, v13 API)
 *   - data-store initialisation (ready)
 *   - live re-render on data changes (updateJournalEntryPage)
 *   - actor right-click integration (getActorContextOptions, getTokenContextOptions)
 *   - settings panel danger zone (renderSettingsConfig)
 */

import {
  MODULE_ID,
  DATA_STORE_FLAG,
  DEFAULT_FOLDERS,
  VISIBILITY,
  ITEM_TYPE,
} from "./constants.js";
import { OrichalumStore }  from "./data/OrichalumStore.js";
import { OrichalumItem }   from "./data/OrichalumItem.js";
import { OrichalumFolder } from "./data/OrichalumFolder.js";
import { OrichalumApp }    from "./ui/OrichalumApp.js";

// ── Init ──────────────────────────────────────────────────────────────────────

Hooks.once("init", () => {
  /** Client setting: pre-selected visibility when creating a new note. */
  game.settings.register(MODULE_ID, "defaultNoteVisibility", {
    name:   "NEXUSNOTES.Settings.DefaultNoteVisibility.Name",
    hint:   "NEXUSNOTES.Settings.DefaultNoteVisibility.Hint",
    scope:  "client",
    config: true,
    type:   String,
    choices: {
      [VISIBILITY.SECRET]: "NEXUSNOTES.Visibility.Secret",
      [VISIBILITY.PARTY]:  "NEXUSNOTES.Visibility.Party",
    },
    default: VISIBILITY.SECRET,
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

// ── Settings UI — inject Danger Zone ──────────────────────────────────────────

Hooks.on("renderSettingsConfig", (_app, html) => {
  if (!game.user.isGM) return;

  // Locate the section that contains our module's settings
  const anySetting = html.querySelector(`[data-setting-id^="${MODULE_ID}."]`);
  if (!anySetting) return;
  const section = anySetting.closest("section, fieldset") ?? anySetting.parentElement;
  if (!section) return;

  const zone = document.createElement("div");
  zone.className = "orichalum-danger-zone";
  zone.innerHTML = `
    <h3 class="danger-zone-title">
      <i class="fa-solid fa-triangle-exclamation"></i>
      ${game.i18n.localize("NEXUSNOTES.Settings.DangerZone.Title")}
    </h3>
    <p class="danger-zone-desc">${game.i18n.localize("NEXUSNOTES.Settings.DangerZone.Desc")}</p>
    <div class="danger-zone-buttons">
      <button type="button" class="danger-btn" data-action="reset-my">
        <i class="fa-solid fa-user-minus"></i>
        ${game.i18n.localize("NEXUSNOTES.Settings.DangerZone.ResetMy")}
      </button>
      <button type="button" class="danger-btn danger-btn--full" data-action="reset-world">
        <i class="fa-solid fa-skull"></i>
        ${game.i18n.localize("NEXUSNOTES.Settings.DangerZone.ResetWorld")}
      </button>
    </div>`;
  section.appendChild(zone);

  zone.querySelector("[data-action='reset-my']")?.addEventListener("click", _resetMyNotes);
  zone.querySelector("[data-action='reset-world']")?.addEventListener("click", _resetWorldData);
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
        const tokenId = target.dataset?.documentId ?? target.dataset?.entryId;
        const token   = canvas.tokens?.placeables?.find(
          t => t.id === tokenId || t.document?.id === tokenId
        );
        actor = token?.actor;
      } else {
        actor = target.actor ?? game.actors.get(target.document?.actorId);
      }
      if (actor) _openNoteForActor(actor);
      else console.warn("orichalum | Could not resolve actor from token context menu target:", target);
    },
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

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

/**
 * Trigger a browser download of the current Orichalum data as a JSON backup.
 * @param {object} data  The full data blob from OrichalumStore.getData().
 */
function _downloadBackup(data) {
  const json      = JSON.stringify(data, null, 2);
  const blob      = new Blob([json], { type: "application/json" });
  const url       = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const a         = document.createElement("a");
  a.href          = url;
  a.download      = `orichalum-backup-${timestamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Reset only the current user's notes (GM version: resets GM's own notes).
 * Downloads a backup first, then deletes notes authored by this user.
 */
async function _resetMyNotes() {
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window:  { title: game.i18n.localize("NEXUSNOTES.Settings.DangerZone.ResetMyTitle") },
    content: `<p>${game.i18n.localize("NEXUSNOTES.Settings.DangerZone.ResetMyContent")}</p>`,
  });
  if (!confirmed) return;

  const data = await OrichalumStore.getData();
  _downloadBackup(data);

  await OrichalumStore.mutate(d => {
    d.notes = (d.notes ?? []).filter(n => n.authorId !== game.user.id);
  });

  ui.notifications.info(game.i18n.localize("NEXUSNOTES.Settings.DangerZone.ResetSuccess"));
  if (OrichalumApp._instance?.rendered) OrichalumApp._instance.render();
}

/**
 * Full world reset — wipes ALL Orichalum data for all players.
 * Requires the GM to type "RESET" to confirm, then shows a final confirmation.
 * Downloads a backup first.
 */
async function _resetWorldData() {
  // Step 1: require typing "RESET"
  const typed = await foundry.applications.api.DialogV2.prompt({
    window:  { title: game.i18n.localize("NEXUSNOTES.Settings.DangerZone.ResetWorldTitle") },
    content: `
      <p>${game.i18n.localize("NEXUSNOTES.Settings.DangerZone.ResetWorldContent")}</p>
      <div class="form-group">
        <label>${game.i18n.localize("NEXUSNOTES.Settings.DangerZone.TypeReset")}</label>
        <input type="text" name="confirm" placeholder="RESET" autocomplete="off" />
      </div>`,
    ok: {
      label:    game.i18n.localize("NEXUSNOTES.Settings.DangerZone.ResetWorldBtn"),
      callback: (_event, button) => {
        const val = button.form?.elements?.confirm?.value ?? "";
        return val === "RESET" ? "RESET" : null;
      },
    },
  });
  if (typed !== "RESET") return;

  // Step 2: final are-you-sure confirmation
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window:  { title: game.i18n.localize("NEXUSNOTES.Settings.DangerZone.ResetWorldTitle") },
    content: `<p>${game.i18n.localize("NEXUSNOTES.Settings.DangerZone.ResetWorldFinal")}</p>`,
  });
  if (!confirmed) return;

  // Download backup then wipe
  const data = await OrichalumStore.getData();
  _downloadBackup(data);

  const defaultFolders = DEFAULT_FOLDERS.map((name, i) => ({
    id:   foundry.utils.randomID(),
    name,
    sort: i,
  }));
  await OrichalumStore.setData({ folders: defaultFolders, items: [], notes: [] });

  ui.notifications.info(game.i18n.localize("NEXUSNOTES.Settings.DangerZone.ResetSuccess"));
  if (OrichalumApp._instance?.rendered) OrichalumApp._instance.render();
}
