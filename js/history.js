/**
 * HistoryManager 類別 - 管理撤銷/重做功能
 */
class HistoryManager {
    constructor(maxHistory = 50) {
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistory = maxHistory;
    }

    /**
     * 記錄新的狀態
     * @param {Object} state - 當前狀態的快照
     */
    pushState(state) {
        // 深複製狀態
        const stateCopy = JSON.parse(JSON.stringify(state));
        this.undoStack.push(stateCopy);

        // 清空重做堆疊
        this.redoStack = [];

        // 限制歷史記錄數量
        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }
    }

    /**
     * 撤銷操作
     * @param {Object} currentState - 當前狀態
     * @returns {Object|null} - 回到的狀態，或 null 表示無法撤銷
     */
    undo(currentState) {
        if (this.undoStack.length === 0) {
            return null;
        }

        // 將當前狀態推入重做堆疊
        const currentCopy = JSON.parse(JSON.stringify(currentState));
        this.redoStack.push(currentCopy);

        // 取出上一個狀態
        return this.undoStack.pop();
    }

    /**
     * 重做操作
     * @param {Object} currentState - 當前狀態
     * @returns {Object|null} - 重做的狀態，或 null 表示無法重做
     */
    redo(currentState) {
        if (this.redoStack.length === 0) {
            return null;
        }

        // 將當前狀態推入撤銷堆疊
        const currentCopy = JSON.parse(JSON.stringify(currentState));
        this.undoStack.push(currentCopy);

        // 取出重做狀態
        return this.redoStack.pop();
    }

    /**
     * 是否可以撤銷
     * @returns {boolean}
     */
    canUndo() {
        return this.undoStack.length > 0;
    }

    /**
     * 是否可以重做
     * @returns {boolean}
     */
    canRedo() {
        return this.redoStack.length > 0;
    }

    /**
     * 清空所有歷史記錄
     */
    clear() {
        this.undoStack = [];
        this.redoStack = [];
    }

    /**
     * 取得撤銷堆疊長度
     * @returns {number}
     */
    getUndoCount() {
        return this.undoStack.length;
    }

    /**
     * 取得重做堆疊長度
     * @returns {number}
     */
    getRedoCount() {
        return this.redoStack.length;
    }
}


