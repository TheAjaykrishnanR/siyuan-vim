/**
 * 键盘事件转换为 Vim 键位字符串
 */
export const keyboardEventToVimKey = (event: KeyboardEvent): string => {
    const key = event.key;

    // 处理功能键与特殊键
    if (key === "Escape") {
        return "<Esc>";
    }
    if (key === "Enter") {
        return event.shiftKey ? "<S-CR>" : "<CR>";
    }
    if (key === "Backspace") {
        if (event.ctrlKey) {
            return "<C-BS>";
        }
        if (event.shiftKey) {
            return "<S-BS>";
        }
        return "<BS>";
    }
    if (key === "Tab") {
        return event.shiftKey ? "<S-Tab>" : "<Tab>";
    }
    if (key === "Delete") {
        return "<Del>";
    }
    if (key === "Insert") {
        return "<Ins>";
    }
    if (key === "Home") {
        return "<Home>";
    }
    if (key === "End") {
        return "<End>";
    }
    if (key === "PageUp") {
        return "<PageUp>";
    }
    if (key === "PageDown") {
        return "<PageDown>";
    }
    if (key === "ArrowLeft") {
        return event.shiftKey ? "<S-Left>" : "<Left>";
    }
    if (key === "ArrowRight") {
        return event.shiftKey ? "<S-Right>" : "<Right>";
    }
    if (key === "ArrowUp") {
        return event.shiftKey ? "<S-Up>" : "<Up>";
    }
    if (key === "ArrowDown") {
        return event.shiftKey ? "<S-Down>" : "<Down>";
    }
    if (key === " ") {
        if (event.ctrlKey) {
            return "<C-Space>";
        }
        if (event.shiftKey) {
            return "<S-Space>";
        }
        return "<Space>";
    }

    // 处理 Ctrl 组合键
    if (event.ctrlKey) {
        if (key === "[") {
            return "<C-[>";
        }
        if (key === "]") {
            return "<C-]>";
        }
        if (key.length === 1) {
            const lower = key.toLowerCase();
            if (event.shiftKey) {
                return `<C-S-${lower}>`;
            }
            return `<C-${lower}>`;
        }
    }

    // 处理 Alt 组合键
    if (event.altKey && key.length === 1) {
        return `<A-${key}>`;
    }

    // 单字符直接返回
    if (key.length === 1) {
        return key;
    }

    return "";
};
