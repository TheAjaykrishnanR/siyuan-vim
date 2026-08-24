Here is a comprehensive feasibility analysis, architectural breakdown of SiYuan's input system, an evaluation of the VSCode Vim
  plugin in the Vim folder, and a roadmap to implement Vim motions with minimal fork maintenance overhead.
  ──────
  ### 1. Executive Summary & Feasibility Verdict

   Approach                   | Feasibility | Maintenance Effort         | User Experience           | Recommendation
  ----------------------------|-------------|----------------------------|---------------------------|----------------------------
   Direct Port of VSCodeVim   | ⚠️ Very Low | 🔴 Extremely High          | ⚠️ Fragile                | Not recommended for full
   (Vim/ folder via vscode    |             |                            |                           | engine; borrow command
   API Shim)                  |             |                            |                           | definitions/regexes only.
   Capture-Phase Interceptor  | 🟢 High     | 🟢 Minimal (1–2 line core  | 🟢 Fast, robust,          | Recommended
   + Block-Aware Vim Engine   |             | hook or pure plugin)       | outliner-native           |
  ──────
  ### 2. Is app/src/protyle/wysiwyg/keydown.ts "It"?

  Yes, keydown.ts is where Protyle's editor-level key event handling begins, but understanding how SiYuan processes keys across
  its full pipeline is crucial:
    flowchart TD
        UserKey[User Presses Key] --> WindowCapture[Window Capture Phase]
        WindowCapture --> ProtyleCapture[Protyle Wysiwyg Capture Phase: Vim Interceptor]

        ProtyleCapture -->|Normal / Visual Mode| VimEngine[Vim State Machine & Motion Handler]
        VimEngine --> Prevent[preventDefault + stopImmediatePropagation]
        VimEngine --> DOMAction[Execute Motion / Block Op / Transaction]

        ProtyleCapture -->|Insert Mode: Normal Key| BubblePhase[Bubble Phase: keydown.ts]
        ProtyleCapture -->|Insert Mode: Escape / jk| SwitchNormal[Switch to Normal Mode + preventDefault]

        BubblePhase --> HotkeyCheck[SiYuan Keymap Hotkeys]
        HotkeyCheck -->|Regular Character| PassNative[Pass Through to ContentEditable]
        PassNative --> BeforeInput[beforeinput / input event in wysiwyg/index.ts]
        BeforeInput --> SyncBackend[Transaction sent to Go Kernel AST]

  #### How SiYuan Handles Keyboard Input:

  1. Attachment Point: In index.ts:465, every editor instance initializes keydown handling via keydown(protyle, this.element).
  2. Key Filter in keydown.ts: Lines 445–450 of keydown.ts:445-450 check if the key is a special editor shortcut (Enter, Tab,
  Backspace, Arrows, etc.). If it is just an alphanumeric character (like j, k, w), keydown.ts calls event.stopPropagation() and
  returns, allowing the browser's native contenteditable engine to type the character.
  3. Mutation & Kernel Sync: The browser's native insertion triggers beforeinput and input events in index.ts:3878-3980, which
  executes input(), batching the edits into a transaction sent to the Go backend (/api/transactions) to update the .sy files and
  SQLite database.
  4. Global Keydown: Handled in keydown.ts, which filters out hotkeys when an editable element is focused via commonHotkey.ts:161.
  ──────
  ### 3. Analysis of the VSCode Vim Plugin (Vim/ folder)

  Inspecting extensionBase.ts, textEditor.ts, and actions:

  #### Why direct integration of VSCodeVim is problematic:

  1. Tight VS Code API Coupling: Over 150 TypeScript files import vscode directly (vscode.Position, vscode.Range, vscode.Selection,
  vscode.TextDocument, vscode.commands, vscode.window, etc.).
  2. 1D Flat-Text vs. Hierarchical Tree-of-Blocks:
      • VSCode: A document is a flat array of string lines indexed by (line, character) from 0 to lineCount - 1.
      • SiYuan: A document is a tree of structured DOM blocks (NodeParagraph, NodeHeading, NodeList, NodeListItem, NodeTable,
      NodeCodeBlock, etc.) containing formatted inline <span> elements (code, block-ref, tag, strong, inline-math).
  3. DOM Virtualization (Paging): In SiYuan, long documents only render visible blocks in protyle.wysiwyg.element. Unrendered
  blocks exist in the Go backend database, not in the DOM. VSCodeVim expects all lines in memory.
  4. Transaction Integrity: Mutating text in SiYuan cannot be a raw string splice; it must preserve block IDs (data-node-id),
  inline markup, and trigger transactions via transaction.ts so the Go backend AST stays in sync.

  │ Tip
  │ While dropping the entire VSCodeVim codebase in via a mock vscode layer is ill-suited for SiYuan's DOM architecture, its
  │ command regexes, motion math, text-object definitions (iw, aw, i", a(, surround), and operator state machine in  are valuable
  │ references to borrow from.
  ──────
  ### 4. How the "Key Input Bypass" Interceptor Works

  To achieve zero or near-zero changes to upstream SiYuan, use the DOM Event Capturing Phase (capture: true):

    // Interceptor attached in the CAPTURE phase (fires BEFORE SiYuan's keydown.ts and before contenteditable)
    editorElement.addEventListener("keydown", (event: KeyboardEvent) => {
        const vim = getVimInstance(protyle);
        if (!vim || !vim.isEnabled()) return;

        if (vim.mode === "NORMAL" || vim.mode === "VISUAL" || vim.mode === "OPERATOR_PENDING") {
            // Prevent typing into DOM and prevent SiYuan's keydown from triggering
            event.preventDefault();
            event.stopImmediatePropagation();
            vim.handleKey(event);
        } else if (vim.mode === "INSERT") {
            // Intercept only Escape or configured exit sequence (e.g., 'jk', 'fd', Ctrl+[)
            if (event.key === "Escape" || (event.key === "[" && event.ctrlKey)) {
                event.preventDefault();
                event.stopImmediatePropagation();
                vim.toNormalMode();
            }
            // All other keys pass through directly to native contenteditable & SiYuan's keydown.ts
        }
    }, { capture: true });

  #### Why this is ideal:

  • Upstream compatibility: You only need a 1-line hook in index.ts or can even attach it as a SiYuan plugin via the loaded-
  protyle-static / switch-protyle event bus.
  • Insert mode is 100% native: IME composition (Chinese/Japanese/Korean), inline math, slash menu /, block refs ((, and
  autocomplete work normally without custom reimplementation.
  • Normal mode protects the DOM: No accidental character insertions or unwanted block splits.
  ──────
  ### 5. Two-Tier Vim Model for Block Editors

  Rich block editors (similar to Logseq / Roam / Obsidian) require a Two-Tier Vim Model:

    ┌─────────────────────────────────────────────────────────────┐
    │                    TIER 1: Intra-Block Vim                  │
    │  (Inside paragraph, heading, list item, or table cell)     │
    │  - Motions: h, l, w, b, e, 0, $, ^, f{char}, t{char}, ;, ,  │
    │  - Edits: x, r{char}, s, cw, ciw, ca", ci(, dw, D, C, A, I  │
    └──────────────────────────────┬──────────────────────────────┘
                                   │ (Crossing boundaries / Esc)
    ┌──────────────────────────────▼──────────────────────────────┐
    │                    TIER 2: Block-Level Vim                  │
    │  (Document outliner structure & block navigation)           │
    │  - Motions: j, k, gg, G, }, {, <C-d>, <C-u>                 │
    │  - Block Ops: dd (delete block), yy (yank block), p (paste) │
    │  - Insertion: o (new block below), O (new block above)      │
    │  - Outliner: >> (indent), << (outdent), za / zc / zo (fold) │
    └─────────────────────────────────────────────────────────────┘
  ──────
  ### 6. Recommended Implementation Plan

    gantt
        title SiYuan Vim Integration Roadmap
        dateFormat  YYYY-MM-DD
        section Phase 1: Core Hook & State
        Capture Event Interceptor & Mode State       :a1, 2026-08-24, 3d
        Status Bar Indicator & Cursor Mode Styling  :a2, after a1, 2d
        section Phase 2: Intra-Block Vim
        Cursor Navigation (h, l, w, b, e, 0, $, f, t):b1, after a2, 4d
        Operators & Text Objects (x, r, d, c, y, iw):b2, after b1, 5d
        section Phase 3: Block-Level Vim
        Block Navigation (j, k, gg, G, }, {)        :c1, after b2, 4d
        Block Mutations (o, O, dd, yy, p, >>, <<, za):c2, after c1, 5d
        section Phase 4: Polish & Config
        Search (/, ?, n, N), Registers & Settings   :d1, after c2, 4d

  #### Step 1: Core Hook & State Machine

  • Create app/src/protyle/vim/ module (or an external plugin repository).
  • Implement VimState (mode: NORMAL | INSERT | VISUAL | VISUAL_LINE | OP_PENDING, register, countPrefix, keyBuffer).
  • Bind capturing keydown listener in index.ts:449.
  • Add CSS classes to the editor (protyle--vim-normal, protyle--vim-insert) to render a block cursor vs. line cursor.

  #### Step 2: Intra-Block Motions & Text Objects

  • Use DOM Range helpers from selection.ts (focusByRange, getSelectionOffset).
  • Implement horizontal movements (h, l, 0, $, ^, w, b, e, ge, f, t, F, T).
  • Implement operators (d, c, y, x, s, r, ~) using transaction.ts or DOM text replacement with input dispatch.

  #### Step 3: Block-Level Motions & Structural Operations

  • Cross-block movement (j, k, gg, G, }, {) using getBlock.ts:41 and selection.ts:4.
  • Block creation (o, O) using util.ts.
  • Block deletion (dd) using remove.ts:33.
  • List / block folding (za, zc, zo) using blockFold.ts:96 and indenting (>>, <<) using list.ts:75 / list.ts:76.

  #### Step 4: Status Bar & Keymap Settings

  • Display -- NORMAL --, -- INSERT --, -- VISUAL --, recording status, and pending keystrokes in the bottom Protyle status bar.
  • Add user toggle in Settings under 设置 - 编辑器 (or plugin settings) to enable/disable Vim mode and configure custom
  keybindings (e.g., jk to escape).

Yes! @replit/codemirror-vim-core is a vastly superior fit compared to VSCodeVim.
  Here is an analysis of why it fits, how it works, and how to wire it into SiYuan with minimal code.
  ──────
  ### 1. Why @replit/codemirror-vim-core is the Right Choice
   Comparison           | VSCodeVim (Vim/ before)                 | @replit/codemirror-vim-core (Vim/ now)
  ----------------------|-----------------------------------------|---------------------------------------------------------------
   Architecture         | Heavy VS Code extension (150+ files)    | Single self-contained engine (vim.js + types.ts)
   Dependencies         | Hard dependency on vscode.* API         | Zero dependencies (pure JavaScript/TypeScript)
   Editor Interface     | VSCode Extension Host & internal        | A single clean adapter interface (CM5EditorInterface)
                        | commands                                |
   Maintenance          | Brittle fake VSCode shim                | Standard adapter pattern (same as Obsidian & Replit)
   Feature Completeness | Full Vim                                | Full Vim (motions, text-objects iw/a", operators c/d/y/r,
                        |                                         | registers, macros, Ex commands :w/:s)
  ──────
  ### 2. How the Integration Works

  @replit/codemirror-vim-core does not care what the underlying editor is. It only needs an adapter object that implements
  types.ts:428-520.

       ┌─────────────────────────────────────────────────────────────┐
       │             Keyboard Event (Capture Phase)                  │
       └──────────────────────────────┬──────────────────────────────┘
                                      │
                                      ▼
       ┌─────────────────────────────────────────────────────────────┐
       │             Vim.handleKey(protyleAdapter, key)              │
       │               (@replit/codemirror-vim-core)                 │
       └──────────────────────────────┬──────────────────────────────┘
                                      │ (calls standard adapter methods)
                                      ▼
       ┌─────────────────────────────────────────────────────────────┐
       │                 ProtyleVimAdapter                           │
       │  - getLine(n)            -> block text / line text          │
       │  - getCursor()           -> DOM Selection / Range offset    │
       │  - setCursor(pos)        -> focusByRange() / focusBlock()   │
       │  - replaceRange(...)     -> updateTransaction() / input()   │
       │  - replaceSelection(...) -> DOM text replace + transaction  │
       └──────────────────────────────┬──────────────────────────────┘
                                      │
                                      ▼
       ┌─────────────────────────────────────────────────────────────┐
       │            SiYuan Protyle WYSIWYG DOM & Go Kernel           │
       └─────────────────────────────────────────────────────────────┘
  ──────
  ### 3. Blueprint for the ProtyleVimAdapter

  To connect vim.js to Protyle, you only need to implement the core subset of types.ts:428-520:

    import { initVim, type CM5EditorInterface, type Pos } from "./Vim/vim.js";
    import { focusByRange, getSelectionOffset } from "../util/selection";
    import { updateTransaction } from "../wysiwyg/transaction";
    import { getNextBlock, getPreviousBlock } from "../wysiwyg/getBlock";

    export class ProtyleVimAdapter implements Partial<CM5EditorInterface> {
        public state: any = { vim: null };
        public curOp: any = null;
        private protyle: IProtyle;

        constructor(protyle: IProtyle) {
            this.protyle = protyle;
        }

        // 1. Reading content
        getLine(row: number): string {
            const block = this.getBlockAt(row);
            return block ? block.textContent || "" : "";
        }

        lineCount(): number {
            return this.protyle.wysiwyg.element.querySelectorAll("[data-node-id]").length;
        }

        // 2. Cursor & Selection
        getCursor(p?: "head" | "anchor" | "start" | "end"): Pos {
            const range = getEditorRange(this.protyle.wysiwyg.element);
            const block = hasClosestBlock(range.startContainer);
            const line = this.getIndexOfBlock(block);
            const offset = getSelectionOffset(block, this.protyle.wysiwyg.element, range);
            return { line, ch: offset.start };
        }

        setCursor(lineOrPos: number | Pos, ch?: number): void {
            const targetLine = typeof lineOrPos === "number" ? lineOrPos : lineOrPos.line;
            const targetCh = typeof lineOrPos === "number" ? (ch ?? 0) : lineOrPos.ch;
            const block = this.getBlockAt(targetLine);
            if (block) {
                this.setBlockCursor(block, targetCh);
            }
        }

        // 3. Mutating content & syncing to SiYuan kernel
        replaceRange(text: string, from: Pos, to?: Pos): void {
            const block = this.getBlockAt(from.line);
            if (!block) return;

            // Mutate block text and dispatch transaction
            this.applyBlockTextEdit(block, text, from.ch, to ? to.ch : from.ch);
        }
    }
  ──────
  ### 4. How Key Input Bypassing Works with vim.js

  In index.ts, attach the capture listener:

    const Vim = initVim({ Pos: (line: number, ch: number) => ({ line, ch }) });
    const adapter = new ProtyleVimAdapter(protyle);
    Vim.maybeInitVimState_(adapter);

    this.element.addEventListener("keydown", (event: KeyboardEvent) => {
        // 1. In Insert mode: only intercept Escape / Ctrl+[
        if (adapter.state.vim.insertMode) {
            if (event.key === "Escape" || (event.key === "[" && event.ctrlKey)) {
                event.preventDefault();
                event.stopImmediatePropagation();
                Vim.handleKey(adapter, "<Esc>", "mapping");
            }
            return; // Pass normal typing to SiYuan native contenteditable & keydown.ts
        }

        // 2. In Normal / Visual mode: feed keys into Vim engine
        const vimKey = mapKeyboardEventToVimKey(event);
        if (vimKey) {
            event.preventDefault();
            event.stopImmediatePropagation();
            Vim.handleKey(adapter, vimKey, "mapping");
        }
    }, { capture: true });
  ──────
  ### 5. Summary Verdict

  1. Suitability: 🟢 Excellent. @replit/codemirror-vim-core is the exact engine built for this purpose and avoids all the overhead
  of VSCodeVim.
  2. Upstream Fork Impact: 🟢 Minimal. Requires only initializing the adapter and attaching the capture-phase key listener in
  Protyle.
  3. Features Gained Immediately: You get full Vim motions (h/j/k/l/w/b/e/0/$/f/t/gg/G), operators (d/c/y/p/x/r), text objects (iw,
  aw, i", a(, i{), visual modes, counts (5dw), registers, macros, and remappings (Vim.map('jk', '<Esc>', 'insert')) right out of
  the box.
