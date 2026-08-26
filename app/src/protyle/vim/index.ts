import {initVim} from "./core/vim.js";
import {createCMMock} from "./cmMock";
import {ProtyleVimAdapter} from "./adapter";
import {keyboardEventToVimKey} from "./keymap";
import {updateVimStatus} from "./status";
import {insertEmptyBlock} from "../../block/util";
import {hasClosestBlock} from "../util/hasClosest";
import {getTopAloneElement} from "../wysiwyg/getBlock";
import {getEditorRange} from "../util/selection";
import {Constants} from "../../constants";
import {showMessage} from "../../dialog/message";

export const Vim = initVim(createCMMock());

// 注册常用 Ex 命令
Vim.defineEx("write", "w", () => {
    showMessage(window.siyuan?.languages?.save || "Saved");
});

Vim.defineEx("quit", "q", (cm: any) => {
    try {
        const tab = cm?.protyle?.model?.parent;
        if (tab && tab.parent && typeof tab.parent.removeTab === "function") {
            tab.parent.removeTab(tab.id, true);
        }
    } catch (e) {
        console.warn("[SiYuan Vim] :q failed to close tab:", e);
    }
});

Vim.defineEx("wq", "wq", (cm: any) => {
    showMessage(window.siyuan?.languages?.save || "Saved");
    try {
        const tab = cm?.protyle?.model?.parent;
        if (tab && tab.parent && typeof tab.parent.removeTab === "function") {
            tab.parent.removeTab(tab.id, true);
        }
    } catch (e) {
        console.warn("[SiYuan Vim] :wq failed to close tab:", e);
    }
});

Vim.defineEx("x", "x", (cm: any) => {
    showMessage(window.siyuan?.languages?.save || "Saved");
    try {
        const tab = cm?.protyle?.model?.parent;
        if (tab && tab.parent && typeof tab.parent.removeTab === "function") {
            tab.parent.removeTab(tab.id, true);
        }
    } catch (e) {
        console.warn("[SiYuan Vim] :x failed to close tab:", e);
    }
});

/**
 * 检查 Vim 模式是否已启用（默认启用，可通过 localStorage 配置）
 */
export const isVimEnabled = (): boolean => {
    try {
        const val = localStorage.getItem("siyuan-vim-enabled");
        return val !== "false";
    } catch {
        return true;
    }
};

/**
 * 切换 Vim 模式开关
 */
export const toggleVimMode = (enable?: boolean): boolean => {
    const next = typeof enable === "boolean" ? enable : !isVimEnabled();
    try {
        localStorage.setItem("siyuan-vim-enabled", next ? "true" : "false");
    } catch (e) {
        console.error("[SiYuan Vim] Failed to save vim mode:", e);
    }
    console.log("[SiYuan Vim] Vim mode set to:", next);
    if (!next) {
        updateVimStatus("");
        document.querySelectorAll(".protyle-wysiwyg--vim-normal, .protyle-wysiwyg--vim-insert").forEach((el) => {
            el.classList.remove("protyle-wysiwyg--vim-normal", "protyle-wysiwyg--vim-insert");
        });
    } else {
        updateVimStatus("normal");
        document.querySelectorAll(".protyle-wysiwyg").forEach((el) => {
            el.classList.add("protyle-wysiwyg--vim-normal");
        });
    }
    return next;
};

// 挂载到全局以供快捷调用或插件扩展
if (typeof window !== "undefined") {
    (window as any).toggleVim = toggleVimMode;
    (window as any).Vim = Vim;
}

/**
 * 为 Protyle 编辑器实例初始化 Vim 模式
 */
