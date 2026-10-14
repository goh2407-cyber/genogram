/**
 * 線上版延伸功能（DEMO，參考 genogram.drsexswag.com）：
 * 1. 右側「清單」分頁：人物／關係，可搜尋；點一下定位並選取
 * 2. 右側「事件」分頁：重大事件（年份＋內容＋加入；清單每筆改／刪），依年份畫成圖下方的事件卡（可拖曳）
 * 3. 畫布左下快捷鈕：畫面去識別化、檢視模式（唯讀簡報）
 * 4. 匯出 Word（圖＋成員表＋事件），程式庫第一次匯出才從 jsDelivr 載入
 * 只在根目錄 index.html 載入；離線包 geno/ 不載入。不改任何線條顏色與樣式。
 */
class GenogramExtras {
    // Word 匯出程式庫放在本機（docx 9.7.2 IIFE，MIT），按「匯出 Word」時才載入；全程不連外（2026-10-14）
    static DOCX_SRC = 'js/vendor/docx.iife.js';
    static GENDER = { male: '男', female: '女', pregnancy: '懷孕', same: '其他', pet: '寵物' };

    /** 清單／Word 的性別欄；寵物顯示種類（貓、狗…） */
    static genderLabel(p) {
        if (p.gender === 'pet') return '寵物・' + ((typeof Person !== 'undefined' && Person.PET_LABELS[p.petType]) || '其他');
        return GenogramExtras.GENDER[p.gender] || '';
    }

    constructor(app) {
        this.app = app;
        this.listTab = 'persons';
        this.query = '';
        this.editingEventId = null;
        this.lastSignature = '';
        this.buildListPanel();
        this.buildEventsPanel();
        this.buildQuickButtons();
        this.installPresentationGuards();
        this.installExportDOCX();
        this.wrapRender();
        document.body.classList.toggle('screen-deidentified', app.viewOptions.deidentifyScreen === true);
    }

    el(tag, attrs = {}, children = []) {
        const node = document.createElement(tag);
        Object.entries(attrs).forEach(([k, v]) => {
            if (v === undefined || v === null || v === false) return;
            if (k === 'class') node.className = v;
            else if (k === 'text') node.textContent = v;
            else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
            else node.setAttribute(k, v === true ? '' : v);
        });
        children.forEach(c => c && node.appendChild(c));
        return node;
    }

