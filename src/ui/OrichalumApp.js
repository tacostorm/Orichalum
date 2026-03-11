/**
 * OrichalumApp — the main Orichalum window.
 *
 * Two-pane layout: left navigation (folders + items) and right content
 * (item viewing pane with inline note editor, or graph placeholder).
 *
 * Open via OrichalumApp.open().
 */

import { MODULE_ID, VISIBILITY, PRIVATE_VISIBILITY_MODE, ITEM_TYPE } from "../constants.js";
import { OrichalumStore }  from "../data/OrichalumStore.js";
import { OrichalumFolder } from "../data/OrichalumFolder.js";
import { OrichalumItem }   from "../data/OrichalumItem.js";
import { OrichalumNote }   from "../data/OrichalumNote.js";
import { canSeeNote, canEditNote, filterVisibleNotes } from "../helpers/visibility.js";
import { renderWikiLinks }  from "../helpers/wikilinks.js";
import { computeLinksTo }   from "../helpers/linksTo.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class OrichalumApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "orichalum-app",
    classes: ["orichalum"],
    window: {
      title:     "NEXUSNOTES.App.Title",
      resizable: true,
    },
    position: { width: 780, height: 620, top: 60, left: 100 },
  };

  /** @override */
  static PARTS = {
    app: {
      template: "modules/orichalum/templates/orichalum-app.hbs",
    },
  };

  /** Singleton instance. @type {OrichalumApp|null} */
  static _instance = null;

  constructor(options = {}) {
    super(options);
    /** @type {string|null} Currently selected item id. */
    this._selectedItemId  = null;
    /** @type {string|null} Note being edited ("new" or an existing note id). */
    this._editingNoteId   = null;
    /** @type {string} Draft content of the note being edited. */
    this._draftContent    = "";
    /** @type {string} Draft visibility of the note being edited. */
    this._draftVisibility = game.settings.get(MODULE_ID, "defaultNoteVisibility") ?? VISIBILITY.PRIVATE;
    /** @type {boolean} Whether edit mode has unsaved changes. */
    this._dirty           = false;
    /** @type {boolean} Whether the graph view is active. */
    this._graphMode       = false;
    /** @type {Set<string>} Folders collapsed in the nav. */
    this._collapsed       = new Set();
  }

  // ── Context preparation ─────────────────────────────────────────────────────

  /** @override */
  async _prepareContext(options) {
    // Sync live editor content into draft state before the DOM is replaced
    this._syncEditorBeforeRender();

    const data     = await OrichalumStore.getData();
    const viewer   = game.user;
    const allItems = data.items ?? [];
    const allNotes = data.notes ?? [];
    const folders  = (data.folders ?? []).slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

    // ── Build nav folder tree ──────────────────────────────────────────────
    const navFolders = folders.map(folder => {
      const folderItems = allItems
        .filter(i => i.folderId === folder.id)
        .filter(item => {
          const notes = allNotes.filter(n => n.itemId === item.id);
          if (notes.length === 0) return item.id === this._selectedItemId; // show just-created item
          return notes.some(n => canSeeNote(n, viewer));
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      return {
        ...folder,
        items:     folderItems,
        collapsed: this._collapsed.has(folder.id),
        canAdmin:  viewer.isGM,
      };
    });

    // ── Selected item + notes ─────────────────────────────────────────────
    let selectedItem     = null;
    let itemNotes        = [];
    let linksTo          = [];
    let characterFields  = null;

    if (this._selectedItemId && !this._graphMode) {
      selectedItem = allItems.find(i => i.id === this._selectedItemId) ?? null;

      if (selectedItem) {
        const raw     = allNotes.filter(n => n.itemId === selectedItem.id);
        const visible = filterVisibleNotes(raw, viewer);

        itemNotes = visible
          .sort((a, b) => b.createdAt - a.createdAt)
          .map(note => {
            const isEditing = (note.id === this._editingNoteId);
            const openTableWarning = !viewer.isGM
              && note.authorId === viewer.id
              && note.visibility === VISIBILITY.PRIVATE
              && game.settings.get(MODULE_ID, "playerPrivateVisibility") === PRIVATE_VISIBILITY_MODE.OPEN_TABLE;

            return {
              ...note,
              authorDisplay: note.authorName ?? game.users.get(note.authorId)?.name ?? "?",
              relativeTime:  _relativeTime(note.createdAt),
              isEditing,
              canEdit:       canEditNote(note, viewer) && !isEditing,
              canDelete:     canEditNote(note, viewer),
              openTableWarning,
              renderedContent: isEditing
                ? (this._draftContent)
                : renderWikiLinks(note.content ?? "", allItems),
              draftContent:    isEditing ? this._draftContent    : "",
              draftVisibility: isEditing ? this._draftVisibility : note.visibility,
            };
          });

        linksTo = computeLinksTo(selectedItem, allNotes, allItems, viewer);

        if (selectedItem.type === ITEM_TYPE.CHARACTER) {
          characterFields = _prepareCharacterFields(selectedItem.characterFields ?? {}, allItems);
        }
      }
    }

    // New note slot (appended at top of itemNotes list in template)
    const newNoteSlot = this._editingNoteId === "new" ? {
      id:              "new",
      isNew:           true,
      isEditing:       true,
      draftContent:    this._draftContent,
      draftVisibility: this._draftVisibility,
      openTableWarning: !viewer.isGM
        && this._draftVisibility === VISIBILITY.PRIVATE
        && game.settings.get(MODULE_ID, "playerPrivateVisibility") === PRIVATE_VISIBILITY_MODE.OPEN_TABLE,
    } : null;

    return {
      navFolders,
      selectedItem,
      itemNotes,
      newNoteSlot,
      linksTo,
      characterFields,
      isCharacterItem: selectedItem?.type === ITEM_TYPE.CHARACTER,
      selectedItemId: this._selectedItemId,
      isGM:           viewer.isGM,
      graphMode:      this._graphMode,
      dirty:          this._dirty,
      isEditingAny:   this._editingNoteId !== null,
      visibilityOptions: [
        { value: VISIBILITY.PRIVATE, label: game.i18n.localize("NEXUSNOTES.Visibility.Private") },
        { value: VISIBILITY.PARTY,   label: game.i18n.localize("NEXUSNOTES.Visibility.Party")   },
      ],
    };
  }

  // ── Render hooks ──────────────────────────────────────────────────────────

  /** @override */
  _onRender(context, options) {
    this._setupNavEvents();
    this._setupContentEvents();
    this._setupEditorToolbar();
    this._restoreEditorState();
    this._setupContextMenus();
  }

  // ── Nav events ─────────────────────────────────────────────────────────────

  /** Wire folder-tree nav interactions. @private */
  _setupNavEvents() {
    const nav = this.element.querySelector(".orichalum-nav");
    if (!nav) return;

    // Toggle folder collapse
    nav.querySelectorAll(".folder-toggle").forEach(btn => {
      btn.addEventListener("click", e => {
        const folderId = btn.closest("[data-folder-id]").dataset.folderId;
        this._collapsed.has(folderId)
          ? this._collapsed.delete(folderId)
          : this._collapsed.add(folderId);
        this.render();
      });
    });

    // Select item
    nav.querySelectorAll(".nav-item[data-item-id]").forEach(el => {
      el.addEventListener("click", async () => {
        if (!await this._confirmLeaveEdit()) return;
        this._selectedItemId  = el.dataset.itemId;
        this._editingNoteId   = null;
        this._dirty           = false;
        this.render();
      });
    });

    // New item button per folder
    nav.querySelectorAll(".btn-new-item[data-folder-id]").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.stopPropagation();
        if (!await this._confirmLeaveEdit()) return;
        await this._promptNewItem(btn.dataset.folderId);
      });
    });

    // New folder button
    const btnNewFolder = nav.querySelector(".btn-new-folder");
    if (btnNewFolder) {
      btnNewFolder.addEventListener("click", () => this._promptNewFolder());
    }
  }

  // ── Content / note events ─────────────────────────────────────────────────

  /** Wire item-pane interactions. @private */
  _setupContentEvents() {
    const content = this.element.querySelector(".orichalum-content");
    if (!content) return;

    // Graph toggle
    const graphBtn = this.element.querySelector(".btn-graph-toggle");
    if (graphBtn) {
      graphBtn.addEventListener("click", () => {
        this._graphMode = !this._graphMode;
        this.render();
      });
    }

    // Add note
    content.querySelector(".btn-add-note")?.addEventListener("click", () => {
      this._editingNoteId   = "new";
      this._draftContent    = "";
      this._draftVisibility = game.settings.get(MODULE_ID, "defaultNoteVisibility") ?? VISIBILITY.PRIVATE;
      this._dirty           = false;
      this.render();
    });

    // Edit note
    content.querySelectorAll(".btn-edit-note[data-note-id]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const note = await OrichalumNote.getById(btn.dataset.noteId);
        if (!note) return;
        this._editingNoteId   = note.id;
        this._draftContent    = note.content ?? "";
        this._draftVisibility = note.visibility;
        this._dirty           = false;
        this.render();
      });
    });

    // Cancel edit
    content.querySelectorAll(".btn-cancel-edit").forEach(btn => {
      btn.addEventListener("click", () => {
        this._editingNoteId = null;
        this._dirty         = false;
        this.render();
      });
    });

    // Save note (button)
    content.querySelectorAll(".btn-save-note").forEach(btn => {
      btn.addEventListener("click", () => this._saveCurrentNote());
    });

    // Delete note
    content.querySelectorAll(".btn-delete-note[data-note-id]").forEach(btn => {
      btn.addEventListener("click", () => this._deleteNote(btn.dataset.noteId));
    });

    // Visibility dropdown change
    content.querySelectorAll(".note-visibility-select").forEach(sel => {
      sel.addEventListener("change", e => {
        this._draftVisibility = e.target.value;
        this._dirty           = true;
        // Re-render to toggle the openTable warning
        this._syncEditorBeforeRender();
        this.render();
      });
    });

    // Wiki-link clicks
    content.addEventListener("click", async e => {
      const link = e.target.closest(".orichalum-wikilink");
      if (!link) return;
      const name = link.dataset.wikilink;
      await this._handleWikiLinkClick(name);
    });

    // Character fields edit toggle
    content.querySelector(".btn-edit-fields")?.addEventListener("click", () => {
      this.element.querySelector(".char-fields-view")?.classList.add("hidden");
      this.element.querySelector(".char-fields-edit")?.classList.remove("hidden");
    });

    content.querySelector(".btn-save-fields")?.addEventListener("click", async () => {
      await this._saveCharacterFields();
    });

    content.querySelector(".btn-cancel-fields")?.addEventListener("click", () => {
      this.element.querySelector(".char-fields-view")?.classList.remove("hidden");
      this.element.querySelector(".char-fields-edit")?.classList.add("hidden");
    });
  }

  // ── Editor toolbar ────────────────────────────────────────────────────────

  /** Wire execCommand toolbar buttons. @private */
  _setupEditorToolbar() {
    const toolbar = this.element.querySelector(".editor-toolbar");
    if (!toolbar) return;

    toolbar.querySelectorAll("[data-cmd]").forEach(btn => {
      btn.addEventListener("mousedown", e => {
        e.preventDefault(); // prevent editor losing focus
        const cmd  = btn.dataset.cmd;
        const val  = btn.dataset.val ?? null;
        document.execCommand(cmd, false, val);
        this._markDirty();
      });
    });
  }

  /** Restore the draft content into the contenteditable after re-render. @private */
  _restoreEditorState() {
    const editor = this.element.querySelector(".note-editor-body[contenteditable]");
    if (!editor) return;

    // Set inner HTML from draft (already set as data attribute via template)
    if (editor.dataset.draft !== undefined) {
      editor.innerHTML = editor.dataset.draft;
    }

    editor.addEventListener("input", () => this._markDirty());

    // Ctrl+S saves
    editor.addEventListener("keydown", e => {
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        this._saveCurrentNote();
      }
    });

    // Focus the editor for new notes
    if (this._editingNoteId === "new") {
      editor.focus();
    }
  }

  // ── Context menus ─────────────────────────────────────────────────────────

  /** Attach right-click context menus to folder and item elements. @private */
  _setupContextMenus() {
    const nav = this.element.querySelector(".orichalum-nav");
    if (!nav) return;

    // Folder context menus (GM only actions)
    nav.querySelectorAll("[data-folder-id]").forEach(el => {
      el.addEventListener("contextmenu", e => {
        e.preventDefault();
        e.stopPropagation();
        const folderId = el.closest("[data-folder-id]").dataset.folderId;
        this._showFolderMenu(e, folderId);
      });
    });

    // Item context menus
    nav.querySelectorAll(".nav-item[data-item-id]").forEach(el => {
      el.addEventListener("contextmenu", e => {
        e.preventDefault();
        e.stopPropagation();
        this._showItemMenu(e, el.dataset.itemId);
      });
    });

    // Note right-click menu in content pane
    this.element.querySelectorAll(".note-card[data-note-id]").forEach(el => {
      el.addEventListener("contextmenu", e => {
        e.preventDefault();
        e.stopPropagation();
        this._showNoteMenu(e, el.dataset.noteId);
      });
    });
  }

  /**
   * Show folder context menu.
   * @param {MouseEvent} event
   * @param {string}     folderId
   * @private
   */
  _showFolderMenu(event, folderId) {
    if (!game.user.isGM) return;
    this._showContextMenu(event, [
      {
        label: game.i18n.localize("NEXUSNOTES.Context.Rename"),
        icon:  "fa-solid fa-pen",
        action: () => this._promptRenameFolder(folderId),
      },
      {
        label: game.i18n.localize("NEXUSNOTES.Context.Delete"),
        icon:  "fa-solid fa-trash",
        action: () => this._confirmDeleteFolder(folderId),
      },
    ]);
  }

  /**
   * Show item context menu.
   * @param {MouseEvent} event
   * @param {string}     itemId
   * @private
   */
  _showItemMenu(event, itemId) {
    const items = [];
    items.push({
      label:  game.i18n.localize("NEXUSNOTES.Context.Rename"),
      icon:   "fa-solid fa-pen",
      action: () => this._promptRenameItem(itemId),
    });
    items.push({
      label:  game.i18n.localize("NEXUSNOTES.Context.MoveToFolder"),
      icon:   "fa-solid fa-folder-open",
      action: () => this._promptMoveItem(itemId),
    });
    if (game.user.isGM) {
      items.push({
        label:  game.i18n.localize("NEXUSNOTES.Context.Delete"),
        icon:   "fa-solid fa-trash",
        action: () => this._confirmDeleteItem(itemId),
      });
    }
    this._showContextMenu(event, items);
  }

  /**
   * Show note context menu.
   * @param {MouseEvent} event
   * @param {string}     noteId
   * @private
   */
  async _showNoteMenu(event, noteId) {
    const note = await OrichalumNote.getById(noteId);
    if (!note) return;
    if (!canEditNote(note, game.user)) return;

    const items = [
      {
        label:  game.i18n.localize("NEXUSNOTES.Context.EditNote"),
        icon:   "fa-solid fa-pen",
        action: async () => {
          this._editingNoteId   = note.id;
          this._draftContent    = note.content ?? "";
          this._draftVisibility = note.visibility;
          this._dirty           = false;
          this.render();
        },
      },
      {
        label:  game.i18n.localize("NEXUSNOTES.Context.DeleteNote"),
        icon:   "fa-solid fa-trash",
        action: () => this._deleteNote(noteId),
      },
    ];
    this._showContextMenu(event, items);
  }

  /**
   * Render a lightweight custom context menu at the cursor position.
   * @param {MouseEvent} event
   * @param {{label:string, icon:string, action:Function}[]} menuItems
   * @private
   */
  _showContextMenu(event, menuItems) {
    // Remove any existing context menu
    document.querySelector(".orichalum-context-menu")?.remove();

    const menu = document.createElement("div");
    menu.className = "orichalum-context-menu";
    menu.style.cssText = `position:fixed;left:${event.clientX}px;top:${event.clientY}px;z-index:9999`;

    for (const item of menuItems) {
      const li = document.createElement("a");
      li.innerHTML = `<i class="${item.icon}"></i> ${item.label}`;
      li.addEventListener("click", () => {
        menu.remove();
        item.action();
      });
      menu.appendChild(li);
    }

    document.body.appendChild(menu);

    const cleanup = e => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener("mousedown", cleanup);
      }
    };
    document.addEventListener("mousedown", cleanup);
  }

  // ── Save / edit helpers ──────────────────────────────────────────────────

  /** Mark that the current editor has unsaved changes. @private */
  _markDirty() {
    this._dirty = true;
  }

  /**
   * Sync editor state from DOM into instance vars before a re-render.
   * Called whenever we need to re-render while the editor is open.
   * @private
   */
  _syncEditorBeforeRender() {
    const editor = this.element?.querySelector(".note-editor-body[contenteditable]");
    if (editor) {
      this._draftContent = editor.innerHTML;
    }
  }

  /**
   * Save the note currently being edited.
   * @private
   */
  async _saveCurrentNote() {
    const editor = this.element?.querySelector(".note-editor-body[contenteditable]");
    if (editor) this._draftContent = editor.innerHTML;

    const content    = this._draftContent;
    const visibility = this._draftVisibility;

    if (this._editingNoteId === "new") {
      if (!this._selectedItemId) return;
      await OrichalumNote.create(this._selectedItemId, { content, visibility });
    } else {
      await OrichalumNote.update(this._editingNoteId, { content, visibility });
    }

    this._editingNoteId = null;
    this._dirty         = false;
    this.render();
  }

  /**
   * Confirm and delete a note.
   * @param {string} noteId
   * @private
   */
  async _deleteNote(noteId) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window:  { title: game.i18n.localize("NEXUSNOTES.Confirm.DeleteNoteTitle") },
      content: `<p>${game.i18n.localize("NEXUSNOTES.Confirm.DeleteNoteContent")}</p>`,
    });
    if (!confirmed) return;
    if (this._editingNoteId === noteId) {
      this._editingNoteId = null;
      this._dirty         = false;
    }
    await OrichalumNote.delete(noteId);
    this.render();
  }

  /**
   * Show an unsaved-changes confirmation if the editor is dirty.
   * @returns {Promise<boolean>} true = safe to proceed
   * @private
   */
  async _confirmLeaveEdit() {
    if (!this._dirty) return true;
    const leave = await foundry.applications.api.DialogV2.confirm({
      window:  { title: game.i18n.localize("NEXUSNOTES.Confirm.UnsavedTitle") },
      content: `<p>${game.i18n.localize("NEXUSNOTES.Confirm.UnsavedContent")}</p>`,
    });
    if (leave) {
      this._editingNoteId = null;
      this._dirty         = false;
    }
    return leave;
  }

  /** @override */
  async close(options = {}) {
    if (!options.force && this._dirty) {
      const leave = await foundry.applications.api.DialogV2.confirm({
        window:  { title: game.i18n.localize("NEXUSNOTES.Confirm.UnsavedTitle") },
        content: `<p>${game.i18n.localize("NEXUSNOTES.Confirm.UnsavedContent")}</p>`,
      });
      if (!leave) return;
    }
    return super.close(options);
  }

  // ── Character fields ───────────────────────────────────────────────────────

  /** Read form fields and persist character fields. @private */
  async _saveCharacterFields() {
    if (!this._selectedItemId) return;
    const form = this.element.querySelector(".char-fields-form");
    if (!form) return;

    const knownAccomplices = (form.querySelector("[name=knownAccomplices]")?.value ?? "")
      .split(",").map(s => s.trim()).filter(Boolean);
    const enemies = (form.querySelector("[name=enemies]")?.value ?? "")
      .split(",").map(s => s.trim()).filter(Boolean);

    const fields = {
      race:              form.querySelector("[name=race]")?.value       ?? "",
      home:              form.querySelector("[name=home]")?.value       ?? "",
      occupation:        form.querySelector("[name=occupation]")?.value ?? "",
      faction:           form.querySelector("[name=faction]")?.value    ?? "",
      lastSeen:          form.querySelector("[name=lastSeen]")?.value   ?? "",
      knownAccomplices,
      enemies,
    };

    await OrichalumItem.updateCharacterFields(this._selectedItemId, fields);
    this.render();
  }

  // ── Wiki-link click handler ─────────────────────────────────────────────

  /**
   * Open the linked item, creating a stub in Misc if it doesn't exist.
   * @param {string} name  The raw target name from the [[link]].
   * @private
   */
  async _handleWikiLinkClick(name) {
    let item = await OrichalumItem.getByName(name);

    if (!item) {
      // Find or create the Misc folder
      const data = await OrichalumStore.getData();
      let miscFolder = (data.folders ?? []).find(f => f.name.toLowerCase() === "misc");
      if (!miscFolder) {
        miscFolder = await OrichalumFolder.create("Misc");
      }
      const result = await OrichalumItem.create(miscFolder.id, name);
      item = result.item;
    }

    this._selectedItemId = item.id;
    this._editingNoteId  = null;
    this._dirty          = false;
    this.render();
  }

  // ── Prompt helpers ─────────────────────────────────────────────────────────

  /** @private */
  async _promptNewFolder() {
    const name = await _promptText(
      game.i18n.localize("NEXUSNOTES.Prompt.NewFolderTitle"),
      game.i18n.localize("NEXUSNOTES.Prompt.NewFolderLabel"),
    );
    if (!name) return;
    await OrichalumFolder.create(name);
    this.render();
  }

  /**
   * @param {string} folderId
   * @private
   */
  async _promptNewItem(folderId) {
    const name = await _promptText(
      game.i18n.localize("NEXUSNOTES.Prompt.NewItemTitle"),
      game.i18n.localize("NEXUSNOTES.Prompt.NewItemLabel"),
    );
    if (!name) return;

    const folder = await OrichalumFolder.getById(folderId);
    const isCharFolder = folder?.name === "Characters";
    const type = isCharFolder ? ITEM_TYPE.CHARACTER : ITEM_TYPE.STANDARD;

    const { item } = await OrichalumItem.create(folderId, name, type);
    this._selectedItemId = item.id;
    // Immediately open a new note
    this._editingNoteId   = "new";
    this._draftContent    = "";
    this._draftVisibility = game.settings.get(MODULE_ID, "defaultNoteVisibility") ?? VISIBILITY.PRIVATE;
    this._dirty           = false;
    this.render();
  }

  /** @private */
  async _promptRenameFolder(folderId) {
    const folder = await OrichalumFolder.getById(folderId);
    if (!folder) return;
    const name = await _promptText(
      game.i18n.localize("NEXUSNOTES.Prompt.RenameFolderTitle"),
      game.i18n.localize("NEXUSNOTES.Prompt.RenameFolderLabel"),
      folder.name,
    );
    if (!name || name === folder.name) return;
    await OrichalumFolder.rename(folderId, name);
    this.render();
  }

  /** @private */
  async _confirmDeleteFolder(folderId) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window:  { title: game.i18n.localize("NEXUSNOTES.Confirm.DeleteFolderTitle") },
      content: `<p>${game.i18n.localize("NEXUSNOTES.Confirm.DeleteFolderContent")}</p>`,
    });
    if (!confirmed) return;
    if (this._selectedItemId) {
      const data = await OrichalumStore.getData();
      const item = (data.items ?? []).find(i => i.id === this._selectedItemId);
      if (item?.folderId === folderId) {
        this._selectedItemId = null;
        this._editingNoteId  = null;
        this._dirty          = false;
      }
    }
    await OrichalumFolder.deleteWithContents(folderId);
    this.render();
  }

  /** @private */
  async _promptRenameItem(itemId) {
    const item = await OrichalumItem.getById(itemId);
    if (!item) return;
    const name = await _promptText(
      game.i18n.localize("NEXUSNOTES.Prompt.RenameItemTitle"),
      game.i18n.localize("NEXUSNOTES.Prompt.RenameItemLabel"),
      item.name,
    );
    if (!name || name === item.name) return;
    await OrichalumItem.rename(itemId, name);
    this.render();
  }

  /** @private */
  async _promptMoveItem(itemId) {
    const folders = await OrichalumFolder.getAll();
    const options = folders
      .map(f => `<option value="${f.id}">${f.name}</option>`)
      .join("");

    const dialogContent = `
      <div class="form-group">
        <label>${game.i18n.localize("NEXUSNOTES.Prompt.MoveItemLabel")}</label>
        <select name="folderId">${options}</select>
      </div>`;

    const result = await foundry.applications.api.DialogV2.prompt({
      window:  { title: game.i18n.localize("NEXUSNOTES.Prompt.MoveItemTitle") },
      content: dialogContent,
      ok: {
        label:    game.i18n.localize("NEXUSNOTES.Action.Move"),
        callback: (event, button, dialog) => {
          const sel = button.form?.elements?.folderId ?? dialog.querySelector("[name=folderId]");
          return sel?.value ?? null;
        },
      },
    });
    if (!result) return;
    await OrichalumItem.move(itemId, result);
    this.render();
  }

  /** @private */
  async _confirmDeleteItem(itemId) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window:  { title: game.i18n.localize("NEXUSNOTES.Confirm.DeleteItemTitle") },
      content: `<p>${game.i18n.localize("NEXUSNOTES.Confirm.DeleteItemContent")}</p>`,
    });
    if (!confirmed) return;
    if (this._selectedItemId === itemId) {
      this._selectedItemId = null;
      this._editingNoteId  = null;
      this._dirty          = false;
    }
    await OrichalumItem.deleteWithNotes(itemId);
    this.render();
  }

  // ── Static API ─────────────────────────────────────────────────────────────

  /**
   * Open the Orichalum window, or bring the existing instance to the front.
   * @param {object} [options]
   * @param {string} [options.itemId]       Pre-select an item.
   * @param {boolean} [options.newNote]     Immediately open a new note editor.
   * @returns {OrichalumApp}
   */
  static open({ itemId = null, newNote = false } = {}) {
    if (!OrichalumApp._instance) {
      OrichalumApp._instance = new OrichalumApp();
    }
    const app = OrichalumApp._instance;

    if (itemId) {
      app._selectedItemId = itemId;
      if (newNote) {
        app._editingNoteId   = "new";
        app._draftContent    = "";
        app._draftVisibility = game.settings.get(MODULE_ID, "defaultNoteVisibility") ?? VISIBILITY.PRIVATE;
        app._dirty           = false;
      }
    }

    app.render({ force: true });
    return app;
  }
}

