/** 同步載入的 mixin 必須在 DOMContentLoaded 建立 App 前就緒，且只能掛回原型。 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { babelParse } = require(path.join(path.dirname(require.resolve('playwright/package.json')),
    'lib/transform/babelBundle.js'));
const root = path.resolve(__dirname, '..');
const canvasMixins = ['canvas-marriage', 'canvas-decorations', 'canvas-family', 'canvas-household'];
const appMixins = ['app-pointer', 'app-hittest', 'app-quick-add', 'app-property-panel',
    'app-relationship-workflow', 'app-snap-placement', 'app-io'];
const expected = ['jspdf.umd.min.js', ...['person', 'layout', 'relationship', 'domain/kinship-engine',
    'domain/family-route-planner', 'history', 'canvas', ...canvasMixins, 'canvas-export', 'storage',
    'ui/modal-manager', 'ui/property-panel-templates', 'app', ...appMixins].map(name => `js/${name}.js`)];

function checkOrder(html) {
    const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)].filter(match => /\bsrc\s*=/i.test(match[1]));
    const sources = scripts.map(([, attributes]) => {
        assert(!/\b(?:async|defer)\b|\btype\s*=\s*["']module["']/i.test(attributes), 'scripts must load synchronously');
        const src = attributes.match(/\bsrc\s*=\s*(["'])(.*?)\1/i);
        assert(src, 'script src must be quoted');
        return /(?:^|\/)jspdf\.umd\.min\.js$/.test(src[2]) ? 'jspdf.umd.min.js' : src[2];
    });
    assert.deepEqual(sources, expected, 'script order must match the complete dependency order');
}

function checkMixin(source, name, className) {
    new Function(source); // Syntax check only: never execute application code in this test.
    const ast = babelParse(source, name + '.js');
    assert(ast.program.directives.every(d => d.value.value === 'use strict'), 'only strict-mode directives allowed');
    assert.equal(ast.program.body.length, 1, 'only one top-level Object.assign is allowed');
    const statement = ast.program.body[0];
    assert.equal(statement.type, 'ExpressionStatement');
    const call = statement.expression;
    assert.equal(call.type, 'CallExpression');
    const member = (node, object, property) => node?.type === 'MemberExpression' && !node.computed
        && node.object.type === 'Identifier' && node.object.name === object
        && node.property.type === 'Identifier' && node.property.name === property;
    assert(member(call.callee, 'Object', 'assign'), 'top-level call must be Object.assign');
    assert.equal(call.arguments.length, 2);
    assert(member(call.arguments[0], className, 'prototype'), 'must assign to the correct class prototype');
    const methods = call.arguments[1];
    assert.equal(methods.type, 'ObjectExpression');
    const names = new Set();
    for (const method of methods.properties) {
        assert.equal(method.type, 'ObjectMethod', 'no spread, property initializer, or immediate side effect');
        assert.equal(method.kind, 'method', 'accessors must remain in the original class');
        assert(!method.computed && method.key.type === 'Identifier', 'no computed method names');
        assert(!names.has(method.key.name), 'no duplicate method names');
        names.add(method.key.name);
    }
    const visit = node => {
        if (!node || typeof node !== 'object') return;
        assert(node.type !== 'ClassDeclaration' && node.type !== 'ClassExpression', 'mixin must not declare a class');
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(visit);
            else if (value && typeof value === 'object') visit(value);
        }
    };
    visit(ast.program);
}

for (const file of ['index.html', 'geno/index.html', 'refactor/app/index.html']) {
    checkOrder(fs.readFileSync(path.join(root, file), 'utf8'));
    console.log(`PASS | ${file} dependency order and synchronous loading`);
}
for (const [names, className] of [[canvasMixins, 'GenogramCanvas'], [appMixins, 'GenogramApp']]) {
    for (const name of names) {
        checkMixin(fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8'), name, className);
        console.log(`PASS | ${name} syntax and prototype-only structure`);
    }
}

// Negative controls: ensure the guard rejects the regressions it is intended to catch.
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.throws(() => checkOrder(html.replace('js/app-pointer.js', 'js/app.js')));
assert.throws(() => checkOrder(html.replace('src="js/app.js"', 'defer src="js/app.js"')));
for (const source of [
    'class Unexpected {}',
    'Object.assign(GenogramApp.prototype, {}); boot();',
    'Object.assign(GenogramApp.prototype, { value: boot() });',
    'Object.assign(GenogramApp.prototype, { [boot()]() {} });',
    'Object.assign(GenogramApp.prototype, { get value() {} });',
    'Object.assign(GenogramApp.prototype, { run() { class Unexpected {} } });'
]) assert.throws(() => checkMixin(source, 'negative-control', 'GenogramApp'));
console.log('RESULT OK (script order, mixin syntax/structure, negative controls)');
