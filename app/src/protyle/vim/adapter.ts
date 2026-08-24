import {focusByOffset, getEditorRange, getSelectionOffset} from "../util/selection";
import {getContenteditableElement, isNotEditBlock} from "../wysiwyg/getBlock";
import {hasClosestBlock} from "../util/hasClosest";
import {transaction, updateTransaction} from "../wysiwyg/transaction";
import {genEmptyElement, insertEmptyBlock} from "../../block/util";
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
            if (isNotEditBlock(el)) {
                return false;
            }
            // 过滤子属性容器及非文本容器
            const type = el.getAttribute("data-type");
            return type !== "NodeList" && type !== "NodeSuperBlock";
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
        return editElement.textContent || "";
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
        const range = getEditorRange(this.protyle.wysiwyg.element);
        if (!range) {
            return {line: 0, ch: 0};
        }
        const container = p === "head" || p === "end" ? range.endContainer : range.startContainer;
        const block = (hasClosestBlock(container) || this.getBlockAtIndex(0)) as HTMLElement;
        if (!block) {
            return {line: 0, ch: 0};
        }
        const blockIdx = this.getIndexOfBlock(block);
        const line = Math.max(0, blockIdx);
        const editElement = getContenteditableElement(block) || block;
        const offset = getSelectionOffset(editElement, this.protyle.wysiwyg.element, range);
        return {
            line,
            ch: p === "head" || p === "end" ? offset.end : offset.start,
        };
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
        const textLength = editElement.textContent?.length || 0;
        const targetCol = Math.min(Math.max(0, col), textLength);

        focusByOffset(editElement, targetCol, targetCol, true);
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

        if (!startBlock || !endBlock) {
            return;
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
        const startLine = Math.min(s.line, endPos.line);
        const endLine = Math.max(s.line, endPos.line);
        const startCh = s.line < endPos.line ? s.ch : (s.line === endPos.line ? Math.min(s.ch, endPos.ch) : endPos.ch);
        const endCh = s.line > endPos.line ? s.ch : (s.line === endPos.line ? Math.max(s.ch, endPos.ch) : endPos.ch);

        const allBlocks = this.getEditableBlocks();
        if (allBlocks.length === 0) {
            return;
        }

        // 1. 同一块内文字替换
        if (startLine === endLine) {
            const block = allBlocks[startLine];
            if (!block) {
                return;
            }
            const editElement = getContenteditableElement(block) || block;
            const oldHTML = block.outerHTML;

            // 若插入文本包含换行符（如回车换行或多行粘贴），拆分并创建新内容块
            if (text.includes("\n")) {
                const lines = text.split("\n");
                const lineText = this.getBlockText(block);
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

            const range = focusByOffset(editElement, startCh, endCh, false) as Range;
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
            const doOperations: IOperation[] = [];
            const undoOperations: IOperation[] = [];
            const blockID = endBlock.getAttribute("data-node-id");
            doOperations.push({action: "delete", id: blockID});
            undoOperations.push({
                action: "insert",
                id: blockID,
                data: endBlock.outerHTML,
                previousID: startBlock.getAttribute("data-node-id"),
                parentID: endBlock.parentElement?.getAttribute("data-node-id"),
            });
            endBlock.remove();
            transaction(this.protyle, doOperations, undoOperations);
            this.setCursor(startLine, 0);
            return;
        }

        if (isWholeBlocks) {
            const deleteUpTo = (endCh === 0 && endLine > startLine) ? endLine - 1 : endLine;
            const doOperations: IOperation[] = [];
            const undoOperations: IOperation[] = [];
            const remainingCount = allBlocks.length - (deleteUpTo - startLine + 1);

            for (let i = startLine; i <= deleteUpTo; i++) {
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
    public getSearchCursor(query: RegExp, pos: Pos): {
        findNext: () => string[] | null | undefined;
        findPrevious: () => string[] | null | undefined;
        find: (back?: boolean) => string[] | null | undefined;
        from: () => Pos | undefined;
        to: () => Pos | undefined;
        replace: (text: string) => void;
        readonly match: string[] | null;
    } {
        let currentLine = pos.line;
        let currentCh = pos.ch;
        let lastMatch: string[] | null = null;
        let matchFrom: Pos | undefined;
        let matchTo: Pos | undefined;

        return {
            findNext: (): string[] | null | undefined => {
                for (let l = currentLine; l < this.lineCount(); l++) {
                    const lineText = this.getLine(l);
                    const subText = l === currentLine ? lineText.substring(currentCh) : lineText;
                    const match = subText.match(query);
                    if (match && typeof match.index === "number") {
                        const start = (l === currentLine ? currentCh : 0) + match.index;
                        const end = start + match[0].length;
                        matchFrom = {line: l, ch: start};
                        matchTo = {line: l, ch: end};
                        lastMatch = match;
                        currentLine = l;
                        currentCh = end;
                        return match;
                    }
                }
                return null;
            },
            findPrevious: (): string[] | null | undefined => null,
            find: (): string[] | null | undefined => null,
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

    public findPosV(start: Pos, amount: number, _unit: "page" | "line", goalColumn?: number): Pos & {hitSide?: boolean} {
        const targetLine = Math.min(Math.max(0, start.line + amount), this.lastLine());
        const lineLen = this.getLine(targetLine).length;
        const col = typeof goalColumn === "number" ? goalColumn : start.ch;
        const ch = Math.min(col, lineLen);
        return {line: targetLine, ch, hitSide: targetLine === 0 || targetLine === this.lastLine()};
    }

    public charCoords(pos: Pos): {left: number; top: number; bottom: number} {
        const block = this.getBlockAtIndex(pos.line);
        if (block) {
            const rect = block.getBoundingClientRect();
            return {left: rect.left, top: rect.top, bottom: rect.bottom};
        }
        return {left: 0, top: 0, bottom: 0};
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

    public scrollIntoView(pos?: Pos): void {
        if (pos) {
            const block = this.getBlockAtIndex(pos.line);
            block?.scrollIntoView({block: "nearest", inline: "nearest"});
        }
    }

    public openDialog(): (newVal?: string) => void {
        return () => {};
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
