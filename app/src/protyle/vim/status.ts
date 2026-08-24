/**
 * Vim 状态栏与光标提示
 */
export const updateVimStatus = (mode: string, subMode = "", extra = "") => {
    const statusMsgElement = document.querySelector("#status .status__msg") as HTMLElement;
    if (!statusMsgElement) {
        return;
    }

    let text = "";
    if (mode === "normal") {
        text = "-- NORMAL --";
    } else if (mode === "insert") {
        text = "-- INSERT --";
    } else if (mode === "visual") {
        if (subMode === "linewise") {
            text = "-- VISUAL LINE --";
        } else if (subMode === "blockwise") {
            text = "-- VISUAL BLOCK --";
        } else {
            text = "-- VISUAL --";
        }
    } else if (mode === "replace") {
        text = "-- REPLACE --";
    }

    if (extra) {
        text += " " + extra;
    }

    statusMsgElement.textContent = text;
};