export const initProtyleVim = (protyle: IProtyle, wysiwygElement: HTMLElement) => {
    if (!protyle || !wysiwygElement) {
        return;
    }
    if (protyle.disabled || protyle.options?.action?.includes(Constants.CB_GET_HISTORY)) {
        return;
    }

    try {
        console.log("[SiYuan Vim] Initializing Vim for Protyle editor instance:", protyle);
        const adapter = new ProtyleVimAdapter(protyle);
        Vim.maybeInitVimState_(adapter);

        if (isVimEnabled()) {
            wysiwygElement.classList.add("protyle-wysiwyg--vim-normal");
            updateVimStatus("normal");
        }

        const handleKeyDown = async (event: KeyboardEvent) => {
            if (!isVimEnabled()) {
                return;
            }

            // 命令/搜索输入框激活时完全跳过 Vim 键盘拦截
            if (adapter.dialogOpen) {
                return;
            }

            const vimState = adapter.state?.vim;
            if (!vimState) {
                return;
            }

            // 0. Shift+Enter / Ctrl+Enter / Cmd+Enter：跳出当前块并在下方/上方插入新内容块（支持 Insert/Normal 模式）
            if (event.key === "Enter" && (event.shiftKey || event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();

                const range = getEditorRange(protyle.wysiwyg.element);
                const curPos = adapter.getCursor();
                const currentBlock = (range ? hasClosestBlock(range.startContainer) : null) || 
                                     adapter.getBlockAtIndex(curPos.line) || 
                                     (protyle.wysiwyg.element.firstElementChild as HTMLElement);
                const targetBlock = currentBlock ? (getTopAloneElement(currentBlock) || currentBlock) : undefined;
                const position = (event.shiftKey && (event.ctrlKey || event.metaKey)) ? "beforebegin" : "afterend";

                await insertEmptyBlock(protyle, position, targetBlock);

                Vim.handleKey(adapter, "i", "mapping");
                updateVimStatus("insert");
                wysiwygElement.classList.remove("protyle-wysiwyg--vim-normal");
                wysiwygElement.classList.add("protyle-wysiwyg--vim-insert");
                return;
            }

            // 1. Insert 模式：只拦截退出键（Esc / Ctrl+[）
            if (vimState.insertMode) {
                if (event.key === "Escape" || (event.key === "[" && event.ctrlKey)) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    Vim.handleKey(adapter, "<Esc>", "mapping");
                    updateVimStatus("normal");
                    wysiwygElement.classList.add("protyle-wysiwyg--vim-normal");
                    wysiwygElement.classList.remove("protyle-wysiwyg--vim-insert");
                    // Enter Normal mode: update the cursor to block style
                    const currentPos = adapter.getCursor();
                    adapter.setCursor(currentPos);
                    return;
                }
                // 其他字符放行给 SiYuan 原生 contenteditable 与 keydown.ts
                return;
            }

            // 2. Normal 模式下的特殊结构快捷键增强（o / O）
            if (!vimState.visualMode && !vimState.inputState?.operator) {
                const range = getEditorRange(protyle.wysiwyg.element);
                const curPos = adapter.getCursor();
                const currentBlock = (range ? hasClosestBlock(range.startContainer) : null) || 
                                     adapter.getBlockAtIndex(curPos.line) || 
                                     (protyle.wysiwyg.element.firstElementChild as HTMLElement);
                const isCodeBlock = currentBlock?.getAttribute("data-type") === "NodeCodeBlock";

                // 在非代码块中，o/O 插入新内容块并进入 Insert 模式；代码块中由 Vim 引擎处理子行插入
                if (!isCodeBlock) {
                    if (event.key === "o" && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
                        event.preventDefault();
                        event.stopPropagation();
                        event.stopImmediatePropagation();
                        const targetBlock = currentBlock ? (getTopAloneElement(currentBlock) || currentBlock) : undefined;
                        await insertEmptyBlock(protyle, "afterend", targetBlock);
                        Vim.handleKey(adapter, "i", "mapping");
                        updateVimStatus("insert");
                        wysiwygElement.classList.remove("protyle-wysiwyg--vim-normal");
                        wysiwygElement.classList.add("protyle-wysiwyg--vim-insert");
                        return;
                    }
                    if (event.key === "O" && !event.ctrlKey && !event.altKey && !event.metaKey && event.shiftKey) {
                        event.preventDefault();
                        event.stopPropagation();
                        event.stopImmediatePropagation();
                        const targetBlock = currentBlock ? (getTopAloneElement(currentBlock) || currentBlock) : undefined;
                        await insertEmptyBlock(protyle, "beforebegin", targetBlock);
                        Vim.handleKey(adapter, "i", "mapping");
                        updateVimStatus("insert");
                        wysiwygElement.classList.remove("protyle-wysiwyg--vim-normal");
                        wysiwygElement.classList.add("protyle-wysiwyg--vim-insert");
                        return;
                    }
                }
            }

            // 3. Normal / Visual 模式：拦截所有按键送入 Vim 引擎
            const vimKey = keyboardEventToVimKey(event);
            if (!vimKey) {
                return;
            }

            // Let Vim process the key first
            const isHandled = Vim.handleKey(adapter, vimKey, "mapping");

            // We want to prevent default for ALL single character keys in Normal/Visual mode 
            // so they don't get typed into the editor.
            // But we SHOULD NOT prevent default for unmapped modifier combos (like Ctrl+Shift+I).
            const isModifierCombo = event.ctrlKey || event.altKey || event.metaKey;
            
            if (isHandled || (!isModifierCombo && (!vimState.insertMode || vimState.visualMode))) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
            }

            // 同步更新状态栏提示及光标样式
            const currentVim = adapter.state?.vim;
            if (!currentVim) {
                return;
            }
            if (currentVim.insertMode) {
                updateVimStatus("insert");
                wysiwygElement.classList.remove("protyle-wysiwyg--vim-normal");
                wysiwygElement.classList.add("protyle-wysiwyg--vim-insert");
            } else if (currentVim.visualMode) {
                const subMode = currentVim.visualLine ? "linewise" : (currentVim.visualBlock ? "blockwise" : "");
                updateVimStatus("visual", subMode);
            } else {
                updateVimStatus("normal");
                wysiwygElement.classList.add("protyle-wysiwyg--vim-normal");
                wysiwygElement.classList.remove("protyle-wysiwyg--vim-insert");
            }
        };

        wysiwygElement.addEventListener("keydown", handleKeyDown, {capture: true});

        return adapter;
    } catch (err) {
        console.error("[SiYuan Vim] Failed to initialize Protyle Vim:", err);
    }
};
