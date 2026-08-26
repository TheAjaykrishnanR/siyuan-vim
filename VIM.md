# SiYuan Vim Mode Reference

This document outlines all currently supported Vim motions, modes, operators, Ex commands, and custom shortcuts in the `siyuan-vim` editor integration.

---

## 1. Custom Block Breakout Shortcuts

These shortcuts allow you to escape code blocks, blockquotes, tables, or any container block and create new paragraph blocks without using the mouse. They work identically in **both Insert Mode and Normal Mode**:

| Shortcut | Description | Resulting Mode |
|---|---|---|
| <kbd>Shift</kbd> + <kbd>Enter</kbd> | Break out and insert an empty paragraph block **below** the current block | **Insert Mode** |
| <kbd>Ctrl</kbd> + <kbd>Enter</kbd> / <kbd>Cmd</kbd> + <kbd>Enter</kbd> | Break out and insert an empty paragraph block **below** the current block | **Insert Mode** |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Enter</kbd> | Break out and insert an empty paragraph block **above** the current block | **Insert Mode** |
| <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>Enter</kbd> / <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>Enter</kbd> | Break out and insert an empty paragraph block **above** the current block | **Insert Mode** |

---

## 2. Modes & Transitions

| Key / Action | Description |
|---|---|
| <kbd>Esc</kbd> or <kbd>Ctrl</kbd> + <kbd>[</kbd> | Exit Insert/Visual mode and return to **Normal Mode** (renders filled block caret) |
| `i` | Enter **Insert Mode** before the current cursor |
| `I` (`Shift+I`) | Enter **Insert Mode** at the first non-blank character of the line / sub-line |
| `a` | Enter **Insert Mode** after the current cursor |
| `A` (`Shift+A`) | Enter **Insert Mode** at the end of the line / sub-line (inside code blocks, moves to the end of the current code line) |
| `o` | Open line below and enter **Insert Mode** (in code blocks: inserts a new sub-line inside; in prose: inserts a new block below) |
| `O` (`Shift+O`) | Open line above and enter **Insert Mode** (in code blocks: inserts a new sub-line inside; in prose: inserts a new block above) |
| `v` | Enter character-wise **Visual Mode** |
| `V` (`Shift+V`) | Enter line-wise **Visual Mode** |
| `Ctrl+v` | Enter block-wise **Visual Mode** |
| `gv` | Reselect the previous visual selection |

---

## 3. Cursor Motions & Navigation

### Horizontal Movement
| Key | Description |
|---|---|
| `h` / <kbd>Left</kbd> | Move cursor left by one character |
| `l` / <kbd>Right</kbd> | Move cursor right by one character |
| `0` / <kbd>Home</kbd> | Jump to the beginning of the line / sub-line |
| `^` | Jump to the first non-whitespace character of the line / sub-line |
| `$` / <kbd>End</kbd> | Jump to the end of the line / sub-line |
| `w` / `W` | Jump forward to the beginning of the next word / big-word |
| `b` / `B` | Jump backward to the beginning of the previous word / big-word |
| `e` / `E` | Jump forward to the end of the current/next word / big-word |
| `ge` / `gE` | Jump backward to the end of the previous word / big-word |
| `f{char}` | Move forward to the next occurrence of `{char}` on the line |
| `F{char}` | Move backward to the previous occurrence of `{char}` on the line |
| `t{char}` | Move forward until right before `{char}` on the line |
| `T{char}` | Move backward until right after `{char}` on the line |
| `;` | Repeat the last `f`/`F`/`t`/`T` search in the same direction |
| `,` | Repeat the last `f`/`F`/`t`/`T` search in the opposite direction |

### Vertical & Block Movement
| Key | Description |
|---|---|
| `j` / <kbd>Down</kbd> | Move cursor down one line (navigates from Note Title into body blocks, moves across sub-lines inside multi-line code blocks, traverses list items, and moves across blocks) |
| `k` / <kbd>Up</kbd> | Move cursor up one line (navigates from body blocks up into Note Title, moves across sub-lines inside multi-line code blocks, traverses list items, and moves across blocks) |
| `gg` | Jump to the Note Title / first block of the document |
| `G` | Jump to the last block / line of the document |
| `H` | Jump cursor to the top line visible on screen |
| `M` | Jump cursor to the middle line visible on screen |
| `L` | Jump cursor to the bottom line visible on screen |
| <kbd>Ctrl</kbd> + <kbd>d</kbd> | Scroll down half a page |
| <kbd>Ctrl</kbd> + <kbd>u</kbd> | Scroll up half a page |
| <kbd>Ctrl</kbd> + <kbd>f</kbd> / <kbd>PageDown</kbd> | Scroll down full page |
| <kbd>Ctrl</kbd> + <kbd>b</kbd> / <kbd>PageUp</kbd> | Scroll up full page |
| `%` | Jump to matching bracket `()`, `{}`, or `[]` |

---

## 4. Editing & Operators

### Linewise & Block Deletions
| Key | Description |
|---|---|
| `dd` | Delete current line (in multi-line code blocks: deletes the sub-line; on single blocks / list items: deletes the entire block cleanly) |
| `D` (`Shift+D`) | Delete from cursor to the end of the line / sub-line |
| `d{motion}` | Delete text covered by `{motion}` (e.g. `dw`, `db`, `d$`, `d0`, `dG`, `dgg`, `d%`) |
| `x` / <kbd>Del</kbd> | Delete character under the cursor |
| `X` | Delete character before the cursor |

### Copy, Paste & Registers
| Key | Description |
|---|---|
| `yy` / `Y` | Yank (copy) the entire current line / block into register |
| `y{motion}` | Yank text covered by `{motion}` (e.g. `yw`, `y$`, `yG`) |
| `p` | Paste register content after cursor / below current line |
| `P` (`Shift+P`) | Paste register content before cursor / above current line |
| `"{reg}y` / `"{reg}p` | Yank / paste using named register `{reg}` (e.g. `"ay`, `"ap`) |
| `"+y` / `"+p` | Yank / paste using system clipboard |

### Change & Replace
| Key | Description |
|---|---|
| `cc` / `S` | Change entire line / sub-line (clears content and enters Insert Mode) |
| `C` (`Shift+C`) | Change from cursor to the end of the line / sub-line |
| `c{motion}` | Change text covered by `{motion}` (e.g. `cw`, `ciw`, `c$`) |
| `s` | Substitute single character under cursor and enter Insert Mode |
| `r{char}` | Replace single character under cursor with `{char}` |
| `~` | Toggle case of character under cursor and advance |

### Undo, Redo & Indentation
| Key | Description |
|---|---|
| `u` | Undo last transaction / edit |
| <kbd>Ctrl</kbd> + <kbd>r</kbd> | Redo last undone transaction / edit |
| `>>` | Indent current list item / block |
| `<<` | Outdent current list item / block |
| `>` (in Visual Mode) | Indent visual selection |
| `<` (in Visual Mode) | Outdent visual selection |
| `.` | Repeat the last edit command |

---

## 5. Text Objects

Used with operators like `d`, `c`, `y`, `v` (e.g., `ciw`, `da(`, `yib`):

| Object | Inner (`i`) | A / Around (`a`) |
|---|---|---|
| Word | `iw` (word without whitespace) | `aw` (word including trailing whitespace) |
| Big Word | `iW` (non-whitespace sequence) | `aW` (non-whitespace sequence with space) |
| Double Quotes | `i"` (content inside `""`) | `a"` (content including quotes `""`) |
| Single Quotes | `i'` (content inside `''`) | `a'` (content including quotes `''`) |
| Parentheses | `i(` / `ib` (inside `()`) | `a(` / `ab` (including `()`) |
| Brackets | `i[` / `i]` (inside `[]`) | `a[` / `a]` (including `[]`) |
| Braces | `i{` / `iB` (inside `{}`) | `a{` / `aB` (including `{}`) |
| Angle Brackets | `i<` / `i>` (inside `<>`) | `a<` / `a>` (including `<>`) |

---

## 6. Search & Ex Commands

### Search
| Command | Description |
|---|---|
| `/{pattern}` <kbd>Enter</kbd> | Search forward for `{pattern}` across the document |
| `?{pattern}` <kbd>Enter</kbd> | Search backward for `{pattern}` across the document |
| `n` | Repeat search forward to the next match |
| `N` | Repeat search backward to the previous match |
| `*` | Search forward for the word currently under the cursor |
| `#` | Search backward for the word currently under the cursor |

### Ex Commands
Type `:` in Normal Mode to open the command bar at the bottom:

| Ex Command | Description |
|---|---|
| `:w` | Save / trigger sync notification |
| `:q` | Close current document tab |
| `:wq` | Save and close current document tab |
| `:x` | Save and close current document tab |
| `:{number}` | Jump directly to block / line `{number}` |
