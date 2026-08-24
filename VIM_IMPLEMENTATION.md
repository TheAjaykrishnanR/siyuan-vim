# Vim and Search Implementation Outline

The implementation of Vim mode and its built-in search functionality in this fork introduces a custom CodeMirror 5 (CM5) adapter layer over the SiYuan Protyle WYSIWYG editor. 

Because this repository was initialized as a fresh git repository rather than a continuous fork, the upstream diff is not preserved in the git history. However, the core Vim and search implementation is localized to the following files:

## 1. Core Vim Implementation (`app/src/protyle/vim/*`)

This entire directory was created specifically to implement Vim mode and search.

- **`adapter.ts` (`ProtyleVimAdapter`)**
  - Acts as the bridge between SiYuan's block-based WYSIWYG editor and the CodeMirror Vim engine.
  - Implements the `CM5EditorInterface`, translating CM5 operations (e.g., `replaceRange`, `getLine`, `setCursor`) into SiYuan transaction operations (`IOperation`).
  - **Search Implementation:** Contains `getSearchCursor`, which traverses the Protyle DOM to find regex string matches for Vim's `/` and `?` search commands.
  - **Command Bar:** Contains `openDialog`, which renders the Vim command and search input bar at the bottom of the screen.

- **`core/vim.js`**
  - The core Vim keybinding and state engine, ported directly from CodeMirror 5's `vim.js`.
  - Parses keystrokes, tracks modes (Normal, Insert, Visual), and dispatches operator and motion commands.

- **`index.ts`**
  - Exposes the `initProtyleVim` entry point.
  - Attaches `keydown` event listeners to the WYSIWYG editor to intercept keystrokes and feed them into the Vim engine (`CodeMirror.Vim.handleKey`).
  - Manages the CSS classes for toggling between Normal and Insert mode cursors.

- **`cmMock.ts`**
  - Implements `CMMock`, a mock CodeMirror instance wrapper that exposes the `ProtyleVimAdapter` to `vim.js`.

- **`core/types.ts`**
  - TypeScript definitions for the CM5 adapter and mock interfaces.

## 2. Editor Integration Hooks

Modifications were made to existing SiYuan frontend files to hook the Vim logic into the application lifecycle and styles:

- **`app/src/protyle/wysiwyg/index.ts`**
  - Imports `initProtyleVim` from `../vim`.
  - Hooks into the WYSIWYG initialization loop (around line 468) by calling `initProtyleVim(protyle, this.element)`, which binds the Vim interceptors when the editor mounts.

- **`app/src/assets/scss/protyle/_wysiwyg.scss`**
  - CSS modifications to handle the block cursor.
  - Added `.protyle-wysiwyg--vim-normal` and `.protyle-wysiwyg--vim-insert` classes to modify `caret-color` and `caret-shape` to visually represent the Vim mode (e.g., block cursor in Normal mode, line cursor in Insert mode).

- **`app/src/constants.ts`**
  - Additions to support Vim-related state or configuration constants.
