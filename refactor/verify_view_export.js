const { openApp, createChecks, finish } = require('./contract_harness');

(async () => {
    const { browser, page, errors } = await openApp();
    const { failures, passes, check } = createChecks();
    const result = await page.evaluate(() => {
        const app = window.app;
        app.persons = [
            new Person({ id: 'a', x: 200, y: 200, name: '甲', age: 40, notes: '備註' }),
            new Person({ id: 'b', x: 460, y: 200, gender: 'female', name: '乙' })
        ];
        app._syncPersonMap();
        app.relationships = [
            new Relationship({ id: 'e', fromPersonId: 'a', toPersonId: 'b', type: 'conflict', date: '2020' }),
            new Relationship({ id: 'a2', fromPersonId: 'a', toPersonId: 'b', type: 'abuse', date: '2021' })
        ];
        app.households = [{ id: 'hh', ids: ['a', 'b'] }];
        app.lifeCircles = [{ id: 'lc', points: [{ x: 50, y: 50 }, { x: 600, y: 50 }, { x: 600, y: 350 }] }];
        const view = {
            ...app.viewOptions,
            showNames: false,
            showAges: false,
            showNotes: false,
            showMedical: false,
            showEmotionalRelationships: false,
            showHouseholds: false,
            showLifeCircles: false
        };
        const visible = app.canvas.getVisibleExportData(app.persons, app.relationships,
            app.households, app.lifeCircles, view);
        const before = JSON.stringify(app.persons.map(person => person.toJSON()));
        const legendTitles = [];
        const personViewOptions = [];
        const originalLegendSection = app.canvas.drawLegendSection;
        const originalDrawPersonForExport = app.canvas.drawPersonForExport;
        app.canvas.drawLegendSection = function(ctx, section, ...rest) {
            legendTitles.push(section.title);
            return originalLegendSection.call(this, ctx, section, ...rest);
        };
        app.canvas.drawPersonForExport = function(person, options) {
            personViewOptions.push(options);
            return originalDrawPersonForExport.call(this, person, options);
        };
        const png = app.canvas.exportToPNG(app.persons, app.relationships, app.households,
            app.lifeCircles, true, true, 1, view);
        app.canvas.drawLegendSection = originalLegendSection;
        app.canvas.drawPersonForExport = originalDrawPersonForExport;
        const after = JSON.stringify(app.persons.map(person => person.toJSON()));
        return {
            relTypes: visible.relationships.map(rel => rel.type),
            householdCount: visible.households.length,
            circleCount: visible.lifeCircles.length,
            effectiveNotes: visible.viewOptions.showNotes,
            legendTitles,
            personOptionsApplied: personViewOptions.length === 2 && personViewOptions.every(options =>
                options.showNames === false && options.showAges === false
                && options.showNotes === false && options.showMedical === false),
            pngOk: typeof png === 'string' && png.startsWith('data:image/png'),
            unchanged: before === after
        };
    });
    check('export retains abuse but removes ordinary emotion',
        JSON.stringify(result.relTypes) === JSON.stringify(['abuse']), JSON.stringify(result.relTypes));
    check('export removes hidden household and life-circle layers',
        result.householdCount === 0 && result.circleCount === 0, JSON.stringify(result));
    check('View notes off overrides export-dialog notes on', result.effectiveNotes === false);
    check('hidden emotional sections are removed from the export legend',
        JSON.stringify(result.legendTitles) === JSON.stringify(['家庭關係', '虐待/暴力']),
        JSON.stringify(result.legendTitles));
    check('person-level export options hide names ages notes and medical markers', result.personOptionsApplied);
    check('filtered export still produces PNG', result.pngOk);
    check('export never mutates Person data', result.unchanged);

    const threaded = await page.evaluate(async () => {
        const app = window.app;
        const canvas = app.canvas;
        const pngCalls = [];
        const jpegCalls = [];
        const originalPng = canvas.exportToPNG;
        const originalJpeg = canvas.exportToJPEG;
        canvas.exportToPNG = (...args) => { pngCalls.push(args); return null; };
        canvas.exportToJPEG = (...args) => { jpegCalls.push(args); return null; };
        await app.exportPNG(true, false, 1);
        await app.exportJPEG(true, false, 1);
        await app.exportSVG(true, false, 1);
        await app.exportPDF(true, false, 1);
        await app.copyImageToClipboard();
        canvas.exportToPNG = originalPng;
        canvas.exportToJPEG = originalJpeg;
        return {
            pngCalls: pngCalls.length,
            jpegCalls: jpegCalls.length,
            pngThreaded: pngCalls.every(args => args[args.length - 1] === app.viewOptions),
            jpegThreaded: jpegCalls.every(args => args[args.length - 1] === app.viewOptions)
        };
    });
    check('PNG-backed App paths all forward viewOptions',
        threaded.pngCalls === 4 && threaded.pngThreaded, JSON.stringify(threaded));
    check('JPEG App path forwards viewOptions',
        threaded.jpegCalls === 1 && threaded.jpegThreaded, JSON.stringify(threaded));
    check('zero page/console errors', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'ALL VIEW EXPORT CHECKS PASSED');
})().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
