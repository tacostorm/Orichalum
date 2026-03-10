# Nexus Notes — FoundryVTT Module Design Document

## Overview

**Module Name:** `orichalum`
**FoundryVTT Compatibility:** v11+ (ApplicationV2, DataModel API)
**License:** MIT
**Description:** A vault-based note-taking system for FoundryVTT. Every player and the GM gets
a personal vault — a private notebook that belongs to them, not to any actor or scene. Notes can
be kept private, shared with the whole party, or (for the GM) marked GM-only. Notes reference
actors, scenes, and other Foundry documents as subjects, and are fully searchable. A node graph
view (v0.2) will visualise connections between notes across all visible vaults.

---

## Core Design Principles

1. **Vaults belong to players, not documents.** Notes live in the author's vault and reference
   external documents — they do not modify actors, scenes, or journal entries.
2. **No GM-mediated socket writes in normal operation.** Each player owns their vault (a
   JournalEntry with Owner permission), so they write directly. The only socket event needed
   in v0.1 is vault creation, which requires a GM client to set permissions.
3. **The GM sees everything by default.** In transparency mode (world setting, default on),
   the GM can read all notes in all vaults regardless of visibility. This respects the
   collaborative "GM builds on player intent" style of play.
4. **Search is first-class.** Every note is instantly searchable by title, content, tags,
   and subject name from the main panel, entirely client-side.

---

## Module File Structure

```
orichalum/
├── module.json
├── LICENSE
├── README.md
├── DESIGN.md
├── src/
│   ├── module.js                  # Entry point — hooks, registration, toolbar button
│   ├── constants.js               # MODULE_ID, FLAG_KEYS, VISIBILITY, SUBJECT_TYPES
│   ├── NexusVault.js              # Vault lifecycle — create, load, get for user
│   ├── NexusNote.js               # Note data model + factory
│   ├── NexusNoteCollection.js     # CRUD operations on a vault's notes
│   ├── ui/
│   │   ├── NexusPanel.js          # Main ApplicationV2 panel (note list + search)
│   │   └── NoteEditor.js          # Create/edit note dialog
│   └── helpers/
│       ├── permissions.js         # canView, canEdit, filterVisible
│       ├── search.js              # Note search/filter logic
│       └── subjectResolver.js     # Resolve a subjectRef to a name/icon for display
├── templates/
│   ├── nexus-panel.hbs            # Main panel template
│   └── note-editor.hbs            # Note editor dialog template
├── styles/
│   └── orichalum.css
└── lang/
    └── en.json
```

---

## module.json

```json
{
  "id": "orichalum",
  "title": "Nexus Notes",
  "description": "A vault-based shared note-taking system for players and GMs.",
  "version": "0.1.0",
  "compatibility": {
    "minimum": "11",
    "verified": "12"
  },
  "authors": [{ "name": "YOUR NAME" }],
  "esmodules": ["src/module.js"],
  "styles": ["styles/orichalum.css"],
  "languages": [{ "lang": "en", "name": "English", "path": "lang/en.json" }],
  "socket": true,
  "license": "LICENSE",
  "readme": "README.md",
  "url": "https://github.com/YOUR_GITHUB/orichalum",
  "manifest": "https://raw.githubusercontent.com/YOUR_GITHUB/orichalum/main/module.json",
  "download": "https://github.com/YOUR_GITHUB/orichalum/releases/latest/download/module.zip"
}
```

> Socket is `true` because vault creation requires a one-time GM-mediated setup per player.

---

## Data Model

### NexusVault

One vault per user. Stored as a `JournalEntry` inside a hidden folder named `"Nexus Vaults"`.
The vault JournalEntry is identified by module flags.

```js
// Vault JournalEntry flags
{
  "orichalum": {
    isVault: true,
    ownerId: String    // game.user.id of the owning player
  }
}
```

