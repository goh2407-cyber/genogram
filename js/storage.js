/**
 * StorageManager 類別 - 管理儲存與載入功能
 */
class StorageManager {
    constructor() {
        this.localStorageKey = 'genogram_autosave';
        this.currentFileHandle = null; // 記住當前開啟的檔案 handle
        this.currentFileName = null; // 記住當前檔案名稱
    }

    /**
     * 儲存檔案（如果有開啟的檔案，直接覆蓋；否則保存到 LocalStorage）
     * @param {Array<Person>} persons
     * @param {Array<Relationship>} relationships
     * @param {Array} households
     * @returns {Promise<boolean>} 是否成功儲存到檔案
     */
    async saveToFile(persons, relationships, households = []) {
        // 也保存到 localStorage 作為備份
        this.autoSave(persons, relationships, households);

        // 如果有開啟的檔案 handle，直接寫入
        if (this.currentFileHandle) {
            try {
                const data = {
                    version: '1.0',
                    createdAt: new Date().toISOString(),
                    persons: persons.map(p => p.toJSON()),
                    relationships: relationships.map(r => r.toJSON()),
                    households: households || []
                };
                const jsonStr = JSON.stringify(data, null, 2);

                const writable = await this.currentFileHandle.createWritable();
                await writable.write(jsonStr);
                await writable.close();
                return true;
            } catch (err) {
                console.warn('儲存到檔案失敗:', err);
                return false;
            }
        }
        return false;
    }

