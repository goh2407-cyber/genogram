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
        JSON.stringify(result.legendTitles) === JSON.stringify(['家庭與伴侶', '暴力與特殊關係']),
        JSON.stringify(result.legendTitles));
    check('person-level export options hide names ages notes and medical markers', result.personOptionsApplied);
    check('filtered export still produces PNG', result.pngOk);
    check('export never mutates Person data', result.unchanged);

    const cacheRestoration = await page.evaluate(() => {
        const app = window.app;
        const canvas = app.canvas;
        app.persons = [
            new Person({ id: 'parent-a', x: 200, y: 200, name: '父' }),
            new Person({ id: 'parent-b', x: 460, y: 200, gender: 'female', name: '母' }),
            new Person({ id: 'child', x: 330, y: 420, name: '子' })
        ];
        app.relationships = [
            new Relationship({ id: 'marriage', fromPersonId: 'parent-a',
                toPersonId: 'parent-b', type: 'married' }),
            new Relationship({ id: 'family-a', fromPersonId: 'parent-a',
                toPersonId: 'child', type: 'parent-child' }),
            new Relationship({ id: 'family-b', fromPersonId: 'parent-b',
                toPersonId: 'child', type: 'parent-child' }),
            new Relationship({ id: 'emotion', fromPersonId: 'parent-a',
                toPersonId: 'parent-b', type: 'conflict' })
        ];
        app._syncPersonMap();
        app.viewOptions = {
            ...app.viewOptions,
            showEmotionalRelationships: true
        };
        app.render();
        const hiddenExportView = {
            ...app.viewOptions,
            showEmotionalRelationships: false
        };
        const capture = () => {
            const familyPlans = new Set(canvas._familyRoutePlans || []);
            for (const cached of canvas._familyPlanCache?.values?.() || []) {
                if (cached?.plan) familyPlans.add(cached.plan);
            }
            return {
            ctx: canvas.ctx,
            viewOptions: canvas.viewOptions,
            personMap: canvas.personMap,
            lastPersons: canvas.lastPersons,
            lastRelationships: canvas.lastRelationships,
            derivedSignature: canvas._derivedGeometrySignature,
            personLabelPlacements: canvas.personLabelPlacements,
            marriageRouteCache: canvas.marriageRouteCache,
            labelRoutingWarnings: canvas.labelRoutingWarnings,
            familySignature: canvas._familyRouteSignature,
            familyPlanCache: canvas._familyPlanCache,
            familyRoutePlans: canvas._familyRoutePlans,
            familyRelationshipPaths: canvas._familyRelationshipPaths,
            familyPlanState: Array.from(familyPlans, plan => ({
                plan,
                hasFamily: Object.prototype.hasOwnProperty.call(plan, 'family'),
                family: plan.family
            }))
            };
        };
        const same = (before) => {
            const topLevelRestored = Object.entries(before)
                .filter(([key]) => key !== 'familyPlanState')
                .every(([key, value]) => {
                const current = {
                    ctx: canvas.ctx,
                    viewOptions: canvas.viewOptions,
                    personMap: canvas.personMap,
                    lastPersons: canvas.lastPersons,
                    lastRelationships: canvas.lastRelationships,
                    derivedSignature: canvas._derivedGeometrySignature,
                    personLabelPlacements: canvas.personLabelPlacements,
                    marriageRouteCache: canvas.marriageRouteCache,
                    labelRoutingWarnings: canvas.labelRoutingWarnings,
                    familySignature: canvas._familyRouteSignature,
                    familyPlanCache: canvas._familyPlanCache,
                    familyRoutePlans: canvas._familyRoutePlans,
                    familyRelationshipPaths: canvas._familyRelationshipPaths
                }[key];
                return current === value;
            });
            return topLevelRestored && before.familyPlanState.every(entry =>
                Object.prototype.hasOwnProperty.call(entry.plan, 'family') === entry.hasFamily
                    && entry.plan.family === entry.family);
        };
        const restore = (snapshot) => {
            snapshot.familyPlanState.forEach(entry => {
                if (entry.hasFamily) entry.plan.family = entry.family;
                else delete entry.plan.family;
            });
            canvas.ctx = snapshot.ctx;
            canvas.viewOptions = snapshot.viewOptions;
            canvas.personMap = snapshot.personMap;
            canvas.lastPersons = snapshot.lastPersons;
            canvas.lastRelationships = snapshot.lastRelationships;
            canvas._derivedGeometrySignature = snapshot.derivedSignature;
            canvas.personLabelPlacements = snapshot.personLabelPlacements;
            canvas.marriageRouteCache = snapshot.marriageRouteCache;
            canvas.labelRoutingWarnings = snapshot.labelRoutingWarnings;
            canvas._familyRouteSignature = snapshot.familySignature;
            canvas._familyPlanCache = snapshot.familyPlanCache;
            canvas._familyRoutePlans = snapshot.familyRoutePlans;
            canvas._familyRelationshipPaths = snapshot.familyRelationshipPaths;
        };

        const pngBefore = capture();
        canvas.exportToPNG(app.persons, app.relationships, app.households,
            app.lifeCircles, true, false, 1, hiddenExportView);
        const pngRestored = same(pngBefore);
        if (!pngRestored) restore(pngBefore);

        app.render();
        const jpegBefore = capture();
        canvas.exportToJPEG(app.persons, app.relationships, app.households,
            app.lifeCircles, 0.92, true, false, 1, hiddenExportView);
        const jpegRestored = same(jpegBefore);
        if (!jpegRestored) restore(jpegBefore);

        app.render();
        const throwBefore = capture();
        const originalDrawRelationship = canvas.drawRelationship;
        let exportThrew = false;
        canvas.drawRelationship = () => {
            throw new Error('forced-export-failure');
        };
        try {
            canvas.exportToPNG(app.persons, app.relationships, app.households,
                app.lifeCircles, true, false, 1, hiddenExportView);
        } catch (error) {
            exportThrew = error.message === 'forced-export-failure';
        } finally {
            canvas.drawRelationship = originalDrawRelationship;
        }
        const throwRestored = same(throwBefore);
        if (!throwRestored) restore(throwBefore);
        return { pngRestored, jpegRestored, exportThrew, throwRestored };
    });
    check('PNG export restores exact screen derived-cache identities',
        cacheRestoration.pngRestored, JSON.stringify(cacheRestoration));
    check('JPEG export restores exact screen derived-cache identities',
        cacheRestoration.jpegRestored, JSON.stringify(cacheRestoration));
    check('throwing export restores ctx, view state, and every derived cache',
        cacheRestoration.exportThrew && cacheRestoration.throwRestored,
        JSON.stringify(cacheRestoration));

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