**Vault ownership and permissions:**
- One vault JournalEntry per user, created on first open
- The owning player has `OWNER` permission on their vault
- All other players have `NONE` permission
- GMs have `OWNER` on all vaults by default (Foundry GM behaviour)
- The `"Nexus Vaults"` folder is hidden from the normal journal sidebar

### NexusNote

Stored as a JSON array in the `text.content` of a JournalEntryPage named `"notes"` inside
the vault JournalEntry.

```js
{
  id: String,              // `nn_${randomID(16)}`
  title: String,           // Short label e.g. "Mira the Innkeeper"
  content: String,         // Note body — plain text in v0.1
  visibility: String,      // "private" | "party" | "gm" (gm only settable by GM)
  tags: [String],          // Free-text tags e.g. ["npc", "suspicious"]
  subjectRefs: [           // Foundry documents this note is about (0 or more)
    {
      type: String,        // "Actor" | "Scene" | "JournalEntry" | "custom"
      documentId: String,  // Foundry document id, or null for custom
      label: String        // Name snapshot — preserved if document is later deleted
    }
  ],
  linkedNoteIds: [String], // IDs of other NexusNotes (any vault) — used by v0.2 graph
                           // Store as empty array in v0.1 to avoid migration later
  color: String,           // Hex color for node graph — defaults by visibility
  createdAt: Number,       // Unix timestamp ms
  updatedAt: Number,       // Unix timestamp ms
  pinned: Boolean          // Pinned notes appear at top of list
}
```

---

## Visibility Model

### Player notes

| Visibility | Author | Other players | GM (transparency ON) | GM (transparency OFF) |
|---|---|---|---|---|
| `private` | ✅ | ❌ | ✅ | ❌ |
| `party` | ✅ | ✅ | ✅ | ✅ |

### GM notes

| Visibility | GM | Players |
|---|---|---|
| `private` | ✅ | ❌ |
| `party` | ✅ | ✅ |
| `gm` | ✅ | ❌ |

### Rules summary

- Players only see `private` and `party` options in the note editor. The `gm` option is
  hidden from non-GM users.
- The GM sees all `party` notes from all vaults at all times.
- The GM sees all `private` notes when the world setting `gmTransparency` is `true` (default).
- When `gmTransparency` is `false`, the GM sees only their own vault and all `party` notes.
- No player ever sees another player's `private` notes, regardless of any setting.

### Default node graph colors by visibility

- `private` → `#7B68EE` (slate blue)
- `party` → `#3CB371` (sea green)
- `gm` → `#DC143C` (crimson)

---

## Permissions (`helpers/permissions.js`)

```js
function canView(note, viewerUser, authorUser) {
  if (viewerUser.isGM) {
    if (note.visibility === "private") {
      return game.settings.get("orichalum", "gmTransparency");
    }
    return true; // party and gm notes always visible to GM
  }
  // Player viewing
  if (note.visibility === "gm") return false;
  if (note.visibility === "private") return authorUser.id === viewerUser.id;
  return true; // party
}

function canEdit(note, user, authorUser) {
  if (user.isGM) return true;
  return authorUser.id === user.id;
}

function filterVisible(notes, viewerUser, authorUser) {
  return notes.filter(n => canView(n, viewerUser, authorUser));
}
```

---

## NexusVault (`NexusVault.js`)

```js
class NexusVault {
  /** Returns the vault JournalEntry for a given userId, or null if not yet created. */
  static async getForUser(userId) { ... }

  /** Creates a new vault for userId. Should only be called by the GM client. */
  static async createForUser(userId) { ... }

  /** Returns the vault for the current user, triggering creation if needed. */
  static async getOrCreateMine() { ... }

  /** Returns all vaults readable by the current user (own vault + vaults with party notes). */
  static async getAllVisible() { ... }
}
```

---

## NexusNoteCollection (`NexusNoteCollection.js`)

