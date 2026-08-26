import {focusByOffset, getEditorRange, getSelectionOffset} from "../util/selection";
import {getContenteditableElement, isNotEditBlock, isContainerBlock, getTopAloneElement} from "../wysiwyg/getBlock";
import {hasClosestBlock} from "../util/hasClosest";
import {transaction, updateTransaction} from "../wysiwyg/transaction";
import {genEmptyElement, insertEmptyBlock} from "../../block/util";
import {Constants} from "../../constants";
import {highlightRender} from "../render/highlightRender";
import {setFold} from "../util/blockFold";
import {listIndent, listOutdent} from "../wysiwyg/list";
import type {Pos, CM5EditorInterface, CM5RangeInterface, Marker, LineHandle} from "./core/types";

type AnyFunction = (...args: any[]) => any;

/**
 * 将 SiYuan Protyle WYSIWYG 编辑器适配为 CodeMirror Vim 引擎所需要的 CM5EditorInterface
 */
export class ProtyleVimAdapter implements CM5EditorInterface {
    public protyle: IProtyle;
    public state: any = {
        vim: null,
    };
    public curOp: any = {isVimOp: true};
    public marks: Record<string, Marker> = {};
    public $mid = 0;
    public $lastChangeEndOffset = 0;
    public $lineHandleChanges: any[] | undefined = undefined;
    public virtualSelection: any = null;
    public lastCursor: Pos = {line: 0, ch: 0};
    public options: any = {
        tabSize: 4,
        indentUnit: 4,
        indentWithTabs: false,
    };
    public _handlers: Record<string, AnyFunction[]> = {};
    public _selections: {anchor: Pos; head: Pos}[] = [];
    public cm6: any = null;

    constructor(protyle: IProtyle) {
        this.protyle = protyle;
    }

    /**
     * 获取编辑器中所有可编辑的内容块
     */
    public getEditableBlocks(): HTMLElement[] {
        if (!this.protyle?.wysiwyg?.element) {
            return [];
        }
        const blocks = Array.from(
            this.protyle.wysiwyg.element.querySelectorAll<HTMLElement>("[data-node-id]"),
        ).filter((el) => {
            if (isNotEditBlock(el) || isContainerBlock(el)) {
                return false;
            }
            return true;
        });
        return blocks;
    }

    public getBlockAtIndex(index: number): HTMLElement | null {
        const blocks = this.getEditableBlocks();
        if (index < 0 || index >= blocks.length) {
            return null;
        }
        return blocks[index];
    }

    public getIndexOfBlock(block: HTMLElement): number {
        const blocks = this.getEditableBlocks();
        return blocks.indexOf(block);
    }

    public getBlockText(block: HTMLElement): string {
        const editElement = getContenteditableElement(block) || block;
        let text = "";
        
        const searchNode = (
            container: Node,
            startNode: Node,
            predicate: (node: Node) => boolean,
            excludeSibling?: boolean,
        ): boolean => {
            if (!startNode) {
                return false;
            }
            if (predicate(startNode as Text)) {
                return true;
            }
            for (let i = 0, len = startNode.childNodes.length; i < len; i++) {
                if (searchNode(startNode, startNode.childNodes[i], predicate, true)) {
                    return true;
                }
            }
            if (!excludeSibling) {
                let parentNode = startNode;
                while (parentNode && parentNode !== container) {
                    let nextSibling = parentNode.nextSibling;
                    while (nextSibling) {
                        if (searchNode(container, nextSibling, predicate, true)) {
                            return true;
                        }
                        nextSibling = nextSibling.nextSibling;
                    }
                    parentNode = parentNode.parentNode;
                }
            }
            return false;
        };

        searchNode(editElement, editElement.firstChild, (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                text += (node as Text).data;
            } else if (node.nodeType === Node.ELEMENT_NODE &&
                ((node as Element).tagName === "BR" || (node as Element).classList.contains("emoji"))) {
                text += (node as Element).tagName === "BR" ? "\n" : "*";
            }
            return false;
        });