    svg(paths, size = 18) {
        const NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', size);
        svg.setAttribute('height', size);
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '1.8');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('aria-hidden', 'true');
        paths.forEach(d => { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); svg.appendChild(p); });
        return svg;
    }

    /** 每次畫面重繪後，若清單分頁開著且資料有變，就重建清單（只比對簽章，不每幀重建 DOM） */
    wrapRender() {
        const app = this.app;
        const original = app.render.bind(app);
        app.render = (...args) => {
            const result = original(...args);
            if (app.currentInspectorTab === 'list') this.refreshList();
            if (app.currentInspectorTab === 'events') this.refreshEvents();
            this.syncQuickButtons();
            return result;
        };
        document.getElementById('listTab')?.addEventListener('click', () => this.refreshList(true));
        document.getElementById('eventsTab')?.addEventListener('click', () => this.refreshEvents(true));
        // 工具列「事件」鈕（複製圖片旁）：展開右側面板並切到事件分頁
        document.getElementById('eventsToolBtn')?.addEventListener('click', () => this.openEventsPanel());
    }

    // ───────────────────────── 1+2. 清單分頁 ─────────────────────────

    buildListPanel() {
        this.panel = document.getElementById('listPanel');
        if (!this.panel) return;
        this.segButtons = {};
        const seg = this.el('div', { class: 'list-seg', role: 'tablist', 'aria-label': '清單類別' },
            [['persons', '人物'], ['relations', '關係']].map(([key, label]) => {
                const b = this.el('button', { type: 'button', class: 'list-seg-btn', role: 'tab', 'data-list': key, onclick: () => { this.listTab = key; this.refreshList(true); } });
                b.append(this.el('span', { text: label }), this.el('span', { class: 'list-count', text: '0' }));
                this.segButtons[key] = b;
                return b;
            }));
        this.search = this.el('input', { type: 'search', class: 'list-search', placeholder: '搜尋姓名或關係', 'aria-label': '搜尋清單' });
        this.search.addEventListener('input', () => { this.query = this.search.value.trim(); this.refreshList(true); });
        this.search.addEventListener('keydown', e => e.stopPropagation());
        this.items = this.el('div', { class: 'list-items' });
        this.panel.append(seg, this.search, this.items);
    }

    /**
     * 重大事件（2026-10-13 使用者改要參考網站的用法）：
     * 上方兩欄「年份」「事件內容」＋「加入事件」；下方清單每筆有「改」「刪」。
     * 「改」把內容帶回上方表單，按「儲存修改」或「取消」。事件依年份由早到晚畫在圖下方的事件卡。
     */
    buildEventsPanel() {
        this.eventsPanel = document.getElementById('eventsPanel');
        if (!this.eventsPanel) return;
        const stop = e => e.stopPropagation(); // 不觸發畫布快捷鍵
        this.evYear = this.el('input', { type: 'text', class: 'ev-year-input', placeholder: '例：2008', maxlength: '12', inputmode: 'numeric', 'aria-label': '年份', id: 'evYearInput' });
        this.evText = this.el('textarea', { class: 'ev-text-input', rows: '2', placeholder: '例：舉家搬到台南、祖父過世、父母離婚', maxlength: '220', 'aria-label': '事件內容', id: 'evTextInput' });
        [this.evYear, this.evText].forEach(inp => inp.addEventListener('keydown', e => {
            stop(e);
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); this.submitEvent(); }
            if (e.key === 'Escape' && this.editingEventId) { e.preventDefault(); this.resetEventForm(); }
        }));
        this.evSubmit = this.el('button', { type: 'button', class: 'list-btn primary', text: '加入事件', onclick: () => this.submitEvent() });
        this.evCancel = this.el('button', { type: 'button', class: 'list-btn', text: '取消', onclick: () => this.resetEventForm() });
        this.evCancel.hidden = true;
        this.eventForm = this.el('div', { class: 'ev-form' }, [
            this.el('p', { class: 'list-hint', text: '依年份由早到晚，畫在家系圖下方的「重大事件」卡。適合記錄搬家、過世、離婚、入學、安置等轉折。' }),
            this.el('div', { class: 'ev-fields' }, [
                this.el('label', { class: 'ev-field ev-field--year', for: 'evYearInput' }, [this.el('span', { text: '年份' }), this.evYear]),
                this.el('label', { class: 'ev-field ev-field--text', for: 'evTextInput' }, [this.el('span', { text: '事件內容' }), this.evText])
            ]),
            this.el('div', { class: 'ev-actions' }, [this.evCancel, this.evSubmit])
        ]);
        this.eventItems = this.el('div', { class: 'ev-list' });
        this.eventsCount = this.el('p', { class: 'list-section-title', text: '已加入（0）' });
        this.resetEventsPosBtn = this.el('button', { type: 'button', class: 'list-btn', text: '事件卡放回預設位置', title: '把事件卡放回家系圖下方', onclick: () => {
            const app = this.app;
            if (!app.eventsLayout) return;
            app.saveState(); app.eventsLayout = null; app.autoSave(); app.render();
        } });
        this.eventsPanel.append(
            this.eventForm,
            this.eventsCount,
            this.eventItems,
            this.el('div', { class: 'list-inline-actions' }, [this.resetEventsPosBtn]),
            this.el('p', { class: 'list-hint', text: '事件卡可以在畫布上按住拖到想放的位置，會跟著存檔與匯出。「檢視」分頁可關閉「重大事件」。' })
        );
    }

    openEventsPanel() {
        const app = this.app;
        if (app.isCompactInspector?.()) app.setCompactInspectorOpen(true);
        else if (app.inspectorDesktopCollapsed) app.setInspectorCollapsed(false);
        app.setInspectorTab('events');
        this.refreshEvents(true);
        this.evYear?.focus();
    }

    refreshEvents(force = false) {
        if (!this.eventsPanel) return;
        const app = this.app;
        const codes = this.displayNames();
        const events = this.sortedEvents();
        const sig = ['ev', codes ? 1 : 0, app.eventsLayout ? app.eventsLayout.x + ',' + app.eventsLayout.y : '', this.editingEventId || '',
            ...events.map(e => e.id + e.year + e.text)].join('|');
        if (!force && sig === this.lastEventsSignature) return;
        this.lastEventsSignature = sig;
        this.eventsCount.textContent = `已加入（${events.length}）`;
        this.eventItems.replaceChildren();
        events.forEach(e => this.eventItems.appendChild(this.eventRow(e, codes)));
        if (!events.length) this.eventItems.appendChild(this.el('p', { class: 'list-empty', text: '還沒有事件，在上面填年份和內容後按「加入事件」。' }));
        this.resetEventsPosBtn.hidden = !app.eventsLayout;
        const editing = !!this.editingEventId;
        this.evSubmit.textContent = editing ? '儲存修改' : '加入事件';
        this.evCancel.hidden = !editing;
        this.eventForm.classList.toggle('editing', editing);
    }

    /** 加入新事件；editingEventId 有值時改為更新那一筆 */
    submitEvent() {
        const app = this.app;
        const year = String(this.evYear.value || '').trim();
        const text = String(this.evText.value || '').trim();
        if (!text) { this.evText.focus(); return; }
        app.saveState();
        if (this.editingEventId) {
            const ev = app.events.find(e => e.id === this.editingEventId);
            if (ev) { ev.year = year; ev.text = text; }
            this.editingEventId = null;
        } else {
            app.events.push({ id: 'ev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), year, text });
        }
        this.evYear.value = '';
        this.evText.value = '';
        app.autoSave();
        app.render();
        this.refreshEvents(true);
        this.evYear.focus();
    }

    resetEventForm() {
        this.editingEventId = null;
        if (this.evYear) this.evYear.value = '';
        if (this.evText) this.evText.value = '';
        this.refreshEvents(true);
    }

    /** 「改」：把這筆帶回上方表單 */
    startEditEvent(id) {
        const ev = (this.app.events || []).find(e => e.id === id);
        if (!ev) return;
        this.editingEventId = id;
        this.evYear.value = ev.year || '';
        this.evText.value = ev.text || '';
        this.refreshEvents(true);
        this.evText.focus();
    }

    deleteEvent(id) {
        const app = this.app;
        app.saveState();
        app.events = app.events.filter(e => e.id !== id);
        if (this.editingEventId === id) this.resetEventForm();
        app.autoSave(); app.render(); this.refreshEvents(true);
    }

    displayNames() {
        const app = this.app;
        if (app.viewOptions.deidentifyScreen !== true) return null;
        const ds = app.getExportDataset(true);
        return new Map(ds.persons.map(p => [p.id, p.name]));
    }

    nameOf(id, codes) {
        const p = this.app.personMap.get(id);
        if (!p) return '？';
        if (codes) return codes.get(id) || '？';
        return p.name || '（未命名）';
    }

    signature() {
        const app = this.app;
        const parts = [this.listTab, this.query, app.viewOptions.deidentifyScreen, app._dataVersion,
            app.persons.length, app.relationships.length, app.selectedPersonId, app.selectedRelationshipId];
        app.persons.forEach(p => parts.push(p.name, p.age, p.birthDate, p.isDeceased, p.isIdentifiedPatient, p.gender));
        app.relationships.forEach(r => parts.push(r.type, r.date));
        return parts.join('|');
    }

    refreshList(force = false) {
        if (!this.panel) return;
        const sig = this.signature();
        if (!force && sig === this.lastSignature) return;
        this.lastSignature = sig;
        const app = this.app;
        const codes = this.displayNames();
        const q = this.query.toLowerCase();
        const match = (...texts) => !q || texts.some(t => String(t || '').toLowerCase().includes(q));

        if (this.listTab === 'events') this.listTab = 'persons';
        const persons = app.persons.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
        const relRows = this.relationshipRows(codes);
        this.segButtons.persons.lastChild.textContent = persons.length;
        this.segButtons.relations.lastChild.textContent = relRows.length;
        Object.entries(this.segButtons).forEach(([k, b]) => {
            b.classList.toggle('active', k === this.listTab);
            b.setAttribute('aria-selected', String(k === this.listTab));
        });
        this.items.replaceChildren();

        if (this.listTab === 'persons') {
            const rows = persons.filter(p => match(this.nameOf(p.id, codes), p.notes));
            rows.forEach(p => this.items.appendChild(this.personRow(p, codes)));
            if (!rows.length) this.empty(persons.length ? '沒有符合的人物' : '畫布上還沒有人物');
        } else {
            const rows = relRows.filter(r => match(r.text, r.kind));
            rows.forEach(r => this.items.appendChild(this.relationRow(r)));
            if (!rows.length) this.empty(relRows.length ? '沒有符合的關係' : '還沒有任何關係');
        }
    }

    empty(text) { this.items.appendChild(this.el('p', { class: 'list-empty', text })); }

    personRow(p, codes) {
        const app = this.app;
        const age = typeof p.getDisplayAge === 'function' ? p.getDisplayAge(app.ageReferenceDate) : p.age;
        const meta = [GenogramExtras.genderLabel(p), (p.gender !== 'pet' && age !== null && age !== undefined && age !== '') ? `${age} 歲` : '', p.isDeceased ? '已故' : '']
            .filter(Boolean).join('｜');
        const glyph = p.lossType ? '●' : p.gender === 'female' ? '○' : p.gender === 'pregnancy' ? '△' : '□';
        const row = this.el('button', { type: 'button', class: 'list-row' + (app.selectedPersonId === p.id ? ' selected' : ''), onclick: () => this.locatePerson(p.id) }, [
            this.el('span', { class: 'list-glyph' + (p.isIdentifiedPatient ? ' ip' : ''), text: glyph, 'aria-hidden': 'true' }),
            this.el('span', { class: 'list-main' }, [
                this.el('span', { class: 'list-title' }, [
                    this.el('span', { text: this.nameOf(p.id, codes) }),
                    p.isIdentifiedPatient ? this.el('span', { class: 'list-badge', text: '案主' }) : null
                ]),
                this.el('span', { class: 'list-sub', text: meta })
            ]),
            this.el('span', { class: 'list-go', text: '編輯', title: '在屬性面板編輯', onclick: (e) => { e.stopPropagation(); this.locatePerson(p.id); app.setInspectorTab('properties'); } })
        ]);
        return row;
    }

    relationshipRows(codes) {
        const app = this.app;
        const rows = [];
        const childrenByParents = new Map();
        app.relationships.forEach(r => {
            if (!app.personMap.get(r.fromPersonId) || !app.personMap.get(r.toPersonId)) return;
            const cat = Relationship.getCategory(r.type);
            const a = this.nameOf(r.fromPersonId, codes), b = this.nameOf(r.toPersonId, codes);
            if (r.type === 'parent-child') {
                if (!childrenByParents.has(r.toPersonId)) childrenByParents.set(r.toPersonId, []);
                childrenByParents.get(r.toPersonId).push(r);
                return;
            }
            const name = Relationship.getTypeName(r.type);
            const date = r.date && !codes ? `（${String(r.date).split('\n')[0]}）` : '';
            rows.push({ kind: cat === 'marriage' ? '伴侶' : '情感', text: cat === 'marriage' ? `${a} ═ ${b}　${name}${date}` : `${a} → ${b}　${name}`, relId: r.id, focus: [r.fromPersonId, r.toPersonId] });
        });
        // 親子：同一組父母的子女合成一列
        const groups = new Map();
        childrenByParents.forEach((rels, childId) => {
            const parents = rels.map(r => r.fromPersonId).sort();
            const key = parents.join('+');
            if (!groups.has(key)) groups.set(key, { parents, children: [], relId: rels[0].id });
            const link = rels.find(r => r.linkType && r.linkType !== 'biological')?.linkType;
            groups.get(key).children.push(this.nameOf(childId, codes) + (link === 'adopted' ? '(收養)' : link === 'foster' ? '(寄養)' : ''));
        });
        groups.forEach(g => rows.push({
            kind: '親子', text: `${g.parents.map(id => this.nameOf(id, codes)).join('、')} 的子女：${g.children.join('、')}`,
            relId: g.relId, focus: g.parents
        }));
        const order = { '伴侶': 0, '親子': 1, '情感': 2 };
        return rows.sort((x, y) => order[x.kind] - order[y.kind]);
    }

    relationRow(r) {
        return this.el('button', { type: 'button', class: 'list-row' + (this.app.selectedRelationshipId === r.relId ? ' selected' : ''), onclick: () => this.locateRelationship(r) }, [
            this.el('span', { class: 'list-kind list-kind--' + ({ '伴侶': 'couple', '親子': 'family', '情感': 'emo' }[r.kind]), text: r.kind }),
            this.el('span', { class: 'list-main' }, [this.el('span', { class: 'list-title', text: r.text })])
        ]);
    }

    sortedEvents() {
        return (this.app.events || []).slice().sort((a, b) => (parseInt(a.year, 10) || 99999) - (parseInt(b.year, 10) || 99999));
    }

    eventRow(ev, codes) {
        const editing = this.editingEventId === ev.id;
        return this.el('div', { class: 'ev-row' + (editing ? ' editing' : '') }, [
            this.el('span', { class: 'ev-row-text' }, [
                this.el('span', { class: 'list-year', text: ev.year || '—' }),
                this.el('span', { text: codes ? '（去識別化中，內容不顯示）' : (ev.text || '') })
            ]),
            this.el('button', { type: 'button', class: 'list-btn ev-edit', text: '改', title: '修改這筆事件', onclick: () => this.startEditEvent(ev.id) }),
            this.el('button', { type: 'button', class: 'list-btn danger ev-del', text: '刪', title: '刪除這筆事件（可 Ctrl+Z 復原）', onclick: () => this.deleteEvent(ev.id) })
        ]);
    }

    centerOn(x, y) {
        const c = this.app.canvas;
        c.offsetX = c.width / 2 - x * c.scale;
        c.offsetY = c.height / 2 - y * c.scale;
    }

    locatePerson(id) {
        const app = this.app;
        const p = app.personMap.get(id);
        if (!p) return;
        app.clearAllSelections();
        app.selectPerson(id);
        this.centerOn(p.x, p.y);
        app.updateZoomDisplay?.();
        app.render();
    }

    locateRelationship(r) {
        const app = this.app;
        const pts = r.focus.map(id => app.personMap.get(id)).filter(Boolean);
        if (!pts.length) return;
        app.clearAllSelections();
        app.selectRelationship(r.relId);
        this.centerOn(pts.reduce((s, p) => s + p.x, 0) / pts.length, pts.reduce((s, p) => s + p.y, 0) / pts.length);
        app.render();
    }

    // ───────────────────────── 3. 快捷鈕：去識別化、檢視模式 ─────────────────────────

    buildQuickButtons() {
        // 放在右側面板標題列（收合鈕左邊），不蓋畫布；面板收合或窄螢幕時改用「檢視」分頁的勾選
        const header = document.querySelector('.inspector-header');
        const toggle = document.getElementById('inspectorToggle');
        if (header && toggle) {
            this.deidBtn = this.el('button', { type: 'button', class: 'inspector-quick-btn', id: 'quickDeidBtn', title: '畫面去識別化（姓名改代號，投影或討論時用）', 'aria-label': '畫面去識別化', 'aria-pressed': 'false',
                onclick: () => this.app.setViewOption('deidentifyScreen', this.app.viewOptions.deidentifyScreen !== true) });
            this.deidBtn.appendChild(this.svg(['M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94', 'M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19', 'M14.12 14.12a3 3 0 1 1-4.24-4.24', 'M1 1l22 22']));
            this.presentBtn = this.el('button', { type: 'button', class: 'inspector-quick-btn', id: 'presentModeBtn', title: '檢視模式（唯讀、收起工具，開會投影用；Esc 離開）', 'aria-label': '檢視模式',
                onclick: () => this.setPresentation(true) });
            this.presentBtn.appendChild(this.svg(['M3 4h18v12H3z', 'M8 20h8', 'M12 16v4', 'M10 8l4 2-4 2z']));
            header.insertBefore(this.el('div', { class: 'inspector-quick' }, [this.deidBtn, this.presentBtn]), toggle);
        }
        // 檢視分頁也放一顆「檢視模式」，面板收合時仍找得到
        const viewOpts = document.querySelector('#viewContent .view-options');
        if (viewOpts) viewOpts.appendChild(this.el('button', { type: 'button', class: 'list-btn view-present-btn', text: '進入檢視模式（唯讀投影）', onclick: () => this.setPresentation(true) }));

        this.exitPresent = this.el('button', { type: 'button', class: 'present-exit', id: 'presentExitBtn', hidden: true, onclick: () => this.setPresentation(false) }, [
            this.el('span', { text: '檢視模式中（唯讀）' }), this.el('strong', { text: '離開 Esc' })
        ]);
        document.body.appendChild(this.exitPresent);
        this.deidBanner = this.el('div', { class: 'deid-banner', role: 'status', text: '去識別化顯示中：姓名以代號呈現，備註、關係說明與重大事件不顯示（資料未更動）' });
        (document.getElementById('canvasContainer') || document.body).appendChild(this.deidBanner);
    }

    syncQuickButtons() {
        const on = this.app.viewOptions.deidentifyScreen === true;
        if (this.deidBanner) this.deidBanner.hidden = !on;
        if (!this.deidBtn) return;
        this.deidBtn.classList.toggle('active', on);
        this.deidBtn.setAttribute('aria-pressed', String(on));
    }

    setPresentation(on) {
        const app = this.app;
        this.presenting = !!on;
        document.body.classList.toggle('presentation-mode', this.presenting);
        this.exitPresent.hidden = !this.presenting;
        if (this.presenting) {
            document.dispatchEvent(new CustomEvent('genogram:presentation', { detail: { on: true } })); // 讓其他浮動面板自行收起
            app.cancelRelationshipWorkflow?.();
            app.clearAllSelections();
            app.updatePropertyPanel();
        }
        requestAnimationFrame(() => {
            app.canvas.resize?.();
            if (this.presenting) app.fitToView();
            app.render();
        });
    }

    /** 檢視模式：攔截編輯（點選、拖曳、雙擊、快捷鍵），只留平移與縮放 */
    installPresentationGuards() {
        const app = this.app;
        const container = document.getElementById('canvasContainer');
        if (!container) return;
        let pan = null;
        container.addEventListener('pointerdown', e => {
            if (!this.presenting || e.target !== app.canvas.canvas) return;
            e.stopImmediatePropagation();
            e.preventDefault();
            pan = { x: e.clientX, y: e.clientY, ox: app.canvas.offsetX, oy: app.canvas.offsetY };
        }, true);
        window.addEventListener('pointermove', e => {
            if (!this.presenting || !pan) return;
            e.stopImmediatePropagation();
            app.canvas.offsetX = pan.ox + (e.clientX - pan.x);
            app.canvas.offsetY = pan.oy + (e.clientY - pan.y);
            app.requestRender();
        }, true);
        window.addEventListener('pointerup', e => {
            if (!pan) return;
            pan = null;
            if (this.presenting) e.stopImmediatePropagation();
        }, true);
        ['dblclick', 'contextmenu'].forEach(type => container.addEventListener(type, e => {
            if (this.presenting) { e.stopImmediatePropagation(); e.preventDefault(); }
        }, true));
        window.addEventListener('keydown', e => {
            if (!this.presenting) return;
            if (e.key === 'Escape') { e.preventDefault(); this.setPresentation(false); }
            if (e.key !== 'F11') e.stopImmediatePropagation();
        }, true);
    }

    // ───────────────────────── 4. 匯出 Word ─────────────────────────

    installExportDOCX() {
        const extras = this;
        this.app.exportDOCX = function (showNotes, showLegend, header, deidentify, legendAll) {
            return extras.exportDOCX(showNotes, showLegend, header, deidentify, legendAll);
        };
    }

    /** 以一般 <script> 載入本機 docx（file:// 開啟時 ES module import 會被瀏覽器擋，所以不用 import()） */
    loadDocx() {
        if (window.docx && window.docx.Document) return Promise.resolve(window.docx);
        if (!this._docxLoading) {
            this._docxLoading = new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = GenogramExtras.DOCX_SRC;
                s.onload = () => (window.docx && window.docx.Document ? resolve(window.docx) : reject(new Error('Word 元件載入失敗')));
                s.onerror = () => reject(new Error('找不到 Word 元件（js/vendor/docx.iife.js），請確認檔案完整'));
                document.head.appendChild(s);
            }).catch(err => { this._docxLoading = null; throw err; });
        }
        return this._docxLoading;
    }

    async exportDOCX(showNotes = true, showLegend = true, header = null, deidentify = false, legendAll = false) {
        const app = this.app;
        const docx = await this.loadDocx();
        await app.waitForCurrentCanvasFonts();
        const ds = app.getExportDataset(deidentify); // 表格用（代號、年齡帶）
        app.canvas.personMap = app.personMap;
        app.canvas.displayOverride = deidentify ? app.getDeidentifiedDisplay() : null;
        let dataUrl;
        try {
            dataUrl = app.canvas.exportToPNG(app.persons, app.relationships, app.households || [], app.lifeCircles || [],
                showNotes, showLegend, 2, app.viewOptions, null, legendAll);
        } finally { app.canvas.displayOverride = null; }
        if (!dataUrl) throw new Error('沒有內容可匯出');

        const img = await new Promise((resolve, reject) => {
            const im = new Image(); im.onload = () => resolve(im); im.onerror = reject; im.src = dataUrl;
        });
        const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0));
        const maxW = 620; // A4 直式內文寬約 16.5 cm
        const w = Math.min(maxW, img.naturalWidth / 2);
        const h = Math.round(w * img.naturalHeight / img.naturalWidth);

        const { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, ShadingType } = docx;
        const font = { ascii: 'Calibri', hAnsi: 'Calibri', eastAsia: 'Microsoft JhengHei' };
        const meta = header || GenogramApp.normalizeDocumentMeta(app.documentMeta);
        const title = deidentify ? '家系圖（去識別化）' : (meta.title || '家系圖');
        const today = new Date().toISOString().slice(0, 10);
        const metaLine = [meta.caseId && `案號：${meta.caseId}`, meta.author && `繪製者：${meta.author}`, `日期：${meta.date || today}`].filter(Boolean).join('　');

        const cell = (text, opts = {}) => new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: String(text ?? ''), bold: !!opts.bold, size: 20, font })] })],
            shading: opts.head ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F3F4F6' } : undefined,
            width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined
        });
        const table = (heads, rows, widths) => new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [new TableRow({ tableHeader: true, children: heads.map((t, i) => cell(t, { bold: true, head: true, width: widths[i] })) })]
                .concat(rows.map(r => new TableRow({ children: r.map((t, i) => cell(t, { width: widths[i] })) })))
        });
        const h2 = text => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 }, children: [new TextRun({ text, font, bold: true })] });

        const children = [
            new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: title, font, bold: true })] }),
            new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: metaLine, size: 20, color: '6B7280', font })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: bytes, transformation: { width: w, height: h } })] })
        ];

        // 成員一覽
        const people = ds.persons.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
        children.push(h2('成員一覽'));
        children.push(table(['姓名／代號', '性別', '年齡', '狀態', '備註'], people.map(p => {
            const age = deidentify ? (p.age ?? '') : (typeof p.getDisplayAge === 'function' ? p.getDisplayAge(app.ageReferenceDate) : p.age);
            const status = [p.isIdentifiedPatient && '案主', p.isDeceased && '已故', p.lossType === 'miscarriage' && '流產', p.lossType === 'abortion' && '人工流產'].filter(Boolean).join('、');
            return [p.name || '（未命名）', GenogramExtras.genderLabel(p), p.gender === 'pet' ? '' : (age ?? ''), status, deidentify || !showNotes ? '' : (p.notes || '')];
        }), [20, 10, 10, 15, 45]));

        // 關係摘要
        const nameMap = new Map(ds.persons.map(p => [p.id, p.name || '（未命名）']));
        const relRows = app.relationships
            .filter(r => r.type !== 'parent-child' && Relationship.isVisibleInView(r.type, app.viewOptions)
                && nameMap.has(r.fromPersonId) && nameMap.has(r.toPersonId))
            .map(r => [`${nameMap.get(r.fromPersonId)}　${Relationship.getCategory(r.type) === 'marriage' ? '＝' : '→'}　${nameMap.get(r.toPersonId)}`,
                Relationship.getTypeName(r.type), deidentify || !showNotes ? '' : String(r.date || '').replace(/\n/g, ' ')]);
        if (relRows.length) {
            children.push(h2('伴侶與情感關係'));
            children.push(table(['成員', '關係', '時間／說明'], relRows, [40, 25, 35]));
        }

        // 重大事件（去識別化時不輸出：自由文字可能含姓名）
        const events = this.sortedEvents();
        if (events.length && !deidentify) {
            children.push(h2('重大事件'));
            children.push(table(['年份', '事件'], events.map(e => [e.year || '', e.text || '']), [15, 85]));
        }
        children.push(new Paragraph({ spacing: { before: 240 }, children: [new TextRun({ text: '本文件由勵馨家系圖生成器產生。' + (deidentify ? '已去識別化。' : '含個案資料，請依機構個資規範保存。'), size: 16, color: '9CA3AF', font })] }));

        const doc = new Document({
            creator: '勵馨家系圖生成器',
            title,
            styles: { default: { document: { run: { font, size: 22 } } } },
            sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } }, children }]
        });
        const blob = await Packer.toBlob(doc);
        const url = URL.createObjectURL(blob);
        const a = this.el('a', { href: url, download: `genogram_${today}${deidentify ? '_去識別化' : ''}.docx` });
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // app.js 的 DOMContentLoaded 先註冊先執行，這裡 window.app 已建立
    if (window.app && !window.genogramExtras) window.genogramExtras = new GenogramExtras(window.app);
});