    /**
     * 下載已保存的檔案
     * @param {Array<Person>} persons
     * @param {Array<Relationship>} relationships
     * @param {Array} households
     * @param {string} filename
     */
    async downloadFile(persons, relationships, households = [], filename = 'genogram.json') {
        const data = {
            version: '1.0',
            createdAt: new Date().toISOString(),
            persons: persons.map(p => p.toJSON()),
            relationships: relationships.map(r => r.toJSON()),
            households: households || []
        };

        const jsonStr = JSON.stringify(data, null, 2);

        // 嘗試使用現代 File System Access API
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: filename,
                    types: [{
                        description: 'JSON 檔案',
                        accept: { 'application/json': ['.json'] }
                    }]
                });
                const writable = await handle.createWritable();
                await writable.write(jsonStr);
                await writable.close();

                // 建立連結：讓「儲存」按鈕之後可以直接寫入
                this.currentFileHandle = handle;
                this.currentFileName = handle.name;
                return true;
            } catch (err) {
                if (err.name === 'AbortError') return false; // 用戶取消
                // API 失敗，使用傳統方式
            }
        }

        // 傳統下載方式
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.currentFileName = filename;
        return true;
    }

    /**
     * [Bug Fix #9] 資料遷移與相容性處理
     * @param {Object} data 原始 JSON 數據
     * @returns {Object} 遷移後的標準數據
     */
    migrate(data) {
        if (!data) return null;

        // 確保基本結構存在
        const result = {
            version: data.version || '0.1', // 預設舊版本
            persons: Array.isArray(data.persons) ? data.persons : [],
            relationships: Array.isArray(data.relationships) ? data.relationships : [],
            households: Array.isArray(data.households) ? data.households : []
        };

        // 這裡可以根據版本進行具體欄位轉換
        // 例如：0.1 -> 1.0 的轉換邏輯
        if (result.version === '0.1') {
            console.log('正在從版本 0.1 遷移數據...');
            // 補齊缺失的預設值 (例如：medical)
            result.persons.forEach(p => {
                if (!p.medical) p.medical = {};
            });
            result.version = '1.0';
        }

        return result;
    }

    /**
     * 從檔案載入 (傳統方式)
     */
    loadFromFile(file) {
        this.currentFileHandle = null;
        this.currentFileName = file.name;

        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    let data = JSON.parse(e.target.result);

                    // 執行遷移邏輯
                    data = this.migrate(data);

                    if (!data || data.persons.length === 0) {
                        // 如果完全空的，也算成功但給警告
                        console.warn('載入的檔案不含有效人物數據');
                    }

                    const persons = data.persons.map(p => Person.fromJSON(p));
                    const relationships = data.relationships.map(r => Relationship.fromJSON(r));
                    const households = data.households || [];

                    resolve({ persons, relationships, households });
                } catch (err) {
                    reject(new Error('檔案解析失敗，請確認檔案格式是否正確: ' + err.message));
                }
            };

            reader.onerror = () => reject(new Error('讀取檔案過程中發生錯誤'));
            reader.readAsText(file);
        });
    }

    /**
     * 使用 File System Access API 開啟檔案（可以記住 handle 以便後續存檔）
     * @returns {Promise<{persons: Array, relationships: Array, households: Array}|null>}
     */
    async openFileWithPicker() {
        if (!window.showOpenFilePicker) {
            return null;
        }

        try {
            const [handle] = await window.showOpenFilePicker({
                types: [{
                    description: 'JSON 檔案',
                    accept: { 'application/json': ['.json'] }
                }],
                multiple: false
            });

            const file = await handle.getFile();
            const content = await file.text();
            let data = JSON.parse(content);

            // [Bug Fix #9] 執行遷移邏輯
            data = this.migrate(data);

            if (!data) {
                throw new Error('無效的檔案格式');
            }

            // 記住 handle 以便後續存檔
            this.currentFileHandle = handle;
            this.currentFileName = file.name;

            const persons = data.persons.map(p => Person.fromJSON(p));
            const relationships = data.relationships.map(r => Relationship.fromJSON(r));
            const households = data.households || [];

            return { persons, relationships, households };
        } catch (err) {
            if (err.name === 'AbortError') {
                return null; // 用戶取消
            }
            throw new Error('無法載入檔案: ' + err.message);
        }
    }

    /**
     * 檢查是否有開啟的檔案可以直接儲存
     * @returns {boolean}
     */
    hasOpenFile() {
        return this.currentFileHandle !== null;
    }

    /**
     * 取得目前開啟的檔案名稱
     * @returns {string|null}
     */
    getOpenFileName() {
        return this.currentFileName;
    }

    /**
     * 清除目前開啟的檔案 handle
     */
    clearOpenFile() {
        this.currentFileHandle = null;
        this.currentFileName = null;
    }

    /**
     * 儲存到 LocalStorage（自動儲存）
     * @param {Array<Person>} persons
     * @param {Array<Relationship>} relationships
     * @param {Array} households
     * @param {Object} options - 額外視圖選項
     */
    autoSave(persons, relationships, households = [], options = {}) {
        try {
            const data = {
                version: '1.0',
                savedAt: new Date().toISOString(),
                persons: persons.map(p => p.toJSON()),
                relationships: relationships.map(r => r.toJSON()),
                households: households || [],
                filename: this.currentFileName, // 紀錄檔名
                view: options || {} // 儲存縮放與位移
            };
            localStorage.setItem(this.localStorageKey, JSON.stringify(data));
        } catch (err) {
            console.warn('自動儲存失敗:', err);
        }
    }

    /**
     * 從 LocalStorage 載入（恢復自動儲存）
     * @returns {{persons: Array, relationships: Array, households: Array}|null}
     */
    loadAutoSave() {
        try {
            const saved = localStorage.getItem(this.localStorageKey);
            if (!saved) return null;

            const data = JSON.parse(saved);
            if (!data.persons || !data.relationships) return null;

            const persons = data.persons.map(p => Person.fromJSON(p));
            const relationships = data.relationships.map(r => Relationship.fromJSON(r));
            const households = data.households || [];
            const view = data.view || null;
            this.currentFileName = data.filename || null; // 還原檔名

            return { persons, relationships, households, view, filename: this.currentFileName, savedAt: data.savedAt };
        } catch (err) {
            console.warn('載入自動儲存失敗:', err);
            return null;
        }
    }

    /**
     * 清除自動儲存
     */
    clearAutoSave() {
        localStorage.removeItem(this.localStorageKey);
    }

    /**
     * 匯出 PNG 圖片
     * @param {string} dataUrl - Canvas 的 dataURL
     * @param {string} filename
     */
    exportPNG(dataUrl, filename = 'genogram.png') {
        if (!dataUrl) {
            alert('沒有內容可匯出');
            return;
        }

        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
}