        return text;
    }

    // ==================== CM5EditorInterface 核心接口实现 ====================

    public operation<T>(fn: () => T): T {
        const oldOp = this.curOp;
        this.curOp = {isVimOp: true};
        try {
            return fn();
        } finally {
            this.curOp = oldOp || {isVimOp: true};
        }
    }

    public forEachSelection(f: AnyFunction): void {
        f();
    }

    public lineCount(): number {
        const count = this.getEditableBlocks().length;
        return Math.max(1, count);
    }

    public firstLine(): number {
        return 0;
    }

    public lastLine(): number {
        return Math.max(0, this.lineCount() - 1);
    }

    public getLine(row: number): string {
        const block = this.getBlockAtIndex(row);
        return block ? this.getBlockText(block) : "";
    }

    public getLineHandle(row: number): LineHandle {
        return {row, index: row};
    }

    public getLineNumber(handle: any): number | null {
        return typeof handle?.row === "number" ? handle.row : null;
    }

    public releaseLineHandles(): void {
        // 无需释放
    }

    public getCursor(p?: "head" | "anchor" | "start" | "end"): Pos {
        // 搜索/Ex 输入框获得焦点后，getEditorRange 会强制焦点回到编辑器。
        // 命令栏期间使用打开前保存的光标位置，避免增量搜索抢走输入焦点。
        if (this.dialogOpen) {
            return {...this.lastCursor};
        }
        const range = getEditorRange(this.protyle.wysiwyg.element);
        if (!range) {
            return {...this.lastCursor};
        }
        const container = p === "head" || p === "end" ? range.endContainer : range.startContainer;
        const block = (hasClosestBlock(container) || this.getBlockAtIndex(0)) as HTMLElement;
        if (!block) {
            return {line: 0, ch: 0};
        }
        const blockIdx = this.getIndexOfBlock(block);
        if (blockIdx === -1) {
            return {...this.lastCursor};
        }
        const line = blockIdx;
        const editElement = getContenteditableElement(block) || block;
        const offset = getSelectionOffset(editElement, this.protyle.wysiwyg.element, range);
        this.lastCursor = {
            line,
            ch: p === "head" || p === "end" ? offset.end : offset.start,
        };
        return {...this.lastCursor};
    }

    public setCursor(lineOrPos: number | Pos, ch?: number): void {
        let line = 0;
        let col = 0;
        if (typeof lineOrPos === "number") {
            line = lineOrPos;
            col = ch ?? 0;
        } else if (lineOrPos) {
            line = lineOrPos.line;
            col = lineOrPos.ch;
        }

        const block = this.getBlockAtIndex(line);
        if (!block) {
            return;
        }

        const editElement = getContenteditableElement(block) || block;
        const textLength = this.getBlockText(block).length;
        const targetCol = Math.min(Math.max(0, col), textLength);

        this.lastCursor = {line, ch: targetCol};
        focusByOffset(block, targetCol, targetCol, true);
        (editElement as HTMLElement)?.focus?.();
        block.scrollIntoView({block: "nearest", inline: "nearest"});
    }

    public listSelections(): {anchor: Pos; head: Pos}[] {
        if (this._selections && this._selections.length > 0) {
            return this._selections;
        }
        const anchor = this.getCursor("anchor");
        const head = this.getCursor("head");
        return [{anchor, head}];
    }

    public setSelections(p: CM5RangeInterface[], primIndex?: number): void {
        if (!p || p.length === 0) {
            this._selections = [];
            return;
        }
        this._selections = p.map((item) => ({anchor: item.anchor, head: item.head}));
        const primary = p[primIndex ?? 0] || p[0];
        this.setSelection(primary.anchor, primary.head);
    }

    public setSelection(anchor: Pos, head: Pos): void {
        this._selections = [{anchor, head}];
        const startLine = Math.min(anchor.line, head.line);
        const endLine = Math.max(anchor.line, head.line);
        const startBlock = this.getBlockAtIndex(startLine);
        const endBlock = this.getBlockAtIndex(endLine);

        const allBlocks = this.getEditableBlocks();
        allBlocks.forEach(b => b.classList.remove("protyle-wysiwyg--select"));

        if (!startBlock || !endBlock) {
            return;
        }

        if (this.state?.vim?.visualMode) {
            for (let i = startLine; i <= endLine; i++) {
                if (allBlocks[i]) {
                    allBlocks[i].classList.add("protyle-wysiwyg--select");
                }
            }
        }

        const startEdit = getContenteditableElement(startBlock) || startBlock;
        const endEdit = getContenteditableElement(endBlock) || endBlock;

        const startCh = anchor.line < head.line ? anchor.ch : (anchor.line === head.line ? Math.min(anchor.ch, head.ch) : head.ch);
        const endCh = anchor.line > head.line ? anchor.ch : (anchor.line === head.line ? Math.max(anchor.ch, head.ch) : head.ch);

        if (startBlock === endBlock) {
            focusByOffset(startEdit, startCh, endCh, true);
        } else {
            const startRange = focusByOffset(startEdit, startCh, startCh, false) as Range;
            const endRange = focusByOffset(endEdit, endCh, endCh, false) as Range;
            if (startRange && endRange) {
                const selection = getSelection();
                selection.removeAllRanges();
                const combinedRange = document.createRange();
                combinedRange.setStart(startRange.startContainer, startRange.startOffset);
                combinedRange.setEnd(endRange.endContainer, endRange.endOffset);
                selection.addRange(combinedRange);
            }
        }
    }

    public somethingSelected(): boolean {
        if (this._selections && this._selections.length > 0) {
            const sel = this._selections[0];
            if (sel.anchor.line !== sel.head.line || sel.anchor.ch !== sel.head.ch) {
                return true;
            }
        }
        const selection = getSelection();
        return !!(selection && selection.rangeCount > 0 && !selection.getRangeAt(0).collapsed);
    }

    public getSelection(): string {
        if (this._selections && this._selections.length > 0) {
            return this.getSelections().join("\n");
        }
        const selection = getSelection();
        return selection ? selection.toString() : "";
    }

    public getSelections(): string[] {
        if (this._selections && this._selections.length > 0) {
            return this._selections.map((sel) => this.getRange(sel.anchor, sel.head));
        }
        return [this.getSelection()];
    }

    public getRange(s: Pos, e: Pos): string {
        const startLine = Math.min(s.line, e.line);
        const endLine = Math.max(s.line, e.line);
        const startCh = s.line < e.line ? s.ch : (s.line === e.line ? Math.min(s.ch, e.ch) : e.ch);
        const endCh = s.line > e.line ? s.ch : (s.line === e.line ? Math.max(s.ch, e.ch) : e.ch);

        if (startLine === endLine) {
            const lineText = this.getLine(startLine);
            return lineText.substring(startCh, endCh);
        }
        const lines: string[] = [];
        for (let i = startLine; i <= endLine; i++) {
            const lineText = this.getLine(i);
            if (i === startLine) {
                lines.push(lineText.substring(startCh));
            } else if (i === endLine) {
                lines.push(lineText.substring(0, endCh));
            } else {
                lines.push(lineText);
            }
        }
        return lines.join("\n");
    }

    public replaceRange(text: string, s: Pos, e?: Pos): void {
        const endPos = e || s;
        let startLine = Math.min(s.line, endPos.line);
        let endLine = Math.max(s.line, endPos.line);
        let startCh = s.line < endPos.line ? s.ch : (s.line === endPos.line ? Math.min(s.ch, endPos.ch) : endPos.ch);
        let endCh = s.line > endPos.line ? s.ch : (s.line === endPos.line ? Math.max(s.ch, endPos.ch) : endPos.ch);

        const allBlocks = this.getEditableBlocks();
        if (allBlocks.length === 0) {
            return;
        }

        if (startLine >= allBlocks.length) {
            startLine = allBlocks.length - 1;
            startCh = this.getBlockText(allBlocks[startLine]).length;
        }
        if (endLine >= allBlocks.length) {
            endLine = allBlocks.length - 1;
            endCh = this.getBlockText(allBlocks[endLine]).length;
        }

        // 1. 同一块内文字替换
        if (startLine === endLine) {
            const block = allBlocks[startLine];
            if (!block) {
                return;
            }
            const editElement = getContenteditableElement(block) || block;
            const oldHTML = block.outerHTML;
            const lineText = this.getBlockText(block);

            // 行删除需删除整个内容块，而不是只清空文本。单块文档的 dd 会落入同一块替换分支。
            const isLinewiseDelete = text === "" && startCh === 0 &&
                (endCh === 0 || endCh >= lineText.length) &&
                this.state?.vim?.inputState?.operator === "delete" &&
                this.state?.vim?.inputState?.operatorArgs?.linewise;
            if (isLinewiseDelete) {
                    const targetDeleteBlock = getTopAloneElement(block);
                    const doOperations: IOperation[] = [];
                    const undoOperations: IOperation[] = [];
                    const blockID = targetDeleteBlock.getAttribute("data-node-id");
                    doOperations.push({action: "delete", id: blockID});
                    undoOperations.push({
                        action: "insert",
                        id: blockID,
                        data: targetDeleteBlock.outerHTML,
                        previousID: targetDeleteBlock.previousElementSibling?.getAttribute("data-node-id"),
                        parentID: targetDeleteBlock.parentElement?.getAttribute("data-node-id") || this.protyle.block.rootID,
                    });
                    targetDeleteBlock.remove();
                    
                    if (allBlocks.length === 1) {
                        const newId = Lute.NewNodeID();
                        const newElement = genEmptyElement(false, false, newId);
                        this.protyle.wysiwyg.element.appendChild(newElement);
                        doOperations.push({
                            action: "insert",
                            id: newId,
                            data: newElement.outerHTML,
                            parentID: this.protyle.block.id,
                        });
                        undoOperations.push({action: "delete", id: newId});
                    }
                    transaction(this.protyle, doOperations, undoOperations);
                    this.setCursor(Math.max(0, startLine - 1), 0);
                    return;
            }

            // 代码块内的文本替换与删除（如代码块内 dd 删除单行、普通删除、修改等）
            if (block.getAttribute("data-type") === "NodeCodeBlock") {
                const oldCode = editElement.textContent || "";
                const newCode = oldCode.substring(0, startCh) + text + oldCode.substring(endCh);
                editElement.textContent = newCode;
                editElement.parentElement?.removeAttribute("data-render");
                highlightRender(block);
                updateTransaction(this.protyle, block, oldHTML);
                this.setCursor(startLine, startCh + text.length);
                return;
            }

            // 若插入文本包含换行符（如回车换行或多行粘贴），拆分并创建新内容块
            if (text.includes("\n")) {
                const lines = text.split("\n");
                const prefix = lineText.substring(0, startCh);
                const suffix = lineText.substring(endCh);

                editElement.textContent = prefix + lines[0];
                updateTransaction(this.protyle, block, oldHTML);

                const doOperations: IOperation[] = [];
                const undoOperations: IOperation[] = [];
                let prevBlock = block;
                for (let i = 1; i < lines.length; i++) {
                    const lineContent = (i === lines.length - 1) ? lines[i] + suffix : lines[i];
                    const newId = Lute.NewNodeID();
                    const newBlock = genEmptyElement(false, false, newId);
                    const newEdit = getContenteditableElement(newBlock) || newBlock;
                    newEdit.textContent = lineContent;
                    prevBlock.after(newBlock);
                    doOperations.push({
                        action: "insert",
                        id: newId,
                        data: newBlock.outerHTML,
                        previousID: prevBlock.getAttribute("data-node-id"),
                        parentID: prevBlock.parentElement?.getAttribute("data-node-id"),
                    });
                    undoOperations.push({
                        action: "delete",
                        id: newId,
                    });
                    prevBlock = newBlock;
                }
                if (doOperations.length > 0) {
                    transaction(this.protyle, doOperations, undoOperations);
                }
                this.setCursor(startLine + lines.length - 1, lines[lines.length - 1].length);
                return;
            }

            const range = focusByOffset(block, startCh, endCh, false) as Range;
            if (range) {
                range.deleteContents();
                if (text) {
                    const textNode = document.createTextNode(text);
                    range.insertNode(textNode);
                    range.setStartAfter(textNode);
                    range.collapse(true);
                }
                updateTransaction(this.protyle, block, oldHTML);
                this.setCursor(startLine, startCh + text.length);
            }
            return;
        }

        // 2. 跨块删除与整行删除（如 dd、V 行可视模式 d/x 等）
        const startBlock = allBlocks[startLine];
        const endBlock = allBlocks[endLine];
        if (!startBlock || !endBlock) {
            return;
        }

        const startLineText = this.getBlockText(startBlock);
        const endLineText = this.getBlockText(endBlock);

        // 检测是否为整行块删除（如 dd: startCh=0, endCh=0 或最后一行 dd）
        const isDdLastLine = (startLine === endLine - 1 && startCh === startLineText.length && endCh === endLineText.length && text === "");
        const isWholeBlocks = (startCh === 0 && endCh === 0 && text === "") ||
                              (startCh === 0 && endCh >= endLineText.length && text === "");

        if (isDdLastLine) {
            const targetDeleteBlock = getTopAloneElement(endBlock);
            const doOperations: IOperation[] = [];
            const undoOperations: IOperation[] = [];
            const blockID = targetDeleteBlock.getAttribute("data-node-id");
            doOperations.push({action: "delete", id: blockID});
            undoOperations.push({
                action: "insert",
                id: blockID,
                data: targetDeleteBlock.outerHTML,
                previousID: targetDeleteBlock.previousElementSibling?.getAttribute("data-node-id"),
                parentID: targetDeleteBlock.parentElement?.getAttribute("data-node-id") || this.protyle.block.rootID,
            });
            targetDeleteBlock.remove();
            transaction(this.protyle, doOperations, undoOperations);
            this.setCursor(startLine, 0);
            return;
        }

        if (isWholeBlocks) {
            const deleteUpTo = (endCh === 0 && endLine > startLine) ? endLine - 1 : endLine;
            const doOperations: IOperation[] = [];
            const undoOperations: IOperation[] = [];
            const remainingCount = allBlocks.length - (deleteUpTo - startLine + 1);

            const deletedIds = new Set<string>();
            for (let i = startLine; i <= deleteUpTo; i++) {
                const b = allBlocks[i];
                const targetDeleteBlock = getTopAloneElement(b);
                const blockID = targetDeleteBlock.getAttribute("data-node-id");
                if (deletedIds.has(blockID)) {
                    continue;
                }
                deletedIds.add(blockID);
                doOperations.push({action: "delete", id: blockID});
                undoOperations.push({
                    action: "insert",
                    id: blockID,
                    data: targetDeleteBlock.outerHTML,
                    previousID: targetDeleteBlock.previousElementSibling?.getAttribute("data-node-id"),
                    parentID: targetDeleteBlock.parentElement?.getAttribute("data-node-id") || this.protyle.block.rootID,
                });
                targetDeleteBlock.remove();
            }

            if (remainingCount === 0) {
                const newId = Lute.NewNodeID();
                const newElement = genEmptyElement(false, false, newId);
                this.protyle.wysiwyg.element.appendChild(newElement);
                doOperations.push({
                    action: "insert",
                    id: newId,
                    data: newElement.outerHTML,
                    parentID: this.protyle.block.id,
                });
                undoOperations.push({action: "delete", id: newId});
            }

            transaction(this.protyle, doOperations, undoOperations);
            const targetLine = Math.min(startLine, this.lineCount() - 1);
            this.setCursor(Math.max(0, targetLine), 0);
            return;
        }

        // 跨块部分选中删除并拼接剩余内容
        const doOperations: IOperation[] = [];
        const undoOperations: IOperation[] = [];

        // 删除中间完整跨过的块
        for (let i = startLine + 1; i < endLine; i++) {
            const b = allBlocks[i];
            const blockID = b.getAttribute("data-node-id");
            doOperations.push({action: "delete", id: blockID});
            undoOperations.push({
                action: "insert",
                id: blockID,
                data: b.outerHTML,
                previousID: b.previousElementSibling?.getAttribute("data-node-id"),
                parentID: b.parentElement?.getAttribute("data-node-id"),
            });
            b.remove();
        }

        // 将 endBlock 剩余部分与 startBlock 拼接
        const startOldHTML = startBlock.outerHTML;
        const startEdit = getContenteditableElement(startBlock) || startBlock;
        const remainingEndText = endLineText.substring(endCh);
        const prefix = startLineText.substring(0, startCh);

        startEdit.textContent = prefix + text + remainingEndText;
        updateTransaction(this.protyle, startBlock, startOldHTML);

        // 删除 endBlock
        const endBlockID = endBlock.getAttribute("data-node-id");
        doOperations.push({action: "delete", id: endBlockID});
        undoOperations.push({
            action: "insert",
            id: endBlockID,
            data: endBlock.outerHTML,
            previousID: startBlock.getAttribute("data-node-id"),
            parentID: endBlock.parentElement?.getAttribute("data-node-id"),
        });
        endBlock.remove();

        if (doOperations.length > 0) {
            transaction(this.protyle, doOperations, undoOperations);
        }

        this.setCursor(startLine, (prefix + text).length);
    }

    public replaceSelection(text: string): void {
        if (this._selections && this._selections.length > 0) {
            this.replaceSelections([text]);
            return;
        }
        const range = getEditorRange(this.protyle.wysiwyg.element);
        if (!range) {
            return;
        }
        const block = hasClosestBlock(range.startContainer) as HTMLElement;
        if (!block) {
            return;
        }
        const oldHTML = block.outerHTML;
        range.deleteContents();
        if (text) {
            const textNode = document.createTextNode(text);
            range.insertNode(textNode);
            range.setStartAfter(textNode);
            range.collapse(true);
        }
        updateTransaction(this.protyle, block, oldHTML);
    }

    public replaceSelections(replacements: string[]): void {
        if (this._selections && this._selections.length > 0) {
            const sels = [...this._selections];
            sels.sort((a, b) => Math.max(b.anchor.line, b.head.line) - Math.max(a.anchor.line, a.head.line));
            for (let i = 0; i < sels.length; i++) {
                const sel = sels[i];
                const repl = i < replacements.length ? replacements[i] : (replacements[0] || "");
                this.replaceRange(repl, sel.anchor, sel.head);
            }
            this._selections = [];
            return;
        }
        if (replacements.length > 0) {
            this.replaceSelection(replacements[0]);
        }
    }

    public clipPos(p: Pos): Pos {
        const line = Math.min(Math.max(0, p.line), this.lineCount() - 1);
        const lineLength = this.getLine(line).length;
        const ch = Math.min(Math.max(0, p.ch), lineLength);
        return {line, ch};
    }

    public getValue(): string {
        const blocks = this.getEditableBlocks();
        return blocks.map((b) => this.getBlockText(b)).join("\n");
    }

    public setValue(): void {
        // 全局替换暂不触发
    }

    public focus(): void {
        this.protyle.wysiwyg.element.focus();
    }

    public blur(): void {
        this.protyle.wysiwyg.element.blur();
    }

    public defaultTextHeight(): number {
        return 24;
    }

    public foldCode(pos: Pos): void {
        const block = this.getBlockAtIndex(pos.line);
        if (block) {
            setFold(this.protyle, block);
        }
    }

    public indentLine(line: number, more?: boolean): void {
        const block = this.getBlockAtIndex(line);
        if (!block) {
            return;
        }
        const range = getEditorRange(this.protyle.wysiwyg.element) || document.createRange();
        if (more) {
            listIndent(this.protyle, [block], range);
        } else {
            listOutdent(this.protyle, [block], range);
        }
    }

    public indentMore(): void {
        const cursor = this.getCursor();
        this.indentLine(cursor.line, true);
    }

    public indentLess(): void {
        const cursor = this.getCursor();
        this.indentLine(cursor.line, false);
    }

    public execCommand(name: string): void {
        if (name === "undo") {
            this.protyle.undo?.undo(this.protyle);
        } else if (name === "redo") {
            this.protyle.undo?.redo(this.protyle);
        } else if (name === "newlineAndIndent") {
            insertEmptyBlock(this.protyle, "afterend");
        }
    }

    public indexFromPos(pos: Pos): number {
        let index = 0;
        for (let i = 0; i < pos.line; i++) {
            index += this.getLine(i).length + 1;
        }
        return index + pos.ch;
    }

    public posFromIndex(offset: number): Pos {
        let remaining = offset;
        for (let i = 0; i < this.lineCount(); i++) {
            const length = this.getLine(i).length;
            if (remaining <= length) {
                return {line: i, ch: remaining};
            }
            remaining -= length + 1;
        }
        return {line: this.lastLine(), ch: this.getLine(this.lastLine()).length};
    }

    public findMatchingBracket(): {to: Pos | undefined} {
        return {to: undefined};
    }

    public scanForBracket(): any {
        return null;
    }

    public getInputField(): HTMLElement {
        return this.protyle.wysiwyg.element;
    }

    public getWrapperElement(): HTMLElement {
        return this.protyle.wysiwyg.element;
    }

    public getMode(): {name: string} {
        return {name: "markdown"};
    }

    public setSize(): void {
        // 无需调整
    }

    public refresh(): void {
        // 无需刷新
    }

    public destroy(): void {
        this._handlers = {};
    }

    public getLastEditEnd(): Pos {
        return this.getCursor();
    }

    public setBookmark(cursor: Pos, options?: {insertLeft: boolean}): Marker {
        const marker: Marker = {
            cm: this,
            id: ++this.$mid,
            offset: this.indexFromPos(cursor),
            assoc: options?.insertLeft ? -1 : 1,
            clear: () => {},
            find: () => cursor,
            update: () => {},
        };
        return marker;
    }

    public addOverlay(): any {}
    public removeOverlay(): void {}

    public getSearchCursor(query: RegExp | string, pos: Pos): {
        findNext: () => string[] | null | undefined;
        findPrevious: () => string[] | null | undefined;
        find: (back?: boolean) => string[] | null | undefined;
        from: () => Pos | undefined;
        to: () => Pos | undefined;
        replace: (text: string) => void;
        readonly match: string[] | null;
    } {
        let currentLine = pos ? pos.line : 0;
        let currentCh = pos ? pos.ch : 0;
        let lastMatch: string[] | null = null;
        let matchFrom: Pos | undefined;
        let matchTo: Pos | undefined;

        const regExp: RegExp = typeof query === "string" ? new RegExp(query, "i") : query;

        const findNextMatch = (): string[] | null => {
            const lineCount = this.lineCount();
            for (let l = currentLine; l < lineCount; l++) {
                const lineText = this.getLine(l);
                const startOffset = (l === currentLine) ? currentCh : 0;
                if (startOffset > lineText.length) {
                    continue;
                }
                const subText = lineText.substring(startOffset);
                const match = subText.match(regExp);
                if (match && typeof match.index === "number") {
                    const matchStart = startOffset + match.index;
                    const matchEnd = matchStart + (match[0].length || 1);
                    matchFrom = {line: l, ch: matchStart};
                    matchTo = {line: l, ch: matchEnd};
                    this.lastSearchMatch = { from: matchFrom, to: matchTo };
                    lastMatch = match;
                    currentLine = l;
                    currentCh = matchEnd;
                    return match;
                }
            }
            return null;
        };

        const findPrevMatch = (): string[] | null => {
            for (let l = currentLine; l >= 0; l--) {
                const lineText = this.getLine(l);
                const endOffset = (l === currentLine) ? currentCh : lineText.length;
                const subText = lineText.substring(0, endOffset);
                
                let bestMatch: RegExpMatchArray | null = null;
                let bestIndex = -1;
                
                if (regExp.global) {
                    regExp.lastIndex = 0;
                    let m: RegExpExecArray | null;
                    while ((m = regExp.exec(subText)) !== null) {
                        if (m.index + m[0].length <= endOffset) {
                            bestMatch = m;
                            bestIndex = m.index;
                        }
                        if (m.index === regExp.lastIndex) {
                            regExp.lastIndex++;
                        }
                    }
                } else {
                    const globalReg = new RegExp(regExp.source, regExp.flags.includes("g") ? regExp.flags : regExp.flags + "g");
                    let m: RegExpExecArray | null;
                    while ((m = globalReg.exec(subText)) !== null) {
                        if (m.index + m[0].length <= endOffset) {
                            bestMatch = m;
                            bestIndex = m.index;
                        }
                        if (m.index === globalReg.lastIndex) {
                            globalReg.lastIndex++;
                        }
                    }
                }

                if (bestMatch && bestIndex !== -1) {
                    const matchStart = bestIndex;
                    const matchEnd = bestIndex + (bestMatch[0].length || 1);
                    matchFrom = {line: l, ch: matchStart};
                    matchTo = {line: l, ch: matchEnd};
                    this.lastSearchMatch = { from: matchFrom, to: matchTo };
                    lastMatch = bestMatch;
                    currentLine = l;
                    currentCh = matchStart;
                    return bestMatch;
                }
            }
            return null;
        };

        const find = (back?: boolean): string[] | null => {
            if (back) {
                return findPrevMatch();
            } else {
                return findNextMatch();
            }
        };

        return {
            findNext: () => find(false),
            findPrevious: () => find(true),
            find: (back?: boolean) => find(back),
            from: (): Pos | undefined => matchFrom,
            to: (): Pos | undefined => matchTo,
            replace: (text: string): void => {
                if (matchFrom && matchTo) {
                    this.replaceRange(text, matchFrom, matchTo);
                }
            },
            get match() {
                return lastMatch;
            },
        };
    }

    public getSubLines(text: string): { text: string, start: number, end: number }[] {
        const lines = [];
        let start = 0;
        const parts = text.split("\n");
        if (parts.length > 1 && parts[parts.length - 1] === "") {
            parts.pop();
        }
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            lines.push({ text: part, start, end: start + part.length });
            start += part.length + 1;
        }
        if (lines.length === 0) {
            lines.push({ text: "", start: 0, end: 0 });
        }
        return lines;
    }

    public getSubLineIndex(subLines: { text: string, start: number, end: number }[], ch: number): number {
        for (let i = 0; i < subLines.length; i++) {
            if (ch >= subLines[i].start && ch <= subLines[i].end) return i;
        }
        return subLines.length - 1;
    }

    public findPosV(start: Pos, amount: number, _unit: "page" | "line", goalColumn?: number): Pos & {hitSide?: boolean} {
        let currentBlockIndex = start.line;
        let currentBlockText = this.getLine(currentBlockIndex);
        
        let subLines = this.getSubLines(currentBlockText);
        let currentSubLineIndex = this.getSubLineIndex(subLines, start.ch);

        let remainingAmount = amount;
        
        while (remainingAmount !== 0) {
            if (remainingAmount > 0) {
                if (currentSubLineIndex + remainingAmount < subLines.length) {
                    currentSubLineIndex += remainingAmount;
                    remainingAmount = 0;
                } else {
                    remainingAmount -= (subLines.length - 1 - currentSubLineIndex) + 1;
                    if (currentBlockIndex >= this.lastLine()) {
                        currentSubLineIndex = subLines.length - 1;
                        remainingAmount = 0;
                    } else {
                        currentBlockIndex++;
                        currentBlockText = this.getLine(currentBlockIndex);
                        subLines = this.getSubLines(currentBlockText);
                        currentSubLineIndex = 0;
                    }
                }
            } else {
                if (currentSubLineIndex + remainingAmount >= 0) {
                    currentSubLineIndex += remainingAmount;
                    remainingAmount = 0;
                } else {
                    remainingAmount += currentSubLineIndex + 1;
                    if (currentBlockIndex <= 0) {
                        currentSubLineIndex = 0;
                        remainingAmount = 0;
                    } else {
                        currentBlockIndex--;
                        currentBlockText = this.getLine(currentBlockIndex);
                        subLines = this.getSubLines(currentBlockText);
                        currentSubLineIndex = subLines.length - 1;
                    }
                }
            }
        }

        const targetSubLine = subLines[currentSubLineIndex];
        let visibleCol = 0;
        if (typeof goalColumn === "number") {
            visibleCol = goalColumn;
        } else {
            const startSubLines = this.getSubLines(this.getLine(start.line));
            const startSubLine = startSubLines[this.getSubLineIndex(startSubLines, start.ch)];
            visibleCol = this.getVisibleCol(startSubLine.text, start.ch - startSubLine.start);
        }
        
        const chInSubLine = this.getOffsetFromVisibleCol(targetSubLine.text, visibleCol);
        const ch = targetSubLine.start + chInSubLine;

        return {
            line: currentBlockIndex,
            ch,
            hitSide: (currentBlockIndex === 0 && currentSubLineIndex === 0) || 
                     (currentBlockIndex === this.lastLine() && currentSubLineIndex === subLines.length - 1)
        };
    }

    private getVisibleCol(subLineText: string, chInSubLine: number): number {
        let visible = 0;
        for (let i = 0; i < chInSubLine && i < subLineText.length; i++) {
            if (subLineText[i] !== Constants.ZWSP) {
                visible++;
            }
        }
        return visible;
    }

    private getOffsetFromVisibleCol(subLineText: string, visibleCol: number): number {
        let visible = 0;
        let i = 0;
        for (; i < subLineText.length; i++) {
            if (visible >= visibleCol) break;
            if (subLineText[i] !== Constants.ZWSP) {
                visible++;
            }
        }
        return i;
    }

    public charCoords(pos: Pos): {left: number; top: number; bottom: number} {
        const text = this.getLine(pos.line);
        const subLines = this.getSubLines(text);
        const subLineIdx = this.getSubLineIndex(subLines, pos.ch);
        const chInSubLine = pos.ch - subLines[subLineIdx].start;
        const col = this.getVisibleCol(subLines[subLineIdx].text, chInSubLine);
        return {left: col, top: subLineIdx, bottom: subLineIdx};
    }

    public coordsChar(): Pos {
        return this.getCursor();
    }

    public getScrollInfo(): {left: number; top: number; height: number; width: number; clientHeight: number; clientWidth: number} {
        const el = this.protyle.contentElement || this.protyle.wysiwyg.element;
        return {
            left: el.scrollLeft,
            top: el.scrollTop,
            height: el.scrollHeight,
            width: el.scrollWidth,
            clientHeight: el.clientHeight,
            clientWidth: el.clientWidth,
        };
    }

    public scrollTo(x?: number | null, y?: number | null): void {
        const el = this.protyle.contentElement || this.protyle.wysiwyg.element;
        if (typeof x === "number") {
            el.scrollLeft = x;
        }
        if (typeof y === "number") {
            el.scrollTop = y;
        }
    }

    public lastSearchMatch?: { from: Pos, to: Pos };

    public scrollIntoView(pos?: any): void {
        console.log("[Vim Adapter] scrollIntoView called with pos:", pos);
        if (!pos) {
            return;
        }
        let targetLine = -1;
        let fromPos: Pos | undefined;
        let toPos: Pos | undefined;

        if (typeof pos.line === "number") {
            targetLine = pos.line;
            fromPos = pos;
            toPos = pos;
            
            // vim.js incremental search passes a single pos instead of {from, to}.
            // We recover the true range from the last search match to highlight properly.
            if (this.lastSearchMatch && this.lastSearchMatch.from.line === pos.line && this.lastSearchMatch.from.ch === pos.ch) {
                toPos = this.lastSearchMatch.to;
            }
        } else if (pos.from && typeof pos.from.line === "number") {
            targetLine = pos.from.line;
            fromPos = pos.from;
            toPos = pos.to;
        }

        if (targetLine >= 0) {
            const block = this.getBlockAtIndex(targetLine);
            if (block) {
                console.log(`[Vim Adapter] scrollIntoView scrolling to block ${targetLine}`);
                block.scrollIntoView({block: "nearest", inline: "nearest"});
                
                if (fromPos && toPos && (fromPos.line !== toPos.line || fromPos.ch !== toPos.ch)) {
                    if (!this.dialogOpen) {
                        console.log("[Vim Adapter] scrollIntoView applying final selection (dialog is closed)");
                        // 如果不在对话框中，这是最终跳转，安全使用原生选区
                        this.setSelection(fromPos, toPos);
                    } else {
                        console.log("[Vim Adapter] scrollIntoView applying incremental highlight (dialog is open)");
                        // 在增量搜索阶段，我们不能使用原生 Selection API，因为在 contenteditable 中
                        // 设置选区会强制浏览器将焦点转移到编辑器，从而导致输入框失焦并瞬间关闭！
                        // 替代方案：高亮整个块，让用户知道匹配发生在哪里。
                        document.querySelectorAll(".protyle-wysiwyg--hl").forEach(el => el.classList.remove("protyle-wysiwyg--hl"));
                        block.classList.add("protyle-wysiwyg--hl");
                    }
                }
            } else {
                console.warn(`[Vim Adapter] scrollIntoView could not find block at line ${targetLine}`);
            }
        }
    }

    // 当前是否有命令/搜索对话框处于活动状态，用于阻止 Vim 键盘拦截
    public dialogOpen = false;

    public openDialog(template: string | Node, callback: (value: string) => void, options?: any): () => void {
        this.lastCursor = this.getCursor();

        // 移除任何旧的命令栏，防止重复出现
        document.body.querySelectorAll(".protyle-vim__dialog").forEach(el => el.remove());

        const dialog = document.createElement("div");
        dialog.className = "protyle-vim__dialog";
        dialog.style.cssText = [
            "position: fixed",
            "bottom: 0",
            "left: 0",
            "width: 100%",
            "background: var(--b3-theme-surface)",
            "border-top: 1px solid var(--b3-border-color)",
            "display: flex",
            "align-items: center",
            "padding: 0 8px",
            "z-index: 9999",
            "font-family: var(--b3-font-family-code)",
            "font-size: 14px",
            "box-sizing: border-box",
            "height: 30px"
        ].join(";");

        let prefix = "";
        if (typeof template === "string") {
            const tmp = document.createElement("div");
            tmp.innerHTML = template;
            prefix = tmp.querySelector("span")?.textContent || "";
        } else if (template instanceof Node) {
            prefix = (template as HTMLElement).querySelector?.("span")?.textContent || "";
        }

        const prefixSpan = document.createElement("span");
        prefixSpan.textContent = prefix;
        prefixSpan.style.marginRight = "4px";

        const input = document.createElement("input");
        input.type = "text";
        input.className = "vim-cmd-input b3-text-field b3-text-field--text";
        input.autocomplete = "off";
        input.spellcheck = false;
        input.style.cssText = [
            "flex: 1",
            "background: transparent",
            "border: none",
            "outline: none",
            "box-shadow: none",
            "color: var(--b3-theme-on-background)",
            "font-family: inherit",
            "padding: 0"
        ].join(";");

        dialog.appendChild(prefixSpan);
        dialog.appendChild(input);
        document.body.appendChild(dialog);

        this.dialogOpen = true;

        const closeDialog = () => {
            if (!this.dialogOpen) return;
            this.dialogOpen = false;
            dialog.remove();
            
            // 清理增量搜索时的块高亮
            document.querySelectorAll(".protyle-wysiwyg--hl").forEach(el => el.classList.remove("protyle-wysiwyg--hl"));
            
            this.protyle.wysiwyg.element.focus();
            if (options && options.onClose) {
                options.onClose(input);
            }
        };

        if (options && options.closeOnBlur !== false) {
            input.addEventListener("blur", () => {
                if (this.dialogOpen) {
                    if (options.onKeyDown) {
                        const escEvent = new KeyboardEvent("keydown", { key: "Escape" });
                        options.onKeyDown(escEvent, input.value, closeDialog);
                    }
                    closeDialog();
                }
            });
        }

        if (options && options.onInput) {
            input.addEventListener("input", (e: Event) => {
                options.onInput(e, input.value, closeDialog);
            });
        }

        if (options && options.onKeyUp) {
            input.addEventListener("keyup", (e: KeyboardEvent) => {
                e.stopPropagation();
                options.onKeyUp(e, input.value, closeDialog);
            });
        }

        input.addEventListener("keydown", (e: KeyboardEvent) => {
            e.stopPropagation();
            if (options && options.onKeyDown && options.onKeyDown(e, input.value, closeDialog)) {
                return;
            }
            if (e.key === "Escape" || (options.closeOnEnter !== false && e.key === "Enter")) {
                input.blur();
                e.preventDefault();
                closeDialog();
            }
            if (e.key === "Enter" && callback) {
                callback(input.value);
            }
        });

        if (options && options.value) {
            input.value = options.value;
        }

        input.focus({preventScroll: true});
        return closeDialog;
    }

    public openNotification(): () => void {
        return () => {};
    }

    public on(type: string, f: AnyFunction): void {
        if (!this._handlers[type]) {
            this._handlers[type] = [];
        }
        this._handlers[type].push(f);
    }

    public off(type: string, f: AnyFunction): void {
        if (this._handlers[type]) {
            this._handlers[type] = this._handlers[type].filter((h) => h !== f);
        }
    }

    public signal(type: string, e: any, handlers?: any): void {
        const arr = handlers || this._handlers[type];
        if (arr) {
            arr.forEach((h: AnyFunction) => h(e));
        }
    }

    public onChange(): void {}
    public onSelectionChange(): void {}
    public onBeforeEndOperation(): void {}
    public moveH(increment: number): void {
        const cur = this.getCursor();
        this.setCursor(cur.line, cur.ch + increment);
    }

    public setOption(name: string, val: any): void {
        this.options[name] = val;
    }

    public getOption(name: string): any {
        return this.options[name];
    }

    public toggleOverwrite(on: boolean): void {
        this.state.overwrite = on;
    }

    public getTokenTypeAt(): "" | "string" | "comment" {
        return "";
    }

    public overWriteSelection(text: string): void {
        this.replaceSelection(text);
    }

    public isInMultiSelectMode(): boolean {
        return false;
    }

    public virtualSelectionMode(): boolean {
        return false;
    }

    public hardWrap(): number {
        return 0;
    }
}
