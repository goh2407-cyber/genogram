/**
 * 線上版延伸功能（DEMO，參考 genogram.drsexswag.com）：
 * 1. 右側「清單」分頁：人物／關係，可搜尋；點一下定位並選取
 * 2. 右側「記事」分頁：家庭記事（年份自動辨識、類別圓點、原地修改），畫成圖下方的時間軸卡（可拖曳）
 * 3. 畫布左下快捷鈕：畫面去識別化、檢視模式（唯讀簡報）
 * 4. 匯出 Word（圖＋成員表＋事件），程式庫第一次匯出才從 jsDelivr 載入
 * 只在根目錄 index.html 載入；離線包 geno/ 不載入。不改任何線條顏色與樣式。
 */
class GenogramExtras {
    static DOCX_URL = 'https://cdn.jsdelivr.net/npm/docx@9.7.2/+esm';
    static GENDER = { male: '男', female: '女', pregnancy: '懷孕', same: '其他' };

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
        // 工具列「記事」鈕（複製圖片旁）：展開右側面板並切到記事分頁
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

    /** 記事類別：圓點顏色（時間軸卡）與面板標籤共用 */
    static NOTE_KINDS = [
        { key: 'family', label: '家庭', color: '#ed1261' },
        { key: 'health', label: '健康', color: '#16a34a' },
        { key: 'school', label: '學校', color: '#2563eb' },
        { key: 'legal', label: '司法', color: '#7c3aed' },
        { key: 'service', label: '服務', color: '#ea580c' }
    ];

    static kindOf(key) {
        return GenogramExtras.NOTE_KINDS.find(k => k.key === key) || GenogramExtras.NOTE_KINDS[0];
    }

    /** 「2019 父母分居」→ {year:'2019', text:'父母分居'}；開頭不是年份就整句當內容 */
    static parseNote(raw) {
        const m = /^\s*((?:約)?\d{4}(?:[./-]\d{1,2})?)\s*[、,:：]?\s*(.*)$/.exec(String(raw || ''));
        if (m && m[2].trim()) return { year: m[1].trim(), text: m[2].trim() };
        return { year: '', text: String(raw || '').trim() };
    }

