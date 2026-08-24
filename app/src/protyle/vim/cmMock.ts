import type {CodeMirrorConstructor, Pos, StringStream} from "./core/types";

export class PosImpl implements Pos {
    public line: number;
    public ch: number;
    public sticky?: string;
    constructor(line: number, ch: number) {
        this.line = line ?? 0;
        this.ch = ch ?? 0;
    }
}

export class StringStreamImpl implements StringStream {
    public pos = 0;
    public start = 0;
    public string: string;

    constructor(string: string) {
        this.string = string || "";
    }

    public eol(): boolean {
        return this.pos >= this.string.length;
    }

    public sol(): boolean {
        return this.pos === 0;
    }

    public peek(): string | void {
        return this.string.charAt(this.pos) || undefined;
    }

    public next(): string | void {
        if (this.pos < this.string.length) {
            return this.string.charAt(this.pos++);
        }
        return undefined;
    }

    public eat(match: string | RegExp | ((ch: string) => boolean)): string | void {
        const ch = this.string.charAt(this.pos);
        let ok = false;
        if (typeof match === "string") {
            ok = ch === match;
        } else if (match instanceof RegExp) {
            ok = match.test(ch);
        } else if (typeof match === "function") {
            ok = match(ch);
        }
        if (ok) {
            this.pos++;
            return ch;
        }
        return undefined;
    }

    public eatWhile(match: string | RegExp | ((ch: string) => boolean)): boolean {
        const start = this.pos;
        while (this.eat(match)) {
            // 继续吞入字符
        }
        return this.pos > start;
    }

    public eatSpace(): boolean {
        const start = this.pos;
        while (/[\s\u00a0]/.test(this.string.charAt(this.pos))) {
            this.pos++;
        }
        return this.pos > start;
    }

    public skipToEnd(): void {
        this.pos = this.string.length;
    }

    public skipTo(ch: string): boolean | void {
        const found = this.string.indexOf(ch, this.pos);
        if (found > -1) {
            this.pos = found;
            return true;
        }
        return undefined;
    }

    public backUp(n: number): void {
        this.pos -= n;
    }

    public column(): number {
        return this.pos;
    }

    public indentation(): number {
        return 0;
    }

    public match(pattern: string | RegExp, consume?: boolean, caseInsensitive?: boolean): boolean | RegExpMatchArray | null {
        if (typeof pattern === "string") {
            const cased = (str: string) => (caseInsensitive ? str.toLowerCase() : str);
            const substr = this.string.substr(this.pos, pattern.length);
            if (cased(substr) === cased(pattern)) {
                if (consume !== false) {
                    this.pos += pattern.length;
                }
                return true;
            }
            return null;
        }
        const match = this.string.slice(this.pos).match(pattern);
        if (match && match.index === 0) {
            if (consume !== false) {
                this.pos += match[0].length;
            }
            return match;
        }
        return null;
    }

    public current(): string {
        return this.string.slice(this.start, this.pos);
    }
}

/**
 * 构造提供给 initVim 的 CodeMirrorConstructor mock 对象
 */
export const createCMMock = (): CodeMirrorConstructor => {
    const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

    const mock: any = {
        isMac,
        Pos: PosImpl as any,
        StringStream: StringStreamImpl as any,
        commands: {
            toggleLineComment: () => {},
            cursorCharLeft: (cm: any) => cm?.moveH?.(-1, "char"),
            redo: (cm: any) => cm?.execCommand?.("redo"),
            undo: (cm: any) => cm?.execCommand?.("undo"),
            newlineAndIndent: (cm: any) => cm?.execCommand?.("newlineAndIndent"),
            indentAuto: (cm: any) => cm?.indentLine?.(cm.getCursor().line),
            newlineAndIndentContinueComment: null,
            save: (cm: any) => cm?.execCommand?.("save"),
        },
        isWordChar: (ch: string) => /[\w\u00A0-\uFFFF]/.test(ch),
        keys: {},
        addClass: (el: any, str: string) => el?.classList?.add?.(str),
        rmClass: (el: any, str: string) => el?.classList?.remove?.(str),
        e_preventDefault: (e: any) => e?.preventDefault?.(),
        e_stop: (e: any) => {
            e?.preventDefault?.();
            e?.stopPropagation?.();
        },
        lookupKey: () => {},
        on: (emitter: any, type: string, f: any) => {
            if (!emitter) {
                return;
            }
            if (emitter.addEventListener) {
                emitter.addEventListener(type, f);
            } else if (emitter.on) {
                emitter.on(type, f);
            }
        },
        off: (emitter: any, type: string, f: any) => {
            if (!emitter) {
                return;
            }
            if (emitter.removeEventListener) {
                emitter.removeEventListener(type, f);
            } else if (emitter.off) {
                emitter.off(type, f);
            }
        },
        signal: (emitter: any, type: string, ...args: any[]) => {
            if (emitter?.signal) {
                emitter.signal(type, ...args);
            }
        },
        findMatchingTag: (): any => undefined,
        findEnclosingTag: (): any => undefined,
        keyName: (e: any): string => e?.key,
    };

    return mock as CodeMirrorConstructor;
};