```js
class NexusNoteCollection {
  /** Load all notes from a vault JournalEntry. */
  static async getAll(vault) { ... }

  /** Append a new note and persist. */
  static async add(vault, note) { ... }

  /** Merge changes into an existing note by id and persist. */
  static async update(vault, noteId, changes) { ... }

  /** Remove a note by id and persist. */
  static async delete(vault, noteId) { ... }
}
```

**Storage pattern:**

```js
// Read
const page = vault.pages.getName("notes");
const notes = JSON.parse(page.text.content ?? "[]");

// Write
await page.update({ "text.content": JSON.stringify(updatedNotes) });
```

---

## Search (`helpers/search.js`)

Runs entirely client-side on the already-loaded, already-filtered notes array.

```js
function searchNotes(notes, query) {
  if (!query?.trim()) return notes;
  const q = query.toLowerCase();
  return notes.filter(note =>
    note.title?.toLowerCase().includes(q) ||
    note.content?.toLowerCase().includes(q) ||
    note.tags?.some(t => t.toLowerCase().includes(q)) ||
    note.subjectRefs?.some(r => r.label?.toLowerCase().includes(q))
  );
}
```

---

## Subject Resolver (`helpers/subjectResolver.js`)

Resolves a `subjectRef` to a display name and icon for rendering note cards.

```js
async function resolveSubject(subjectRef) {
  if (subjectRef.type === "custom") {
    return { label: subjectRef.label, icon: "fa-tag" };
  }
  try {
    const doc = game[subjectRef.type.toLowerCase() + "s"]?.get(subjectRef.documentId);
    return {
      label: doc?.name ?? subjectRef.label,
      icon: subjectRef.type === "Actor" ? "fa-user" :
            subjectRef.type === "Scene" ? "fa-map" : "fa-book"
    };
  } catch {
    return { label: subjectRef.label, icon: "fa-question" };
  }
}
```

---

## UI: NexusPanel (`ui/NexusPanel.js`)

**What it is:** A resizable, draggable `ApplicationV2` window opened from the toolbar button.

**Layout:**

```
┌────────────────────────────────────────┐
│  🔍 Search notes...           [+ New]  │
├────────────────────────────────────────┤
│  MY NOTES                              │
│  ┌────────────────────────────────┐   │
│  │ 📌 Mira the Innkeeper   [pvt] │   │  ← pinned note
│  │    👤 Actor · #npc #suspicious │   │
│  └────────────────────────────────┘   │
│  ┌────────────────────────────────┐   │
│  │ The Sunken Temple       [pty] │   │
│  │    🗺 Scene · #dungeon         │   │
│  └────────────────────────────────┘   │
├────────────────────────────────────────┤
│  PARTY NOTES                           │
│  ┌────────────────────────────────┐   │
│  │ [Thorin] Session 3 recap [pty] │   │
│  └────────────────────────────────┘   │
├────────────────────────────────────────┤
│  ALL VAULTS  (GM only)                 │
│  [Thorin] [Aria] [Kael] [GM]          │
└────────────────────────────────────────┘
```

**Section behaviour:**
- **My Notes** — all notes from the current user's vault, filtered by search query, pinned first
- **Party Notes** — `party`-visibility notes from *other* players' vaults, filtered by search
- **All Vaults** — GM only; tab switcher showing every vault including private notes
  (respects `gmTransparency` setting for the private notes of each player)
- Search filters all sections simultaneously in real time
- Clicking a note card opens `NoteEditor` in edit mode
- Each note card shows: title, subject icon + label, visibility badge, tag chips,
  author name (on party notes and in GM all-vaults view)

---

## UI: NoteEditor (`ui/NoteEditor.js`)

**What it is:** A modal `ApplicationV2` dialog for creating and editing a single note.

**Fields:**

