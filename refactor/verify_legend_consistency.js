const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { openApp, createChecks, finish } = require('./contract_harness');

const ROOT = path.resolve(__dirname, '..');
const normalize = text => text.replace(/\r\n/g, '\n');
const hash = text => crypto.createHash('sha256').update(normalize(text), 'utf8').digest('hex');

function extractBracedSource(source, marker) {
    const start = source.indexOf(marker);
    if (start < 0) throw new Error(`Missing source marker: ${marker}`);
    const open = source.indexOf('{', start);
    let depth = 0;
    for (let index = open; index < source.length; index++) {
        if (source[index] === '{') depth++;
        if (source[index] === '}') {
            depth--;
            if (depth === 0) return source.slice(start, index + 1);
        }
    }
    throw new Error(`Unterminated source marker: ${marker}`);
}

const expectedSections = [
    {
        id: 'family', groupId: 'family', groupTitle: '家庭與伴侶', title: '家庭與伴侶',
        entries: [
            ['parent-child', 'biological', '親生子女', 'parent-child'],
            ['parent-child', 'adopted', '收養子女', 'parent-child-adopted'],
            ['parent-child', 'foster', '寄養子女', 'parent-child-foster'],
            ['married', '', '結婚', 'married'],
            ['engaged', '', '訂婚', 'engaged'],
            ['cohabiting', '', '同居', 'cohabiting'],
            ['legal-cohabiting', '', '法律同居', 'legal-cohabiting'],
            ['separated', '', '事實分居', 'separated'],
            ['legal-separated', '', '法律分居', 'legal-separated'],
            ['divorced', '', '離婚', 'divorced'],
            ['widowed', '', '喪偶', 'widowed'],
            ['affair', '', '外遇', 'affair']
        ]
    },
    {
        id: 'emotional-positive', groupId: 'emotional', groupTitle: '情感關係', title: '正向',
        entries: [
            ['harmony', '', '和諧', 'harmony'],
            ['love', '', '愛', 'love'],
            ['in-love', '', '熱戀', 'in-love'],
            ['close', '', '親密/友誼', 'close'],
            ['very-close', '', '非常親密', 'very-close'],
            ['admiration', '', '崇拜', 'admiration'],
            ['focused', '', '關注', 'focused']
        ]
    },
    {
        id: 'emotional-negative', groupId: 'emotional', groupTitle: '情感關係', title: '負向',
        entries: [
            ['indifferent', '', '冷漠', 'indifferent'],
            ['distant', '', '疏離', 'distant'],
            ['cutoff', '', '斷絕', 'cutoff'],
            ['conflict', '', '衝突', 'conflict'],
            ['hate', '', '仇恨', 'hate'],
            ['hostile', '', '敵對', 'hostile'],
            ['distant-hostile', '', '遠距敵對', 'distant-hostile'],
            ['close-hostile', '', '親密敵對', 'close-hostile'],
            ['conflict-close', '', '衝突又親密', 'conflict-close']
        ]
    },
    {
        id: 'special', groupId: 'special', groupTitle: '暴力與特殊關係', title: '暴力與特殊關係',
        entries: [
            ['violence', '', '暴力', 'violence'],
            ['abuse', '', '虐待', 'abuse'],
            ['physical-abuse', '', '身體虐待', 'physical-abuse'],
            ['emotional-abuse', '', '情緒虐待', 'emotional-abuse'],
            ['sexual-abuse', '', '性虐待', 'sexual-abuse'],
            ['neglect', '', '忽視', 'neglect'],
            ['manipulative', '', '操控', 'manipulative'],
            ['controlling', '', '控制', 'controlling']
        ]
    }
];