// ── Module-private helpers ───────────────────────────────────────────────────

/**
 * Return a human-readable relative timestamp string.
 * @param {number} ts  Unix milliseconds.
 * @returns {string}
 */
function _relativeTime(ts) {
  const diff = Date.now() - ts;
  const min  = Math.floor(diff / 60_000);
  if (min <  1) return "just now";
  if (min <  60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr  < 24) return `${hr}h ago`;
  return new Date(ts).toLocaleDateString();
}

/**
 * Build the character fields view-mode data with link resolution.
 * @param {object}   cf        Raw character fields object.
 * @param {object[]} allItems  All items (for resolving link existence).
 * @returns {object[]}         Array of { label, values: [{text, isLink}] }
 */
function _prepareCharacterFields(cf, allItems) {
  const itemNames = new Set(allItems.map(i => i.name.toLowerCase()));
  const link = v => ({ text: v, isLink: itemNames.has(v.toLowerCase()) });

  return [
    { key: "race",              label: "NEXUSNOTES.CharField.Race",              values: cf.race       ? [link(cf.race)]       : [] },
    { key: "home",              label: "NEXUSNOTES.CharField.Home",              values: cf.home       ? [link(cf.home)]       : [] },
    { key: "occupation",        label: "NEXUSNOTES.CharField.Occupation",        values: cf.occupation ? [link(cf.occupation)] : [] },
    { key: "faction",           label: "NEXUSNOTES.CharField.Faction",           values: cf.faction    ? [link(cf.faction)]    : [] },
    { key: "lastSeen",          label: "NEXUSNOTES.CharField.LastSeen",          values: cf.lastSeen   ? [link(cf.lastSeen)]   : [] },
    { key: "knownAccomplices",  label: "NEXUSNOTES.CharField.KnownAccomplices",  values: (cf.knownAccomplices ?? []).map(link) },
    { key: "enemies",           label: "NEXUSNOTES.CharField.Enemies",           values: (cf.enemies ?? []).map(link)          },
  ].filter(f => f.values.length > 0);
}

/**
 * Show a simple DialogV2 prompt with a single text input.
 * @param {string} title
 * @param {string} label
 * @param {string} [defaultValue]
 * @returns {Promise<string|null>}
 */
async function _promptText(title, label, defaultValue = "") {
  return foundry.applications.api.DialogV2.prompt({
    window:  { title },
    content: `<div class="form-group">
      <label>${label}</label>
      <input type="text" name="value" value="${defaultValue}" autofocus />
    </div>`,
    ok: {
      label:    game.i18n.localize("NEXUSNOTES.Action.Confirm"),
      callback: (event, button, dialog) => {
        const input = button.form?.elements?.value ?? dialog.querySelector("input[name=value]");
        return input?.value?.trim() ?? null;
      },
    },
  });
}