| Field | Type | Details |
|---|---|---|
| Title | Text input | Required |
| Content | Textarea | Plain text in v0.1 |
| Visibility | Radio | `Private` / `Party` for players; `Private` / `Party` / `GM Only` for GM |
| Subject type | Dropdown | Actor / Scene / Journal Entry / Custom / None |
| Subject picker | Conditional | Document select (if Actor/Scene/JE) or text input (if Custom) |
| Tags | Text input | Comma-separated; rendered as chips on save |
| Pin | Checkbox | Floats note to top of My Notes list |

**Subject field behaviour:**
- Subject is optional — a note does not need to reference any document
- When a linked document is selected, snapshot its current name into `subjectRef.label` at save time
- If the document is later renamed or deleted, the snapshot label is preserved as fallback

**On save:**
- Calls `NexusNoteCollection.add()` or `update()` on the current user's vault
- Sets `updatedAt` timestamp
- Closes dialog and triggers NexusPanel re-render

---

## Toolbar Button Registration (`src/module.js`)

```js
Hooks.on("getSceneControlButtons", (controls) => {
  controls.push({
    name: "orichalum",
    title: game.i18n.localize("NEXUSNOTES.ToolbarButton"),
    icon: "fa-solid fa-book-open",
    layer: "controls",
    tools: [],
    activeTool: null,
    onClick: () => NexusPanel.open(),
    button: true
  });
});
```

---

## Vault Initialisation Flow

The first time any user opens Nexus Notes:

1. `NexusVault.getOrCreateMine()` is called
2. Searches all JournalEntries for one flagged `{ isVault: true, ownerId: game.user.id }`
3. **If vault found:** load it, render the panel
4. **If not found:**
   - If current user is GM: create `"Nexus Vaults"` folder (if missing), create vault
     JournalEntry, set permissions, render panel
   - If current user is a player: emit socket event `{ type: "requestVaultCreation", userId }`
     to the GM client. Show a loading message: *"Setting up your vault…"*
5. **GM client** receives `requestVaultCreation`, creates the vault JournalEntry for that userId,
   sets OWNER permission for that user, emits `{ type: "vaultCreated", userId }` back
6. **Player client** receives `vaultCreated`, loads vault, renders panel

> If no GM is online when a new player first opens the panel, show a clear message:
> *"Your vault needs to be set up by the GM. Ask them to log in and then try again."*

---

## Game Settings

```js
game.settings.register("orichalum", "gmTransparency", {
  name: "NEXUSNOTES.Settings.GmTransparency.Name",
  hint: "NEXUSNOTES.Settings.GmTransparency.Hint",
  scope: "world",
  config: true,
  type: Boolean,
  default: true
});

game.settings.register("orichalum", "defaultVisibility", {
  name: "NEXUSNOTES.Settings.DefaultVisibility.Name",
  hint: "NEXUSNOTES.Settings.DefaultVisibility.Hint",
  scope: "client",
  config: true,
  type: String,
  choices: {
    private: "NEXUSNOTES.Visibility.Private",
    party: "NEXUSNOTES.Visibility.Party"
  },
  default: "private"
});
```

---

## v0.1 Feature Checklist

### Infrastructure
- [ ] `module.json` complete and valid
- [ ] `constants.js` — MODULE_ID, flag keys, VISIBILITY enum, SUBJECT_TYPES enum
- [ ] Toolbar button registered, opens NexusPanel

### Vault layer
- [ ] `NexusVault.js` — getForUser, createForUser, getOrCreateMine, getAllVisible
- [ ] `"Nexus Vaults"` hidden folder created on first GM login
- [ ] Vault creation socket — player → GM request, GM creates vault and sets permissions
- [ ] `vaultCreated` socket reply — player receives and opens panel

### Notes layer
- [ ] `NexusNote.js` — data model, `createNote()` factory (includes empty `linkedNoteIds: []`)
- [ ] `NexusNoteCollection.js` — getAll, add, update, delete via JSON page storage
- [ ] `helpers/permissions.js` — canView, canEdit, filterVisible
- [ ] `helpers/search.js` — searchNotes() client-side filter
- [ ] `helpers/subjectResolver.js` — resolveSubject()