(async () => {
    const { browser, page, errors } = await openApp();
    const { failures, passes, check } = createChecks();

    const css = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');
    const legendRules = [...css.matchAll(/\.legend-line(?:[^,{]*)\{[^}]*\}/g)]
        .map(match => match[0]).join('\n');
    const relationshipSource = fs.readFileSync(path.join(ROOT, 'js', 'relationship.js'), 'utf8');
    const canvasSource = fs.readFileSync(path.join(ROOT, 'js', 'canvas.js'), 'utf8');
    check('40x14 legend SVG source is unchanged',
        hash(legendRules)
            === '10401936d761d5fc515ceaea8c76ecce921d28c2a523af997e2d5d426b492c80');
    check('Relationship.getLineStyle is unchanged',
        hash(extractBracedSource(relationshipSource, '    getLineStyle() '))
            === '39965b588e39143742f8da07d6587cdcea00b0c97b24dc0b718a068d08eb65eb');
    check('DASH_PATTERNS is unchanged',
        hash(extractBracedSource(canvasSource, 'const DASH_PATTERNS = '))
            === '0d4daad95281fa3eb9693cffffc38209574248f52a746b2f411c73349267f0ff');

    const result = await page.evaluate(() => {
        const sections = typeof Relationship.getLegendSections === 'function'
            ? Relationship.getLegendSections()
            : [];
        const visualKeys = new Set(['color', 'width', 'pattern', 'decoration']);
        const entries = sections.flatMap(section => section.entries || []);
        const knownTypes = new Set(Object.values(Relationship.TYPES));
        return {
            sections: sections.map(section => ({
                id: section.id,
                groupId: section.groupId,
                groupTitle: section.groupTitle,
                title: section.title,
                entries: (section.entries || []).map(entry => [
                    entry.type, entry.linkType || '', entry.label, entry.legendClass
                ])
            })),
            groupIds: [...document.querySelectorAll('[data-legend-group]')]
                .map(element => element.dataset.legendGroup),
            domSections: [...document.querySelectorAll('[data-legend-section]')]
                .map(element => element.dataset.legendSection),
            domEntries: [...document.querySelectorAll('#legendContent [data-legend-type]')]
                .map(element => {
                    const sample = element.querySelector('.legend-line');
                    return [
                        element.dataset.legendType,
                        element.dataset.legendLinkType || '',
                        element.querySelector('.legend-label')?.textContent || '',
                        sample ? [...sample.classList].filter(name => name !== 'legend-line')[0] || '' : ''
                    ];
                }),
            subheadings: [...document.querySelectorAll('[data-legend-group="emotional"] .legend-subcategory-title')]
                .map(element => element.textContent),
            hasVisualMetadata: sections.some(section => [...Object.keys(section),
                ...entries.flatMap(entry => Object.keys(entry))].some(key => visualKeys.has(key))),
            knownTypes: entries.every(entry => knownTypes.has(entry.type)),
            deeplyFrozen: Boolean(Relationship.LEGEND_SECTIONS)
                && Object.isFrozen(Relationship.LEGEND_SECTIONS)
                && Relationship.LEGEND_SECTIONS.every(section => Object.isFrozen(section)
                    && Object.isFrozen(section.entries)
                    && section.entries.every(Object.isFrozen))
        };
    });

    const exportResult = await page.evaluate(() => {
        const canvas = window.app.canvas;
        const hasAdapters = typeof canvas.getLegendRenderItem === 'function'
            && typeof canvas.getLegendRenderSections === 'function';
        const serializeSections = sections => sections.map(section => ({
            id: section.id,
            title: section.title,
            labels: section.items.map(item => item.label)
        }));
        const fullSections = hasAdapters ? canvas.getLegendRenderSections() : [];
        const hiddenSections = hasAdapters ? canvas.getLegendRenderSections({
            showEmotionalRelationships: false
        }) : [];
        const styleChecks = hasAdapters ? Relationship.getLegendSections().flatMap(section =>
            section.entries.map(entry => {
                const line = new Relationship({ type: entry.type, linkType: entry.linkType }).getLineStyle();
                const item = canvas.getLegendRenderItem(entry);
                let expectedStyle = line.pattern;
                if (entry.type === 'parent-child' && entry.linkType === 'adopted') expectedStyle = 'dashed';
                if (entry.type === 'parent-child' && entry.linkType === 'foster') expectedStyle = 'dotted';
                return Boolean(item)
                    && item.label === entry.label
                    && item.style === expectedStyle
                    && item.color === line.color
                    && item.width === line.width
                    && item.decoration === line.decoration;
            })) : [];

        const drawn = [];
        const context = document.createElement('canvas').getContext('2d');
        const originalDrawLegendSection = canvas.drawLegendSection;
        canvas.drawLegendSection = function(ctx, section) {
            drawn.push({ id: section.id, title: section.title, labels: section.items.map(item => item.label) });
        };
        canvas.drawExportLegend(context, 0, 0, {});
        const fullDrawn = drawn.splice(0);
        canvas.drawExportLegend(context, 0, 0, { showEmotionalRelationships: false });
        const hiddenDrawn = drawn.splice(0);
        canvas.drawLegendSection = originalDrawLegendSection;
        return {
            hasAdapters,
            fullSections: serializeSections(fullSections),
            hiddenSections: serializeSections(hiddenSections),
            stylesMatch: styleChecks.length === 36 && styleChecks.every(Boolean),
            fullDrawn,
            hiddenDrawn
        };
    });

    check('legend metadata preserves the approved four-section order and all 36 entries',
        JSON.stringify(result.sections) === JSON.stringify(expectedSections), JSON.stringify(result.sections));
    check('legend metadata is deeply frozen', result.deeplyFrozen);
    check('legend metadata contains no copied visual styles', !result.hasVisualMetadata);
    check('every legend entry uses a known relationship type', result.knownTypes);
    check('sidebar exposes exactly three main legend groups',
        JSON.stringify(result.groupIds) === JSON.stringify(['family', 'emotional', 'special']),
        JSON.stringify(result.groupIds));
    check('sidebar section order matches metadata',
        JSON.stringify(result.domSections) === JSON.stringify(expectedSections.map(section => section.id)),
        JSON.stringify(result.domSections));
    check('sidebar entry order, text, link type, and existing SVG class match metadata',
        JSON.stringify(result.domEntries) === JSON.stringify(expectedSections.flatMap(section => section.entries)),
        JSON.stringify(result.domEntries));
    check('emotional group retains positive and negative subheadings',
        JSON.stringify(result.subheadings) === JSON.stringify(['正向', '負向']),
        JSON.stringify(result.subheadings));
    const expectedExport = expectedSections.map(section => ({
        id: section.id,
        title: section.id === 'emotional-positive' ? '情感關係（正向）'
            : section.id === 'emotional-negative' ? '情感關係（負向）'
            : section.title,
        labels: section.entries.map(entry => entry[2])
    }));
    const expectedHidden = expectedExport.filter(section => !section.id.startsWith('emotional-'));
    check('Canvas exposes shared legend render adapters', exportResult.hasAdapters);
    check('export legend sections and entry order come from shared metadata',
        JSON.stringify(exportResult.fullSections) === JSON.stringify(expectedExport),
        JSON.stringify(exportResult.fullSections));
    check('export legend adapter derives every visual style from Relationship',
        exportResult.stylesMatch);
    check('hidden emotional view keeps family and special export sections',
        JSON.stringify(exportResult.hiddenSections) === JSON.stringify(expectedHidden),
        JSON.stringify(exportResult.hiddenSections));
    check('drawExportLegend draws shared sections in their metadata order',
        JSON.stringify(exportResult.fullDrawn) === JSON.stringify(expectedExport),
        JSON.stringify(exportResult.fullDrawn));
    check('drawExportLegend omits only emotional sections when hidden',
        JSON.stringify(exportResult.hiddenDrawn) === JSON.stringify(expectedHidden),
        JSON.stringify(exportResult.hiddenDrawn));
    check('zero page/console errors', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'ALL LEGEND CONSISTENCY CHECKS PASSED');
})().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