    buildEventsPanel() {
        this.eventsPanel = document.getElementById('eventsPanel');
        if (!this.eventsPanel) return;
        this.noteKind = 'family';
        // 一行式輸入：年份寫在開頭自動辨識；Enter 記下
        this.evInput = this.el('input', { type: 'text', class: 'note-input', placeholder: '寫一筆記事，年份寫在開頭，例如：2019 父母分居', maxlength: '220', 'aria-label': '記事內容' });
        this.evInput.addEventListener('keydown', e => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); this.submitEvent(); }
        });
        this.kindChips = this.el('div', { class: 'note-kinds', role: 'radiogroup', 'aria-label': '記事類別' },
            GenogramExtras.NOTE_KINDS.map(k => {
                const chip = this.el('button', { type: 'button', class: 'note-kind', 'data-kind': k.key, role: 'radio', 'aria-checked': String(k.key === this.noteKind), onclick: () => this.setNoteKind(k.key) }, [
                    this.el('span', { class: 'note-dot', style: `background:${k.color}` }), this.el('span', { text: k.label })
                ]);
                return chip;
            }));
        this.evSubmit = this.el('button', { type: 'button', class: 'list-btn primary', text: '記下', onclick: () => this.submitEvent() });
        this.eventForm = this.el('div', { class: 'note-composer' }, [
            this.evInput,
            this.el('div', { class: 'note-composer-row' }, [this.kindChips, this.evSubmit])
        ]);
        this.eventItems = this.el('div', { class: 'note-list' });
        this.eventsCount = this.el('p', { class: 'list-section-title', text: '時間軸（0）' });
        this.resetEventsPosBtn = this.el('button', { type: 'button', class: 'list-btn', text: '卡片放回預設位置', title: '把時間軸卡放回家系圖左下', onclick: () => {
            const app = this.app;
            if (!app.eventsLayout) return;
            app.saveState(); app.eventsLayout = null; app.autoSave(); app.render();
        } });
        this.eventsPanel.append(
            this.eventForm,
            this.eventsCount,
            this.eventItems,
            this.el('div', { class: 'list-inline-actions' }, [this.resetEventsPosBtn]),
            this.el('p', { class: 'list-hint', text: '點記事文字可直接修改；滑到右邊按 × 刪除。時間軸卡畫在家系圖左下，按住可拖到想放的位置，會跟著存檔與匯出。' })
        );
        this.setNoteKind('family');
    }

    setNoteKind(key) {
        this.noteKind = GenogramExtras.kindOf(key).key;
        this.kindChips?.querySelectorAll('.note-kind').forEach(c => {
            const on = c.dataset.kind === this.noteKind;
            c.classList.toggle('active', on);
            c.setAttribute('aria-checked', String(on));
        });
    }

    openEventsPanel() {
        const app = this.app;
        if (app.isCompactInspector?.()) app.setCompactInspectorOpen(true);
        else if (app.inspectorDesktopCollapsed) app.setInspectorCollapsed(false);
        app.setInspectorTab('events');
        this.refreshEvents(true);
        this.evInput?.focus();
    }

    refreshEvents(force = false) {
        if (!this.eventsPanel) return;
        const app = this.app;
        const codes = this.displayNames();
        const events = this.sortedEvents();
        const sig = ['ev', codes ? 1 : 0, app.eventsLayout ? app.eventsLayout.x + ',' + app.eventsLayout.y : '', this.editingEventId || '',
            ...events.map(e => e.id + e.year + e.text + (e.kind || ''))].join('|');
        if (!force && sig === this.lastEventsSignature) return;
        this.lastEventsSignature = sig;
        this.eventsCount.textContent = `時間軸（${events.length}）`;
        this.eventItems.replaceChildren();
        events.forEach(e => this.eventItems.appendChild(this.eventRow(e, codes)));
        if (!events.length) this.eventItems.appendChild(this.el('p', { class: 'list-empty', text: '還沒有記事，在上面寫一筆。' }));
        this.resetEventsPosBtn.hidden = !app.eventsLayout;
    }

    /** 新增（從一行式輸入解析年份）；editingEventId 有值時改為更新該筆 */
    submitEvent(rawValue = null) {
        const app = this.app;
        const raw = rawValue !== null ? rawValue : this.evInput.value;
        const parsed = GenogramExtras.parseNote(raw);
        if (!parsed.text) { this.evInput.focus(); return; }
        app.saveState();
        if (this.editingEventId) {
            const ev = app.events.find(e => e.id === this.editingEventId);
            if (ev) { ev.year = parsed.year; ev.text = parsed.text; }
            this.editingEventId = null;
        } else {
            app.events.push({ id: 'ev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), year: parsed.year, text: parsed.text, kind: this.noteKind });
        }
        this.evInput.value = '';
        app.autoSave();
        app.render();
        this.refreshEvents(true);
        this.evInput.focus();
    }

    resetEventForm() {
        this.editingEventId = null;
        if (this.evInput) this.evInput.value = '';
        this.refreshEvents(true);
    }

    /** 點記事文字 → 原地改（Enter 儲存、Esc 取消） */
    startEditEvent(id) {
        this.editingEventId = id;
        this.refreshEvents(true);
        const inp = this.eventItems.querySelector('.note-edit');
        if (inp) { inp.focus(); inp.select(); }
    }

    cycleEventKind(ev) {
        const app = this.app;
        const kinds = GenogramExtras.NOTE_KINDS;
        const i = kinds.findIndex(k => k.key === (ev.kind || 'family'));
        app.saveState();
        ev.kind = kinds[(i + 1) % kinds.length].key;
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
        const meta = [GenogramExtras.GENDER[p.gender] || '', (age !== null && age !== undefined && age !== '') ? `${age} 歲` : '', p.isDeceased ? '已故' : '']
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
        const app = this.app;
        const kind = GenogramExtras.kindOf(ev.kind);
        const editing = this.editingEventId === ev.id;
        const dot = this.el('button', { type: 'button', class: 'note-dot note-dot--btn', style: `background:${kind.color}`, title: `類別：${kind.label}（點一下切換）`, 'aria-label': `類別 ${kind.label}，點一下切換`, onclick: () => this.cycleEventKind(ev) });
        let body;
        if (editing) {
            const inp = this.el('input', { type: 'text', class: 'note-edit', value: `${ev.year ? ev.year + ' ' : ''}${ev.text || ''}`, maxlength: '220', 'aria-label': '修改記事' });
            inp.addEventListener('keydown', e => {
                e.stopPropagation();
                if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); this.submitEvent(inp.value); }
                if (e.key === 'Escape') { e.preventDefault(); this.resetEventForm(); }
            });
            inp.addEventListener('blur', () => { if (this.editingEventId === ev.id) this.submitEvent(inp.value); });
            body = inp;
        } else {
            body = this.el('button', { type: 'button', class: 'note-text', title: '點一下修改', onclick: () => this.startEditEvent(ev.id) }, [
                this.el('span', { class: 'list-year', text: ev.year || '—' }),
                this.el('span', { text: codes ? '（去識別化中，內容不顯示）' : (ev.text || '') })
            ]);
        }
        return this.el('div', { class: 'note-row' + (editing ? ' editing' : '') }, [
            dot,
            body,
            this.el('button', { type: 'button', class: 'note-del', text: '×', title: '刪除這筆記事', 'aria-label': '刪除記事', onclick: () => {
                app.saveState();
                app.events = app.events.filter(e => e.id !== ev.id);
                if (this.editingEventId === ev.id) this.editingEventId = null;
                app.autoSave(); app.render(); this.refreshEvents(true);
            } })
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
        this.deidBanner = this.el('div', { class: 'deid-banner', role: 'status', text: '去識別化顯示中：姓名以代號呈現，備註、關係說明與記事不顯示（資料未更動）' });
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

    async exportDOCX(showNotes = true, showLegend = true, header = null, deidentify = false, legendAll = false) {
        const app = this.app;
        let docx;
        try {
            docx = await import(GenogramExtras.DOCX_URL);
        } catch (err) {
            throw new Error('Word 匯出需要網路（第一次要下載程式庫），請確認可以連線');
        }
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
            return [p.name || '（未命名）', GenogramExtras.GENDER[p.gender] || '', age ?? '', status, deidentify || !showNotes ? '' : (p.notes || '')];
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

        // 家庭記事（去識別化時不輸出：自由文字可能含姓名）
        const events = this.sortedEvents();
        if (events.length && !deidentify) {
            children.push(h2('家庭記事'));
            children.push(table(['年份', '類別', '記事'], events.map(e => [e.year || '', GenogramExtras.kindOf(e.kind).label, e.text || '']), [15, 12, 73]));
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
