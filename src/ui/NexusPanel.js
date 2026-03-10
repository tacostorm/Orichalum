import { MODULE_ID, VISIBILITY } from "../constants.js";
import { NexusVault } from "../NexusVault.js";
import { NexusNoteCollection } from "../NexusNoteCollection.js";
import { filterVisible } from "../helpers/permissions.js";
import { searchNotes } from "../helpers/search.js";
import { resolveSubject } from "../helpers/subjectResolver.js";
import { NoteEditor } from "./NoteEditor.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The main Nexus Notes panel — a resizable, draggable ApplicationV2 window showing
 * My Notes, Party Notes, and (for GMs) an All Vaults tab switcher.
 * Open via `NexusPanel.open()`.
 */
export class NexusPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "nexus-panel",
    classes: ["orichalum", "nexus-panel"],
    window: {
      title: "NEXUSNOTES.Panel.Title",
      resizable: true,
    },
    position: { width: 380, height: 600, top: 80, left: 120 },
    actions: {
      newNote:    NexusPanel._onNewNote,
      editNote:   NexusPanel._onEditNote,
      deleteNote: NexusPanel._onDeleteNote,
      togglePin:  NexusPanel._onTogglePin,
      switchVault: NexusPanel._onSwitchVault,
    },
  };

  /** @override */
  static PARTS = {
    panel: {
      template: "modules/orichalum/templates/nexus-panel.hbs",
      scrollable: [".notes-list"],
    },
  };

  /** Singleton instance. */
  static _instance = null;

  constructor(options = {}) {
    super(options);
    this._searchQuery     = "";
    this._activeGmVaultId = null;
    this._myVault         = null;
  }

  /** @override */
  async _prepareContext(options) {
    this._myVault = await NexusVault.getOrCreateMine();

    // No GM online — vault cannot be created yet
    if (!this._myVault) {
      return {
        noGM: true,
        myNotes: [],
        partyNotes: [],
        gmVaults: [],
        isGM: game.user.isGM,
        searchQuery: this._searchQuery,
      };
    }

    // ── My Notes ──────────────────────────────────────────────────────────────
    const myNotesRaw = await NexusNoteCollection.getAll(this._myVault);
    const myVisible  = filterVisible(myNotesRaw, game.user, game.user);
    const mySearched = searchNotes(myVisible, this._searchQuery);
    const myNotes    = mySearched
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt);

    for (const note of myNotes) {
      note._subject = note.subjectRefs?.[0] ? await resolveSubject(note.subjectRefs[0]) : null;
    }

    // ── Party Notes (other players' vaults) ───────────────────────────────────
    const partyNotes = [];
    const allVaults  = await NexusVault.getAllVisible();
    const otherVaults = allVaults.filter(
      v => v.getFlag(MODULE_ID, "ownerId") !== game.user.id
    );

    for (const vault of otherVaults) {
      const ownerId = vault.getFlag(MODULE_ID, "ownerId");
      const author  = game.users.get(ownerId);
      const raw     = await NexusNoteCollection.getAll(vault);
      const visible = filterVisible(raw, game.user, author);
      const party   = visible.filter(n => n.visibility === VISIBILITY.PARTY);
      const searched = searchNotes(party, this._searchQuery);

      for (const note of searched) {
        note._authorName = author?.name ?? game.i18n.localize("NEXUSNOTES.Panel.UnknownAuthor");
        note._vaultId    = vault.id;
        note._subject    = note.subjectRefs?.[0] ? await resolveSubject(note.subjectRefs[0]) : null;
        partyNotes.push(note);
      }
    }
    partyNotes.sort((a, b) => b.updatedAt - a.updatedAt);

    // ── GM All Vaults ─────────────────────────────────────────────────────────
    let gmVaults = [];
    if (game.user.isGM) {
      this._activeGmVaultId ??= this._myVault.id;
      const all = await NexusVault.getAllVisible();

      for (const vault of all) {
        const ownerId = vault.getFlag(MODULE_ID, "ownerId");
        const author  = game.users.get(ownerId);
        const raw     = await NexusNoteCollection.getAll(vault);
        const visible = filterVisible(raw, game.user, author);
        const searched = searchNotes(visible, this._searchQuery)
          .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt);

        for (const note of searched) {
          note._authorName = author?.name ?? game.i18n.localize("NEXUSNOTES.Panel.UnknownAuthor");
          note._vaultId    = vault.id;
          note._subject    = note.subjectRefs?.[0] ? await resolveSubject(note.subjectRefs[0]) : null;
        }

        gmVaults.push({
          id:     vault.id,
          name:   author?.name ?? vault.name,
          notes:  searched,
          active: vault.id === this._activeGmVaultId,
        });
      }
    }

    return {
      noGM: false,
      myNotes,
      myVaultId: this._myVault.id,
      partyNotes,
      gmVaults,
      isGM: game.user.isGM,
      searchQuery: this._searchQuery,
    };
  }

  /** @override */
  _onRender(context, options) {
    const searchInput = this.element.querySelector(".nexus-search");
    if (searchInput) {
      searchInput.value = this._searchQuery;
      searchInput.addEventListener("input", e => {
        this._searchQuery = e.target.value;
        this.render();
      });
    }
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  /**
   * Open NoteEditor to create a new note in the given vault.
   * @param {PointerEvent} event
   * @param {HTMLElement}  target
   */
  static async _onNewNote(event, target) {
    const vault = game.journal.get(target.dataset.vaultId);
    if (!vault) return;
    const saved = await NoteEditor.open(vault, null);
    if (saved) this.render();
  }

  /**
   * Open NoteEditor to edit an existing note.
   * @param {PointerEvent} event
   * @param {HTMLElement}  target
   */
  static async _onEditNote(event, target) {
    const { vaultId, noteId } = target.dataset;
    const vault = game.journal.get(vaultId);
    if (!vault) return;
    const notes = await NexusNoteCollection.getAll(vault);
    const note  = notes.find(n => n.id === noteId);
    if (!note) return;
    const saved = await NoteEditor.open(vault, note);
    if (saved) this.render();
  }

  /**
   * Confirm and delete a note.
   * @param {PointerEvent} event
   * @param {HTMLElement}  target
   */
  static async _onDeleteNote(event, target) {
    const { vaultId, noteId } = target.dataset;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("NEXUSNOTES.Confirm.DeleteTitle") },
      content: `<p>${game.i18n.localize("NEXUSNOTES.Confirm.DeleteContent")}</p>`,
    });
    if (!confirmed) return;
    const vault = game.journal.get(vaultId);
    if (!vault) return;
    await NexusNoteCollection.delete(vault, noteId);
    this.render();
  }

  /**
   * Toggle the pinned state of a note.
   * @param {PointerEvent} event
   * @param {HTMLElement}  target
   */
  static async _onTogglePin(event, target) {
    const { vaultId, noteId } = target.dataset;
    const vault = game.journal.get(vaultId);
    if (!vault) return;
    const notes = await NexusNoteCollection.getAll(vault);
    const note  = notes.find(n => n.id === noteId);
    if (!note) return;
    await NexusNoteCollection.update(vault, noteId, { pinned: !note.pinned });
    this.render();
  }

  /**
   * Switch the active vault tab in the GM All Vaults section.
   * @param {PointerEvent} event
   * @param {HTMLElement}  target
   */
  static async _onSwitchVault(event, target) {
    this._activeGmVaultId = target.dataset.vaultId;
    this.render();
  }

  // ── Static API ───────────────────────────────────────────────────────────────

  /**
   * Open the Nexus Panel, or bring the existing instance to the front.
   * @returns {NexusPanel}
   */
  static open() {
    if (!NexusPanel._instance) {
      NexusPanel._instance = new NexusPanel();
    }
    NexusPanel._instance.render({ force: true });
    return NexusPanel._instance;
  }
}
