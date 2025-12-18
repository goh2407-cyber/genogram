const assert = require('assert');

// 1. Mock Globals and Dependencies
global.window = { devicePixelRatio: 1 };
global.document = {
    getElementById: () => ({
        getContext: () => mockCtx,
        getBoundingClientRect: () => ({ width: 800, height: 600 }),
        style: {}
    })
};
global.ResizeObserver = class {
    observe() { }
    unobserve() { }
    disconnect() { }
};

// Mock Canvas Context
const logs = [];
const mockCtx = {
    save: () => { },
    restore: () => { },
    beginPath: () => { },
    moveTo: (x, y) => logs.push({ type: 'moveTo', x, y }),
    lineTo: (x, y) => logs.push({ type: 'lineTo', x, y }),
    stroke: () => logs.push({ type: 'stroke' }),
    setLineDash: () => { },
    strokeStyle: '',
    lineWidth: 1,
    rect: () => { },
    clip: () => { }
};

// Mock Relationship Class
global.Relationship = class {
    constructor() { }
    static getCategory(type) {
        if (['married'].includes(type)) return 'marriage';
        if (['parent-child'].includes(type)) return 'family';
        return 'emotional';
    }
};

// 2. Load GenogramCanvas
// adapting for node require if needed, assuming the file has module.exports
const GenogramCanvas = require('./js/canvas.js');

// 3. Setup Test Data
const persons = [
    { id: 'p1', x: 100, y: 100, size: 50 }, // Father
    { id: 'p2', x: 200, y: 100, size: 50 }, // Mother
    { id: 'c1', x: 100, y: 300, size: 50 }, // Child 1
    { id: 'c2', x: 200, y: 300, size: 50 }, // Child 2
];

// Relationships: Marriage + Parent-Child
const relationships = [
    { fromPersonId: 'p1', toPersonId: 'p2', type: 'married', involvesPerson: () => true, getCategory: () => 'marriage' }, // Marriage
    { fromPersonId: 'p1', toPersonId: 'c1', type: 'parent-child', involvesPerson: () => true },
    { fromPersonId: 'p2', toPersonId: 'c1', type: 'parent-child', involvesPerson: () => true },
    { fromPersonId: 'p1', toPersonId: 'c2', type: 'parent-child', involvesPerson: () => true },
    { fromPersonId: 'p2', toPersonId: 'c2', type: 'parent-child', involvesPerson: () => true }
];

const familyRels = relationships.filter(r => r.type === 'parent-child');
const otherRels = relationships.filter(r => r.type !== 'parent-child');

// 4. Instantiate and Run
const canvas = new GenogramCanvas('canvas', 'container');
canvas.personSize = 50;

console.log('--- Running drawFamilies Test ---');
canvas.drawFamilies(familyRels, persons, otherRels);

// 5. Verify Logs
console.log('Drawing Operations:', logs);

// Analysis
// Source should be mid-marriage:
// p1(100,100), p2(200,100). MidX=150. MidY = min(100,100)+40 = 140.
// Child Top: y=300 - 25 = 275.
// BarY should be (140 + 275) / 2 = 415/2 = 207.5.

const sourceX = 150;
const sourceY = 140;
const barY = 207.5;

// Check if we have vertical line from Source to Bar
const hasSourceDrop = logs.some((op, i) =>
    op.type === 'moveTo' && op.x === sourceX && op.y === sourceY &&
    logs[i + 1] && logs[i + 1].type === 'lineTo' && logs[i + 1].x === sourceX
);

console.log(`Expect Source Drop from (${sourceX}, ${sourceY})`);
if (hasSourceDrop) console.log('✅ Source Drop Detected');
else console.error('❌ Source Drop Missing');

// Check Child 1 vertical
// Child 1 x=100. Top=275.
const hasChild1Line = logs.some(op => op.type === 'moveTo' && op.x === 100 && op.y === barY);
if (hasChild1Line) console.log('✅ Child 1 Connection Detected');
else console.error('❌ Child 1 Connection Missing');

// Check Child 2 vertical
const hasChild2Line = logs.some(op => op.type === 'moveTo' && op.x === 200 && op.y === barY);
if (hasChild2Line) console.log('✅ Child 2 Connection Detected');
else console.error('❌ Child 2 Connection Missing');

console.log('--- Test Complete ---');
