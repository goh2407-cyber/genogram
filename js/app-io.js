// 來源：js/app.js；此檔以 mixin 掛回原型，載入順序：app.js → app-io.js（DOMContentLoaded 前同步載入）。
'use strict';
Object.assign(GenogramApp.prototype, {
    /**
     * 儲存到檔案

     */
    async saveToFile() {
        // 1. 永遠先執行一次自動儲存 (LocalStorage)，確保瀏覽器狀態最新
        this.autoSave();

        // 2. 嘗試直接寫入檔案 (如果瀏覽器支援且有連結)
        const result = await this.storage.saveToFile(this.persons, this.relationships, this.households || [], this.lifeCircles || [], this.getDocumentExtra());

        if (result === true) {
            this.isDirty = false; // [1-2] 已寫回檔案
            this.updateDocumentTitle();
            this.updateStatus(`已成功儲存至檔案: ${this.storage.getOpenFileName()}`, 'success');
        } else {
            // 如果無法直接寫入（沒連結或不支援）
            if (this.persons.length > 0) {
                // 有內容才提示尚未儲存至本機
                this.updateStatus(`已快速儲存至瀏覽器（你的檔案尚未儲存至本機，請點選「另存」備份）。`, 'info');
            } else {
                // 空畫布則簡單提示即可
                this.updateStatus(`已快速儲存至瀏覽器。`, 'success');
            }
        }
    },

    /**
     * 下載檔案
     */
    async downloadFile(suggestedName = null) {
        const timestamp = new Date().toISOString().slice(0, 10);
        const filename = suggestedName || `genogram_${timestamp}.json`;
        this.updateStatus(`正在另存檔案: ${filename}...`, 'info');
        const success = await this.storage.downloadFile(this.persons, this.relationships, this.households || [], this.lifeCircles || [], filename, this.getDocumentExtra());
        if (success) {
            this.updateStatus(`已成功匯出: ${this.storage.getOpenFileName()}`, 'success');
            this.autoSave();
            this.isDirty = false; // [1-2] 另存成功 = 檔案與畫面一致
            this.updateDocumentTitle();
        }
    },

    /**
     * 處理載入按鈕點擊
     */
    async handleLoadClick() {
        // [2-3] 支援 File System Access 的瀏覽器：先開「開啟檔案」對話框（最近檔案 / 瀏覽 / 清除本機暫存）
        if (window.showOpenFilePicker && this.elements.openFileModal) {
            await this.showOpenFileModal();
            return;
        }
        // 如果 API 不支援，使用傳統 input 方式
        this.elements.fileInput.click();
    },

    /**
     * 以系統檔案選擇器開啟（原 handleLoadClick 的 picker 路徑）
     */
    async openWithPicker() {
        if (window.showOpenFilePicker) {
            try {
                const data = await this.storage.openFileWithPicker();
                if (data) {
                    this.loadData(data);
                    this.updateStatus(`已載入檔案: ${this.storage.getOpenFileName()}`, 'success');
                }
                return; // 用戶取消也直接返回，不落到傳統方式
            } catch (err) {
                console.warn('使用檔案選擇器載入失敗，切換回傳統方式', err);
            }
        }
        this.elements.fileInput.click();
    },

    /**
     * [2-3] 開啟檔案對話框：列出最近檔案（IndexedDB 內的 handle）、瀏覽、清除本機暫存
     */
    async showOpenFileModal() {
        this.commitPropertyEditSession();
        await this.renderRecentFiles();
        this.modalManager.open(this.elements.openFileModal);
    },

    closeOpenFileModal() {
        this.modalManager.close(this.elements.openFileModal);
    },

    async renderRecentFiles() {
        const list = this.elements.recentFileList;
        if (!list) return;
        list.replaceChildren();
        let entries = [];
        try { entries = await this.storage.listRecentFiles(); } catch (_) { entries = []; }
        if (!entries.length) {
            const empty = document.createElement('p');
            empty.className = 'recent-file-empty';
            empty.textContent = '尚無最近檔案。用「從電腦載入…」載入或「另存」建立檔案後，會出現在這裡。';
            list.appendChild(empty);
            return;
        }
        const current = this.storage.getOpenFileName();
        entries.forEach(entry => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'recent-file-item';
            item.setAttribute('role', 'listitem');
            item.dataset.name = entry.name;
            if (entry.name === current) item.classList.add('is-current');
            const name = document.createElement('span');
            name.className = 'recent-file-name';
            name.textContent = entry.name; // textContent：檔名可能含個案姓名，不走 innerHTML
            name.title = entry.name;
            const time = document.createElement('span');
            time.className = 'recent-file-time';
            time.textContent = (entry.name === current ? '目前載入 · ' : '') + GenogramApp.formatRecentTime(entry.openedAt);
            item.append(name, time);
            item.addEventListener('click', () => this.openRecentEntry(entry));
            list.appendChild(item);
        });
    },

    async openRecentEntry(entry) {
        try {
            const data = await this.storage.openRecentFile(entry);
            if (!data) {
                this.updateStatus('未取得檔案存取權限，請改用「從電腦載入…」', 'warning');
                return;
            }
            this.closeOpenFileModal();
            this.loadData(data);
            this.updateStatus(`已載入檔案: ${this.storage.getOpenFileName()}`, 'success');
        } catch (err) {
            console.warn('開啟最近檔案失敗:', err);
            if (err && err.name === 'NotFoundError') {
                await this.storage.forgetRecentFile(entry.name);
                await this.renderRecentFiles();
                this.updateStatus('找不到該檔案（可能已移動或刪除），已從最近檔案移除', 'error');
            } else {
                this.updateStatus('載入檔案失敗：' + (err && err.message ? err.message : err), 'error');
            }
        }
    },

    /**
     * [2-3] 清除本機暫存並關閉個案：瀏覽器暫存 + 最近檔案 + 畫布內容 + 歷史，回到空白新個案。
     * 不會刪除磁碟上的 JSON 檔。給共用電腦離開前使用。
     */
    async clearLocalData() {
        const confirmed = await this.confirmDialog({
            title: '清除本機暫存並關閉個案',
            message: '會清除：瀏覽器暫存、最近檔案清單、畫布內容與復原紀錄。\n不會刪除你已另存到電腦裡的 JSON 檔案。',
            okText: '清除並關閉', danger: true
        });
        if (!confirmed) return;
        this.closeOpenFileModal();
        this.commitPropertyEditSession();
        this.cancelPlacement();
        this.cancelRelationshipWorkflow();
        if (this.isPreviewingLayout) this.cancelPreviewedLayout();
        this.isLoading = true; // 期間不觸發 autosave 寫回
        try {
            await this.storage.clearLocalData();
        } finally {
            this.isLoading = false;
        }
        this.persons = [];
        this._syncPersonMap();
        this.relationships = [];
        this.households = [];
        this.lifeCircles = [];
        this.documentMeta = GenogramApp.normalizeDocumentMeta(null);
        this.selectedPersonId = null;
        this.selectedPersonIds = [];
        this.selectedRelationshipId = null;
        this.selectedHouseholdId = null;
        this.selectedLifeCircleId = null;
        this.editingRelationshipId = null;
        this.history.undoStack = [];
        this.history.redoStack = [];
        this._dataVersion++;
        this.isDirty = false;
        this.updateDocumentTitle();
        this.updateToolbar();
        this.updatePropertyPanel();
        this.resetZoom();
        this.render();
        this.updateStatus('已清除本機暫存並關閉個案', 'success');
    },

    /**
     * 從檔案載入 (傳統 Input 方式)
     */
    async loadFromFile(e) {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const data = await this.storage.loadFromFile(file);
            this.loadData(data);
            this.updateStatus(`已載入檔案: ${file.name} (唯讀模式)`, 'success');
        } catch (err) {
            this.alertDialog(err.message, '載入失敗');
        }

        // 清空檔案輸入
        e.target.value = '';
    },

    /**
     * 匯出 PNG
     */
    async exportPNG(showNotes = true, showLegend = true, scale = 3, header = null, deidentify = false, legendAll = false) {
        await this.waitForCurrentCanvasFonts();
        const ds = this.getExportDataset(deidentify);
        this.canvas.personMap = ds.personMap; // [3-1] 關係/家庭線查表用複本；結束後還原
        let dataUrl = null;
        try {
            dataUrl = this.canvas.exportToPNG(ds.persons, this.relationships,
                this.households || [], this.lifeCircles || [], deidentify ? false : showNotes, showLegend, scale,
                this.viewOptions, deidentify ? this.deidentifyHeader(header) : header, legendAll);
        } finally { this.canvas.personMap = this.personMap; }
        if (!dataUrl) throw new Error('沒有內容可匯出');
        if (dataUrl) {
            const timestamp = new Date().toISOString().slice(0, 10);
            await this.storage.exportPNG(dataUrl, `genogram_${timestamp}.png`);
        }
    },

    /**
     * [2-2] 存檔時附加的欄位：有任一 meta 值才帶 `meta`，舊檔／未填者 JSON 逐 byte 不變
     */
    getDocumentExtra() {
        const meta = GenogramApp.normalizeDocumentMeta(this.documentMeta);
        return (meta.title || meta.caseId || meta.author) ? { meta } : {};
    },

    /**
     * [2-2] 由匯出對話框欄位更新 meta（屬於個案內容 → 標記未儲存、寫入暫存；不進 Undo）
     */
    setDocumentMeta(partial) {
        const next = GenogramApp.normalizeDocumentMeta({ ...this.documentMeta, ...partial });
        const changed = JSON.stringify(next) !== JSON.stringify(this.documentMeta);
        this.documentMeta = next;
        if (changed) {
            this.markDirty();
            this.autoSave();
        }
    },

    _readExportPrefs() {
        try { return JSON.parse(localStorage.getItem(GenogramApp.EXPORT_PREFS_KEY) || '{}') || {}; } catch (_) { return {}; }
    },

    _writeExportPrefs(patch) {
        try { localStorage.setItem(GenogramApp.EXPORT_PREFS_KEY, JSON.stringify({ ...this._readExportPrefs(), ...patch })); } catch (_) { /* ignore */ }
    },

    /**
     * [3-1] 匯出用資料集。deidentify=true 時回傳「複本」：姓名→代號（案主／男1／女1…，依 y、x 排序確定）、
     * 年齡→年齡帶、備註清空、出生/死亡年月移除；id 與座標不變，關係／同住框／生活圈照舊引用。
     * 磁碟資料與畫面完全不動。
     */
    getExportDataset(deidentify = false) {
        if (!deidentify) return { persons: this.persons, personMap: this.personMap };
        const order = [...this.persons].sort((a, b) => (a.y - b.y) || (a.x - b.x) || String(a.id).localeCompare(String(b.id)));
        const ips = order.filter(p => p.isIdentifiedPatient);
        const counters = { male: 0, female: 0, other: 0 };
        const prefix = { male: '男', female: '女', other: '人' };
        const names = new Map();
        order.forEach(p => {
            if (p.isIdentifiedPatient) {
                names.set(p.id, ips.length > 1 ? `案主${ips.indexOf(p) + 1}` : '案主');
                return;
            }
            const g = p.gender === 'male' || p.gender === 'female' ? p.gender : 'other';
            counters[g] += 1;
            names.set(p.id, `${prefix[g]}${counters[g]}`);
        });
        const persons = this.persons.map(p => {
            const json = p.toJSON();
            const band = GenogramApp.ageBand(typeof p.getDisplayAge === 'function' ? p.getDisplayAge(this.ageReferenceDate) : p.age);
            delete json.birthDate;
            delete json.deathDate;
            return Person.fromJSON({ ...json, name: names.get(p.id), age: band, notes: '' });
        });
        return { persons, personMap: new Map(persons.map(p => [p.id, p])) };
    },

    /**
     * [3-1] 去識別化的頁首：標題改為中性（標題常含個案姓名）、標記去識別化版本；案號／日期／繪製者保留
     */
    deidentifyHeader(header) {
        if (!header) return header;
        return { ...header, title: header.title ? '家系圖（去識別化）' : '', deidentified: true };
    },

    /**
     * [2-2] 讀匯出對話框的頭首/PDF 設定。未勾「加上頁首」→ header=null（輸出與以往相同）。
     * @returns {{header: (null|{title:string,caseId:string,author:string,date:string}), pdfOptions: {format:string, orientation:string}}}
     */
    readExportHeaderSettings() {
        const include = document.getElementById('exportIncludeHeader')?.checked === true;
        const meta = GenogramApp.normalizeDocumentMeta(this.documentMeta);
        const dateInput = document.getElementById('exportMetaDate');
        const date = dateInput && dateInput.value ? dateInput.value : GenogramApp.formatLocalDate();
        const header = include ? { ...meta, date } : null;
        const pdfOptions = {
            format: document.getElementById('exportPdfFormat')?.value || 'a4',
            orientation: document.getElementById('exportPdfOrientation')?.value || 'auto'
        };
        return { header, pdfOptions };
    },

    _syncExportHeaderFields() {
        const meta = GenogramApp.normalizeDocumentMeta(this.documentMeta);
        const prefs = this._readExportPrefs();
        const legendAll = document.getElementById('exportLegendAll');
        if (legendAll) {
            legendAll.checked = prefs.legendAll === true;
            legendAll.onchange = () => this._writeExportPrefs({ legendAll: legendAll.checked });
        }
        const set = (id, value) => { const el = document.getElementById(id); if (el) el.value = value; };
        set('exportMetaTitle', meta.title);
        set('exportMetaCaseId', meta.caseId);
        set('exportMetaAuthor', meta.author || (typeof prefs.author === 'string' ? prefs.author : ''));
        const dateInput = document.getElementById('exportMetaDate');
        if (dateInput && !dateInput.value) dateInput.value = GenogramApp.formatLocalDate();
        const include = document.getElementById('exportIncludeHeader');
        if (include) include.checked = prefs.includeHeader === true;
        const deid = document.getElementById('exportDeidentify');
        if (deid) deid.checked = false; // [3-1] 每次開啟都重新選擇，不記憶
        const fields = document.getElementById('exportHeaderFields');
        if (fields) fields.hidden = !(include && include.checked);
        const pdfFormat = document.getElementById('exportPdfFormat');
        if (pdfFormat && prefs.pdfFormat) pdfFormat.value = prefs.pdfFormat;
        const pdfOrient = document.getElementById('exportPdfOrientation');
        if (pdfOrient && prefs.pdfOrientation) pdfOrient.value = prefs.pdfOrientation;
    },

    /**
     * [R4] 匯出對話框改「先選格式、設定隨格式顯示、按匯出才動作」。
     * 設定區塊以 data-export-for="png,jpeg,..." 標記適用格式；JSON 只顯示說明。
     */
    selectExportFormat(format) {
        const valid = ['png', 'jpeg', 'svg', 'pdf', 'json'];
        const fmt = valid.includes(format) ? format : 'png';
        this.exportFormat = fmt;
        document.querySelectorAll('.export-option-btn').forEach(btn => {
            btn.setAttribute('aria-pressed', String(btn.dataset.format === fmt));
        });
        document.querySelectorAll('[data-export-for]').forEach(el => {
            el.hidden = !String(el.dataset.exportFor).split(',').includes(fmt);
        });
        const label = { png: 'PNG 圖片', jpeg: 'JPEG 圖片', svg: 'SVG 向量圖', pdf: 'PDF', json: 'JSON 備份' }[fmt];
        const btn = document.getElementById('exportConfirmBtn');
        if (btn) btn.textContent = `匯出 ${label}`;
        this._writeExportPrefs({ format: fmt });
    },

    showExportModal() {
        this.commitPropertyEditSession();
        this._syncExportHeaderFields(); // [2-2]
        const prefs = this._readExportPrefs();
        this.selectExportFormat(prefs.format || 'png'); // [R4] 記住上次格式
        this.modalManager.open(this.elements.exportModal);
    },

    /**
     * 關閉匯出格式選擇對話框
     */
    closeExportModal() {
        this.modalManager.close(this.elements.exportModal);
    },

    /**
     * 處理不同格式的匯出
     * @param {string} format - 匯出格式 (png, jpeg, svg, pdf, json)
     */
    async handleExportFormat(format) {
        if (this.persons.length === 0) {
            this.updateStatus('沒有內容可匯出', 'error');
            return;
        }

        // 讀取是否顯示備註的設定
        const showNotesCheckbox = document.getElementById('exportShowNotes');
        const showNotes = showNotesCheckbox ? showNotesCheckbox.checked : true;

        // 讀取是否顯示圖例的設定
        const showLegendCheckbox = document.getElementById('exportShowLegend');
        const showLegend = showLegendCheckbox ? showLegendCheckbox.checked : true;
        const legendAll = document.getElementById('exportLegendAll')?.checked === true;
        this._writeExportPrefs({ legendAll });

        // 讀取解析度設定
        const resolutionRadios = document.getElementsByName('exportResolution');
        let scale = 2; // 預設 2x
        for (const radio of resolutionRadios) {
            if (radio.checked) {
                scale = parseFloat(radio.value);
                break;
            }
        }

        const timestamp = new Date().toISOString().slice(0, 10);
        // [2-2] 頁首與 PDF 紙張設定（不勾「加上頁首」時 header = null，輸出與以往相同）
        const { header, pdfOptions } = this.readExportHeaderSettings();
        // [3-1] 去識別化（只動輸出）
        const deidentify = document.getElementById('exportDeidentify')?.checked === true;
        const deidNote = deidentify ? '（去識別化版本）' : '';

        this.canvas.lastExportEffectiveScale = null;
        try {
        switch (format) {
            case 'png':
                await this.exportPNG(showNotes, showLegend, scale, header, deidentify, legendAll);
                this.updateStatus('已匯出 PNG 圖片' + deidNote, 'success');
                break;

            case 'jpeg':
                await this.exportJPEG(showNotes, showLegend, scale, header, deidentify, legendAll);
                this.updateStatus('已匯出 JPEG 圖片' + deidNote, 'success');
                break;

            case 'svg':
                await this.exportSVG(showNotes, showLegend, scale, header, deidentify, legendAll);
                this.updateStatus('已匯出 SVG 向量圖' + deidNote, 'success');
                break;

            case 'pdf':
                await this.exportPDF(showNotes, showLegend, scale, header, pdfOptions, deidentify, legendAll);
                this.updateStatus('已匯出 PDF 文件' + deidNote, 'success');
                break;

            case 'json':
                this.exportJSON();
                this.updateStatus('已匯出 JSON 資料備份', 'success');
                break;

            default:
                console.warn('Unknown export format:', format);
                return;
        }
        if (format !== 'json' && this.canvas.lastExportEffectiveScale !== null
            && this.canvas.lastExportEffectiveScale < scale) {
            const effectiveScale = Math.floor(this.canvas.lastExportEffectiveScale * 100) / 100;
            const scaleLabel = effectiveScale > 0 ? effectiveScale : this.canvas.lastExportEffectiveScale.toPrecision(2);
            this.updateStatus('圖太大，已自動降為 ' + scaleLabel + ' 倍解析度', 'success');
        }
        } catch (err) {
            this.updateStatus('匯出失敗：' + err.message, 'error');
        }
    },

    /**
     * 匯出 JPEG
     */
    async exportJPEG(showNotes = true, showLegend = true, scale = 3, header = null, deidentify = false, legendAll = false) {
        await this.waitForCurrentCanvasFonts();
        const ds = this.getExportDataset(deidentify);
        this.canvas.personMap = ds.personMap;
        let dataUrl = null;
        try {
            dataUrl = this.canvas.exportToJPEG(ds.persons, this.relationships,
                this.households || [], this.lifeCircles || [], 0.92, deidentify ? false : showNotes, showLegend, scale,
                this.viewOptions, deidentify ? this.deidentifyHeader(header) : header, legendAll);
        } finally { this.canvas.personMap = this.personMap; }
        if (!dataUrl) throw new Error('沒有內容可匯出');
        if (dataUrl) {
            const timestamp = new Date().toISOString().slice(0, 10);
            await this.storage.exportJPEG(dataUrl, `genogram_${timestamp}.jpg`);
        }
    },

    /**
     * 匯出 SVG
     * 注意：由於 SVG 需要完全重新繪製，這裡使用 PNG 轉 SVG 的方式
     * 真正的向量 SVG 需要更複雜的實作
     */
    async exportSVG(showNotes = true, showLegend = true, scale = 3, header = null, deidentify = false, legendAll = false) {
        await this.waitForCurrentCanvasFonts();
        // 使用 PNG dataUrl 嵌入到 SVG 中
        // 這是一個簡化的實作，保持視覺一致性
        const ds = this.getExportDataset(deidentify);
        this.canvas.personMap = ds.personMap;
        let dataUrl = null;
        try {
            dataUrl = this.canvas.exportToPNG(ds.persons, this.relationships,
                this.households || [], this.lifeCircles || [], deidentify ? false : showNotes, showLegend, scale,
                this.viewOptions, deidentify ? this.deidentifyHeader(header) : header, legendAll);
        } finally { this.canvas.personMap = this.personMap; }
        if (!dataUrl) throw new Error('沒有內容可匯出');
        if (dataUrl) {
            // 從 canvas 取得尺寸
            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => reject(new Error('無法讀取匯出圖片'));
                img.src = dataUrl;
            });
            const width = img.width;
            const height = img.height;

            const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" 
     xmlns:xlink="http://www.w3.org/1999/xlink" 
     width="${width}" height="${height}" 
     viewBox="0 0 ${width} ${height}">
    <title>Genogram Export</title>
    <image x="0" y="0" width="${width}" height="${height}" xlink:href="${dataUrl}"/>