### UI
- [ ] `NexusPanel.js` — search bar, My Notes, Party Notes, GM All Vaults sections
- [ ] `NoteEditor.js` — create/edit dialog, all fields, save/cancel
- [ ] `nexus-panel.hbs` and `note-editor.hbs` Handlebars templates
- [ ] `orichalum.css` — Foundry-native styling, note cards, visibility badges, tag chips

### Settings
- [ ] `gmTransparency` world setting
- [ ] `defaultVisibility` client setting

### Localisation
- [ ] `en.json` — all user-facing strings as i18n keys

---

## What v0.1 Does NOT Include

- Node graph visualisation (v0.2)
- Note linking / graph edges (v0.2, but `linkedNoteIds: []` is stored now to avoid migration)
- Rich text / ProseMirror editor (v0.2)
- Export / import notes as JSON or Journal Entry
- Per-note colour picker in the editor (stored in model, not exposed in UI until v0.2)

---

## First Claude Code Prompt

Copy and paste this verbatim as your first message in a new Claude Code session,
with the repo open and DESIGN.md committed:

```
I am building a FoundryVTT v11/v12 module called orichalum.
The full design document is in DESIGN.md in the repo root. Please read it fully before writing any code.

Implement v0.1 exactly as specified. Use this build order:

1. Scaffold the complete file and folder structure from the design doc (create all files, even if empty)
2. module.json — all fields exactly as specified
3. constants.js — MODULE_ID, flag keys, VISIBILITY enum, SUBJECT_TYPES enum, SOCKET_EVENTS enum
4. NexusNote.js — data model and createNote() factory
5. NexusNoteCollection.js — getAll, add, update, delete using JSON JournalEntryPage storage
6. NexusVault.js — getForUser, createForUser, getOrCreateMine, getAllVisible
7. helpers/permissions.js — canView, canEdit, filterVisible with gmTransparency setting check
8. helpers/search.js — searchNotes() client-side filter
9. helpers/subjectResolver.js — resolveSubject()
10. Socket handler in module.js — requestVaultCreation (player → GM) and vaultCreated (GM → player)
11. NoteEditor.js — ApplicationV2 dialog with all fields from design doc
12. NexusPanel.js — ApplicationV2 window: search bar, My Notes, Party Notes, GM All Vaults tabs
13. nexus-panel.hbs and note-editor.hbs Handlebars templates
14. module.js — entry point, all hooks, toolbar button, settings registration, socket handler
15. orichalum.css — clean Foundry-native styling
16. en.json — all user-facing strings as localisation keys

Hard requirements:
- ES modules (import/export) throughout — no CommonJS
- ApplicationV2, not the legacy Application class
- No jQuery for DOM manipulation
- Do not implement the node graph — that is v0.2
- Every class and public method gets a short JSDoc comment
- linkedNoteIds must be initialised as [] on every new note even though it is unused in v0.1
```

---

## Notes for Future Self

- **Test with two browser tabs** — one GM, one player — to verify vault creation, permissions,
  and party note visibility before doing anything else.
- **The vault creation socket is the trickiest part.** If no GM is online when a new player
  opens the panel for the first time, vault creation silently fails. The UI must surface this
  clearly rather than showing an empty panel with no explanation.
- **JSON page storage is simple but has a practical size cap around a few MB.** For large
  campaigns with hundreds of notes per player this is fine. If it becomes an issue in future,
  migrate to one JournalEntryPage per note.
- **`linkedNoteIds` stored as `[]` now** means notes created in v0.1 are already graph-ready
  for v0.2 with no data migration needed.
- **Packaging for release:** The GitHub Actions release zip must have `module.json` at the top
  level when extracted, not inside a subdirectory. Test by installing the zip manually in Foundry
  before publishing a release.
