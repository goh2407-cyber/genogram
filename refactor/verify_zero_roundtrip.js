const { openApp, createChecks, finish } = require('./contract_harness');

(async () => {
    const { browser, page, errors } = await openApp();
    const { failures, passes, check } = createChecks();
    const result = await page.evaluate(async () => {
        const input = { id: 'zero', name: '新生兒', gender: 'male', age: 0, x: 0, y: 0 };
        const direct = new Person(input);
        const roundTrip = Person.fromJSON(direct.toJSON());
        const clone = direct.clone();

        const storage = new StorageManager();
        storage.clearAutoSave();
        storage.autoSave([direct], [], [], []);
        const local = storage.loadAutoSave().persons[0];
        const file = new File([JSON.stringify({ version: '1.0', persons: [input],
            relationships: [], households: [], lifeCircles: [] })], 'zero.json',
            { type: 'application/json' });
        const fromFile = (await storage.loadFromFile(file)).persons[0];

        const history = new HistoryManager();
        history.pushState({ persons: [direct.toJSON()], relationships: [], households: [], lifeCircles: [] });
        const restoredState = history.undo({ persons: [{ ...direct.toJSON(), age: 1, x: 1, y: 1 }],
            relationships: [], households: [], lifeCircles: [] });
        const fromHistory = Person.fromJSON(restoredState.persons[0]);

        const app = window.app;
        app.loadData({ persons: [input], relationships: [], households: [], lifeCircles: [] });
        app.selectPerson('zero');
        const fieldValue = document.getElementById('personAge').value;
        document.getElementById('personAge').value = '0';
        document.getElementById('personAge').dispatchEvent(new Event('input', { bubbles: true }));
        const appPerson = app.personMap.get('zero');
        return {
            values: [direct, roundTrip, clone, local, fromFile, fromHistory, appPerson]
                .map(person => ({ age: person.age, x: person.x, y: person.y })),
            fieldValue
        };
    });
    check('constructor, JSON, clone, localStorage, File, history and App preserve all zeroes',
        result.values.every(value => value.age === 0 && value.x === 0 && value.y === 0),
        JSON.stringify(result.values));
    check('age input displays numeric zero rather than an empty field', result.fieldValue === '0', result.fieldValue);
    check('zero page/console errors', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'ALL ZERO ROUNDTRIP CHECKS PASSED');
})().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