</svg>`;

            const timestamp = new Date().toISOString().slice(0, 10);
            await this.storage.exportSVG(svgContent, `genogram_${timestamp}.svg`);
        }
    },

    /**
     * 匯出 PDF
     */
    async exportPDF(showNotes = true, showLegend = true, scale = 3, header = null, pdfOptions = {}, deidentify = false, legendAll = false) {
        if (typeof window.jspdf === 'undefined') throw new Error('PDF 匯出模組尚未載入，請稍後再試');
        await this.waitForCurrentCanvasFonts();
        const ds = this.getExportDataset(deidentify);
        this.canvas.personMap = ds.personMap;
        let dataUrl = null;
        try {
            dataUrl = this.canvas.exportToPNG(ds.persons, this.relationships,
                this.households || [], this.lifeCircles || [], deidentify ? false : showNotes, showLegend, scale,
                this.viewOptions, deidentify ? this.deidentifyHeader(header) : header, legendAll);
        } finally { this.canvas.personMap = this.personMap; }
        if (!dataUrl) throw new Error('沒有內容可匯出');
        if (dataUrl) {
            // 從 dataUrl 取得圖片尺寸
            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => reject(new Error('無法讀取匯出圖片'));
                img.src = dataUrl;
            });
            const width = img.width;
            const height = img.height;
            const timestamp = new Date().toISOString().slice(0, 10);
            await this.storage.exportPDF(dataUrl, width, height, `genogram_${timestamp}.pdf`, pdfOptions);
        }
    },

    /**
     * 匯出 JSON 資料備份
     */
    exportJSON() {
        const timestamp = new Date().toISOString().slice(0, 10);
        this.storage.exportDataJSON(
            this.persons,
            this.relationships,
            this.households || [],
            this.lifeCircles || [],
            `genogram_backup_${timestamp}.json`,
            this.getDocumentExtra()
        );
    },

    /**
     * 清空畫布 (清除所有人物、關係、圈選)
     */
    async clearAll() {
        this.commitPropertyEditSession();
        this.cancelPlacement();
        this.cancelRelationshipWorkflow();
        // [UX Fix] 如果正在預覽自動排列，清空時自動取消預覽
        if (this.isPreviewingLayout) {
            this.cancelPreviewedLayout();
        }

        // [Fix] 只有同住框/生活圈的畫布也要能清空
        if (this.persons.length === 0 && this.relationships.length === 0 &&
            (this.households || []).length === 0 && (this.lifeCircles || []).length === 0) {
            this.updateStatus('畫布已經是空的', 'info');
            return;
        }

        const confirmed = await this.confirmDialog({
            title: '清空畫布',
            message: '將刪除所有成員、關係線、同住圈和生活圈。\n之後仍可用「復原」找回。',
            okText: '清空', danger: true
        });
        if (!confirmed) return;

        this.saveState();
        this.persons = [];
        this._syncPersonMap();
        this.relationships = [];
        this.households = [];
        this.lifeCircles = [];
        this.documentMeta = GenogramApp.normalizeDocumentMeta(null); // [2-2] 清空 = 新個案
        this.selectedPersonId = null;
        this.selectedRelationshipId = null;
        this.selectedHouseholdId = null;
        this.selectedLifeCircleId = null;
        this.isDrawingLifeCircle = false;
        this.currentLifeCirclePoints = [];
        this.lifeCircleMousePos = null;
        this.updatePropertyPanel();
        this.autoSave();
        this.render();
        this.updateStatus('畫布已清空', 'success');
    },

    /**
     * 複製圖片到剪貼簿
     */
    async copyImageToClipboard() {
        if (this.persons.length === 0) {
            this.updateStatus('沒有內容可複製', 'error');
            return;
        }

        await this.waitForCurrentCanvasFonts();

        try {
            // 讀取是否顯示備註的設定 (預設顯示)
            const showNotesCheckbox = document.getElementById('exportShowNotes');
            const showNotes = showNotesCheckbox ? showNotesCheckbox.checked : true;

            // 讀取是否顯示圖例的設定
            const showLegendCheckbox = document.getElementById('exportShowLegend');
            const showLegend = showLegendCheckbox ? showLegendCheckbox.checked : true;

            // 讀取解析度設定 (預設 1x 用於剪貼簿，避免過大)
            const resolutionRadios = document.getElementsByName('exportResolution');
            let scale = 1;
            for (const radio of resolutionRadios) {
                if (radio.checked) {
                    scale = parseFloat(radio.value);
                    break;
                }
            }

            // [3-1] 沿用匯出對話框的「去識別化」勾選（複製到 LINE/Word 也常需要去識別）
            const deidentify = document.getElementById('exportDeidentify')?.checked === true;
            const ds = this.getExportDataset(deidentify);
            this.canvas.personMap = ds.personMap;
            let dataUrl = null;
            try {
                dataUrl = this.canvas.exportToPNG(ds.persons, this.relationships,
                    this.households || [], this.lifeCircles || [], deidentify ? false : showNotes, showLegend, scale,
                    this.viewOptions);
            } finally { this.canvas.personMap = this.personMap; }
            if (!dataUrl) {
                this.updateStatus('產生圖片失敗', 'error');
                return;
            }

            // 將 dataUrl 轉換為 Blob
            const response = await fetch(dataUrl);
            const blob = await response.blob();

            // 使用 Clipboard API 複製圖片
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);

            this.updateStatus('圖片已複製到剪貼簿，可直接貼上', 'success');
        } catch (err) {
            console.error('複製圖片失敗:', err);
            // 如果 Clipboard API 不支援，提供替代方案
            if (err.name === 'NotAllowedError') {
                this.updateStatus('無法複製：請允許剪貼簿存取權限', 'error');
            } else {
                this.updateStatus('複製失敗，請使用匯出功能', 'error');
            }
        }
    },

    /**
     * 自動儲存 (含防抖與競態保護)
     */
    autoSave() {
        if (this.isLoading) return;
        this.updateDocumentTitle(); // [1-2] 每次變更後重新評估「有內容 + 未存檔」→ 標題列 ●

        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }

        const run = () => {
            const now = Date.now();
            // [B1-fix] 距上次寫入不足 1 秒 → 延後再寫，而不是直接丟棄這次變更
            const wait = 1000 - (now - this.lastAutoSaveTime);
            if (wait > 0) { this.autoSaveTimer = setTimeout(run, wait); return; }

            // 視圖狀態以 canvas 為單一真實來源
            const currentScale = this.canvas ? this.canvas.scale : this.scale;
            const currentOffsetX = this.canvas ? this.canvas.offsetX : this.offsetX;
            const currentOffsetY = this.canvas ? this.canvas.offsetY : this.offsetY;

            this.storage.autoSave(this.persons, this.relationships, this.households || [], this.lifeCircles || [], {
                scale: currentScale,
                offsetX: currentOffsetX,
                offsetY: currentOffsetY
            }, this.getDocumentExtra());
            this.lastAutoSaveTime = now;
            this.autoSaveTimer = null;
        };
        this.autoSaveTimer = setTimeout(run, 1000); // 1秒防抖
    },

    /**
     * 載入自動儲存
     */
    loadAutoSave() {
        this.cancelPlacement();
        this.isLoading = true; // 暫停 autosave
        const saved = this.storage.loadAutoSave();
        if (saved) {
            this.persons = saved.persons;
            this._syncPersonMap();
            this.relationships = saved.relationships;
            this.households = saved.households || [];
            this.lifeCircles = saved.lifeCircles || [];
            this.documentMeta = GenogramApp.normalizeDocumentMeta(saved.meta); // [2-2]
            this.normalizeLoadedFamilyRelationships({ inferDirectionFromY: GenogramApp.isLegacySchema(saved.sourceVersion) }); // [R4b]
            this.isDirty = true; // [1-2] 從瀏覽器暫存恢復：內容尚未在任何檔案裡

            // 還原視圖狀態
            // [Bug Fix] 視圖狀態應寫入 canvas 物件而非 app
            if (saved.view && this.canvas) {
                this.canvas.scale = saved.view.scale || 1;
                this.canvas.offsetX = saved.view.offsetX || 0;
                this.canvas.offsetY = saved.view.offsetY || 0;
                this.updateZoomDisplay();
            }

            // 延遲渲染，確保 canvas 尺寸已正確初始化
            requestAnimationFrame(() => {
                this.render();
                this.isLoading = false; // 恢復 autosave
            });

            const fileName = this.storage.getOpenFileName();
            if (fileName) {
                this.updateStatus(`已恢復上次工作階段: ${fileName}`, 'info', {
                    autoHideMs: GenogramApp.STATUS_TIMEOUTS.passive
                });
            } else {
                this.updateStatus('已恢復上次工作階段', 'info', {
                    autoHideMs: GenogramApp.STATUS_TIMEOUTS.passive
                });
            }
        } else {
            // [Bug Fix] 即使沒有儲存資料，也要重置 isLoading 狀態
            this.isLoading = false;
        }
    },

    // [NEW - G 方案] 預覽自動排列
    previewAutoLayout() {
        if (this.isPreviewingLayout) return;

        // 1. 記錄當前狀態
        this.isPreviewingLayout = true;
        this.originalBeforePreview = {};
        this.persons.forEach(p => {
            this.originalBeforePreview[p.id] = { x: p.x, y: p.y };
        });

        // [Bug Fix] 也要備份生活圈狀態
        this.originalLifeCirclesBeforePreview = {};
        this.lifeCircles.forEach(lc => {
            this.originalLifeCirclesBeforePreview[lc.id] = lc.points.map(p => ({ x: p.x, y: p.y }));
        });

        // 2. 顯示預覽 UI
        if (this.elements.layoutPreviewBar) {
            this.elements.layoutPreviewBar.style.display = 'flex';
        }

        // 3. 執行排列（不儲存 History，不寫入 localStorage）
        // 讓 autoLayoutByGeneration 執行，但最後會更新座標
        this.autoLayoutByGeneration(true); // 傳入 isPreview = true

        this.updateStatus('預覽自動排列結果。滿意請按「套用」，否則「取消」。', 'info');
    },

    // [NEW - G 方案] 套用預覽結果
    applyPreviewedLayout() {
        if (!this.isPreviewingLayout) return;

        // 1. 儲存狀態到 History
        // 必須手動建構「排列前」的狀態並推入 undoStack
        // 因為 saveState() 只會儲存當前狀態，而我們希望 Undo 能回到排列前
        const beforeState = {
            persons: this.persons.map(p => {
                const json = p.toJSON();
                if (this.originalBeforePreview && this.originalBeforePreview[p.id]) {
                    json.x = this.originalBeforePreview[p.id].x;
                    json.y = this.originalBeforePreview[p.id].y;
                }
                return json;
            }),
            relationships: this.relationships.map(r => r.toJSON()),
            households: this.households || [],
            lifeCircles: (this.lifeCircles || []).map(lc => {
                const clone = JSON.parse(JSON.stringify(lc));
                if (this.originalLifeCirclesBeforePreview && this.originalLifeCirclesBeforePreview[lc.id]) {
                    clone.points = this.originalLifeCirclesBeforePreview[lc.id];
                }
                return clone;
            })
        };

        this.markDirty(); // [1-2]
        this.history.pushState(beforeState);

        // 2. 隱藏預覽 UI
        if (this.elements.layoutPreviewBar) {
            this.elements.layoutPreviewBar.style.display = 'none';
        }

        // 3. 清除預覽狀態並儲存
        this.isPreviewingLayout = false;
        this.originalBeforePreview = null;
        this.originalLifeCirclesBeforePreview = null;

        this.autoSave();
        this.updateStatus('已套用自動排列', 'success');
    },

    // [NEW - G 方案] 取消預覽
    cancelPreviewedLayout() {
        if (!this.isPreviewingLayout || !this.originalBeforePreview) return;

        // 1. 還原人物座標
        this.persons.forEach(p => {
            const original = this.originalBeforePreview[p.id];
            if (original) {
                p.x = original.x;
                p.y = original.y;
            }
        });

        // 2. [Bug Fix] 還原生活圈座標
        if (this.originalLifeCirclesBeforePreview) {
            this.lifeCircles.forEach(lc => {
                const originalPoints = this.originalLifeCirclesBeforePreview[lc.id];
                if (originalPoints) {
                    lc.points = originalPoints.map(p => ({ x: p.x, y: p.y }));
                }
            });
        }

        // 3. 隱藏預覽 UI
        if (this.elements.layoutPreviewBar) {
            this.elements.layoutPreviewBar.style.display = 'none';
        }

        // 4. 重繪
        this.render();

        this.isPreviewingLayout = false;
        this.originalBeforePreview = null;
        this.originalLifeCirclesBeforePreview = null;
        this.updateStatus('已取消自動排列', 'info');
    },

    /**
     * 自動排列同輩份的人物 (Dagre.js 版本)
     * @param {boolean} isPreview 是否為預覽模式（不寫入 History）
     */
    autoLayoutByGeneration(isPreview = false) {
        if (!isPreview) {
            this.saveState();
        }

        if (this.persons.length === 0) {
            this.updateStatus('畫布上沒有成員可排列', 'warning');
            return;
        }

        // [L-1] 佈局引擎已改為自家的家系圖分層佈局，不再依賴 dagre

        // 使用新的佈局引擎
        const layout = new GenogramLayout(this.persons, this.relationships, {
            grid: GenogramApp.GRID,
            households: this.households,
            lifeCircles: this.lifeCircles
        });

        const result = layout.calculate();

        // 套用新座標
        result.positions.forEach((pos, personId) => {
            const person = this.personMap.get(personId);
            if (person && !pos.keep) { // keep = 沒有任何關係的獨立人物，原地不動也不吸附
                person.x = this.snapToGrid(pos.x, 'x');
                person.y = this.snapToGrid(pos.y, 'y');
            }
        });

        // 更新生活圈形狀 (智慧跟隨 - 直接替換頂點)
        if (this.lifeCircles && result.lifeCircleShapes) {
            this.lifeCircles.forEach(lc => {
                const newPoints = result.lifeCircleShapes[lc.id];
                if (newPoints && newPoints.length > 0) {
                    lc.points = newPoints;
                }
            });
        }

        if (!isPreview) {
            this.autoSave();
        }
        this.render();

        const personCount = this.persons.length;
        const relCount = this.relationships.length;

        if (!isPreview) {
            this.updateStatus(`佈局完成：${personCount} 人，${relCount} 條關係`, 'success');
        }

    }
});
