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

## 3. Recent Fixes & Improvements
- **List & Container Motion Support**: Filtered container blocks (`NodeList`, `NodeListItem`) from editable block indexing so `j`/`k` motions do not get stuck or duplicate list lines.
- **Whole-Item List Deletion (`dd`)**: Integrated `getTopAloneElement` for linewise deletions so `dd` removes the entire bullet point/item rather than leaving an empty bullet.
- **Multi-line Code Block Navigation (`j`/`k`)**: Implemented sub-line virtualization in `adapter.ts` and adapted `vim.js` vertical motions (`moveByLines`, `moveToEol`, `expandToLine`, `expandSelectionToLine`) to navigate lines inside code blocks.
- **Accurate Code Block Alignment & ZWSP Handling**: Normalized character offsets against DOM nodes (`<br>`, `.emoji`, `Constants.ZWSP`) so column memory (`lastHSPos`) tracks visual columns accurately without skipping.
- **Code Block Linewise Deletion & Mutation**: Updated `replaceRange` and `expandSelectionToLine` to delete individual sub-lines inside multi-line code blocks with `highlightRender` refresh, while deleting entire 1-line code blocks cleanly.
- **Cursor Focus Synchronization**: Passed container blocks to `focusByOffset` and ensured target editable focus transitions cleanly across block boundaries.
- **Blank Line / Adjacent Block Deletion Fix (`dd`)**: Removed the legacy last-line anchor rewrite and `isDdLastLine` conditions so deleting a blank line adjacent to a code block never deletes the code block.
- **Multi-Mode Code Block Breakout (`Shift+Enter` / `Ctrl+Enter`)**: Added multi-mode breakout shortcuts in both Normal and Insert modes to exit code blocks and create a new paragraph block below (or above with `Ctrl+Shift+Enter`) in Insert mode without using the mouse.
- **Code Block Subline `o` / `O` Insertion**: Updated `newLineAndEnterInsertMode` so `o` and `O` in Normal mode inside code blocks open new lines inside the code block rather than breaking out.
- **Note Title Motion Navigation (`j` / `k` / `gg`)**: Integrated `protyle.title` as line 0 in `getEditableBlocks()`. Supported seamless `k` navigation from the top body block into the document title, `j` navigation from the title into the body, full title text editing via Vim operators, title cursor styling, and document rename sync.
- **Code Block Linewise Yank, Delete & Paste Fix (`yy` / `dd` / `p` / `P`)**: Fixed `expandSelectionToLine`, `continuePaste`, and `getRange` to handle single-line and multi-line code block boundaries without leaking cross-block newlines, phantom blank lines, or cursor displacement.
- **Code Block Caret Preservation Across Syntax Rendering**: Enhanced `highlightRender` to snapshot and restore the active selection offset across DOM reconstructions, preventing caret jumping to block offset 0 on `dd`, `dw`, `Shift+P`, `p`, and `u`.
- **Code Block Undo (`u`) Caret Restoration**: Embedded temporary `<wbr>` tags into `oldHTML` snapshots before serialization in `replaceRange` and `replaceSelection`, enabling exact sub-line caret restoration when undoing actions in code blocks.
- **Breakout & Mode Transitions**: Streamlined `Shift+Enter` / `Ctrl+Enter` / `Ctrl+Shift+Enter` breakout handling to avoid focus hijacking and maintain instant Insert mode readiness.

# Other Changes:

1. A `build.ps1` script to automate releases.
2. This `OUR_CHANGES.md` file.
3. A `SYNC.md` containing instructions for updating with upstream.
