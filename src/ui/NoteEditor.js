import { MODULE_ID, VISIBILITY, SUBJECT_TYPES, DEFAULT_COLORS } from "../constants.js";
import { NexusNoteCollection } from "../NexusNoteCollection.js";
import { createNote } from "../NexusNote.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Modal ApplicationV2 dialog for creating and editing a single NexusNote.
 * Opened via `NoteEditor.open(vault, note?)`.
 */
export class NoteEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "nexus-note-editor",
    tag: "dialog",
    classes: ["nexus-notes", "note-editor"],
    window: {
      title: "NEXUSNOTES.NoteEditor.TitleNew",
      resizable: false,
    },
    position: { width: 480, height: "auto" },
    actions: {
      save:   NoteEditor._onSave,
      cancel: NoteEditor._onCancel,
    },
  };

  /** @override */
  static PARTS = {
    form: { template: "modules/nexus-notes/templates/note-editor.hbs" },
  };

  /**
   * @param {object}              options
   * @param {JournalEntry}        options.vault    - The vault to save to.
   * @param {NexusNote|null}      options.note     - Existing note to edit, or null to create.
   * @param {Function|null}       options.resolve  - Promise resolver called on close.
   */
  constructor(options = {}) {
    super(options);
    this._vault   = options.vault;
    this._note    = options.note ?? null;
    this._resolve = options.resolve ?? null;
  }

  /** @override */
  get title() {
    return this._note
      ? game.i18n.localize("NEXUSNOTES.NoteEditor.TitleEdit")
      : game.i18n.localize("NEXUSNOTES.NoteEditor.TitleNew");
  }

  /** @override */
  async _prepareContext(options) {
    const isGM = game.user.isGM;
    const defaultVis = game.settings.get(MODULE_ID, "defaultVisibility");
    const note = this._note ?? {
      title: "", content: "", visibility: defaultVis,
      tags: [], subjectRefs: [], pinned: false,
    };

    const currentSubjectType = note.subjectRefs?.[0]?.type ?? SUBJECT_TYPES.NONE;
    const currentSubjectId   = note.subjectRefs?.[0]?.documentId ?? "";
    const currentSubjectLabel = note.subjectRefs?.[0]?.label ?? "";

    const docTypes = [SUBJECT_TYPES.ACTOR, SUBJECT_TYPES.SCENE, SUBJECT_TYPES.JOURNAL_ENTRY];

    return {
      note,
      isNew: !this._note,
      isGM,
      visibilityOptions: [
        { value: VISIBILITY.PRIVATE, label: game.i18n.localize("NEXUSNOTES.Visibility.Private"), selected: note.visibility === VISIBILITY.PRIVATE },
        { value: VISIBILITY.PARTY,   label: game.i18n.localize("NEXUSNOTES.Visibility.Party"),   selected: note.visibility === VISIBILITY.PARTY },
        ...(isGM ? [{ value: VISIBILITY.GM, label: game.i18n.localize("NEXUSNOTES.Visibility.GM"), selected: note.visibility === VISIBILITY.GM }] : []),
      ],
      subjectTypeOptions: [
        { value: SUBJECT_TYPES.NONE,          label: game.i18n.localize("NEXUSNOTES.SubjectType.None") },
        { value: SUBJECT_TYPES.ACTOR,         label: game.i18n.localize("NEXUSNOTES.SubjectType.Actor") },
        { value: SUBJECT_TYPES.SCENE,         label: game.i18n.localize("NEXUSNOTES.SubjectType.Scene") },
        { value: SUBJECT_TYPES.JOURNAL_ENTRY, label: game.i18n.localize("NEXUSNOTES.SubjectType.JournalEntry") },
        { value: SUBJECT_TYPES.CUSTOM,        label: game.i18n.localize("NEXUSNOTES.SubjectType.Custom") },
      ],
      currentSubjectType,
      currentSubjectId,
      currentSubjectLabel,
      showDocumentPicker: docTypes.includes(currentSubjectType),
      showCustomPicker:   currentSubjectType === SUBJECT_TYPES.CUSTOM,
      tagsString: (note.tags ?? []).join(", "),
      // Document lists for each type (shown/hidden via JS based on selected type)
      actors:   game.actors.contents.map(a => ({ id: a.id, name: a.name })),
      scenes:   game.scenes.contents.map(s => ({ id: s.id, name: s.name })),
      journals: game.journal.contents.map(j => ({ id: j.id, name: j.name })),
    };
  }

  /** @override */
  _onRender(context, options) {
    const subjectTypeSelect = this.element.querySelector("[name='subjectType']");
    subjectTypeSelect?.addEventListener("change", e => this._updateSubjectPicker(e.target.value));
    // Sync picker visibility in case the select changed during a re-render
    if (subjectTypeSelect) this._updateSubjectPicker(subjectTypeSelect.value);
  }

  /**
   * Show the correct subject picker section for the chosen type.
   * @param {string} type
   */
  _updateSubjectPicker(type) {
    const el = this.element;
    const docTypes = [SUBJECT_TYPES.ACTOR, SUBJECT_TYPES.SCENE, SUBJECT_TYPES.JOURNAL_ENTRY];
    el.querySelector(".subject-document-picker")?.classList.toggle("hidden", !docTypes.includes(type));
    el.querySelector(".subject-custom-picker")?.classList.toggle("hidden", type !== SUBJECT_TYPES.CUSTOM);

    // Show only the relevant document select within the doc picker
    for (const t of docTypes) {
      el.querySelector(`.doc-select[data-type="${t}"]`)?.classList.toggle("hidden", t !== type);
    }
  }

  /**
   * Collect form data, validate, and persist the note.
   * @param {PointerEvent}  event
   * @param {HTMLElement}   target
   */
  static async _onSave(event, target) {
    const form = this.element.querySelector("form");
    const data = new FormData(form);

    const title = data.get("title")?.trim();
    if (!title) {
      ui.notifications.warn(game.i18n.localize("NEXUSNOTES.NoteEditor.TitleRequired"));
      return;
    }

    const visibility = data.get("visibility");
    const content    = data.get("content") ?? "";
    const pinned     = form.querySelector("[name='pinned']")?.checked ?? false;
    const tagsRaw    = data.get("tags") ?? "";
    const tags       = tagsRaw.split(",").map(t => t.trim()).filter(Boolean);

    // Build subjectRefs
    const subjectType = data.get("subjectType");
    let subjectRefs = [];
    if (subjectType && subjectType !== SUBJECT_TYPES.NONE) {
      if (subjectType === SUBJECT_TYPES.CUSTOM) {
        const label = data.get("subjectCustomLabel")?.trim();
        if (label) subjectRefs = [{ type: SUBJECT_TYPES.CUSTOM, documentId: null, label }];
      } else {
        const docId = data.get("subjectDocumentId");
        if (docId) {
          const collKey = subjectType.toLowerCase() + "s";
          const doc = game[collKey]?.get(docId);
          const label = doc?.name ?? "";
          subjectRefs = [{ type: subjectType, documentId: docId, label }];
        }
      }
    }

    const changes = { title, content, visibility, tags, subjectRefs, pinned, color: DEFAULT_COLORS[visibility] };

    if (this._note) {
      await NexusNoteCollection.update(this._vault, this._note.id, changes);
    } else {
      await NexusNoteCollection.add(this._vault, createNote(changes));
    }

    this._resolve?.(true);
    this.close();
  }

  /**
   * Dismiss the dialog without saving.
   * @param {PointerEvent}  event
   * @param {HTMLElement}   target
   */
  static async _onCancel(event, target) {
    this._resolve?.(false);
    this.close();
  }

  /**
   * Open the editor and return a promise that resolves when it is closed.
   *
   * @param {JournalEntry}   vault
   * @param {NexusNote|null} [note=null]  - Omit or pass null to create a new note.
   * @returns {Promise<boolean>} True if the note was saved, false if cancelled.
   */
  static open(vault, note = null) {
    return new Promise(resolve => {
      new NoteEditor({ vault, note, resolve }).render(true);
    });
  }
}
