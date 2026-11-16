// Checks the web opcode discovery against the real @csound/browser engine, so that a dependency
// update that breaks csoundUgenListOpcodes fails here instead of only logging a warning in the
// web server. Run with npm run test-web-opcodes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function load(file, mocks, globals = {}) {
    const exports = {};
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
    vm.runInNewContext(source, {exports, require: name => mocks[name] || load(path.resolve(path.dirname(file), name + '.ts'), mocks, globals), console, ...globals}, {filename:file});
    return exports;
}

// @csound/browser has no `exports`/`main`, only `module`, so import its bundle by path.
const engine = pathToFileURL(require.resolve('@csound/browser/dist/csound.js', {paths: [root]})).href;
const mocks = {
    'web-tree-sitter': {},
    './loadCsoundBrowser': {loadCsoundBrowser: () => import(engine)},
};
// The engine runs in this realm, so the code under test must see this realm's global as `self`,
// like the web worker where it sets and removes `window`. Node has no `self`: add it, as a worker has.
globalThis.self = globalThis;
const utils = load(path.join(root, 'src/web/utils.ts'), mocks);
const {listBrowserCsoundOpcodes} = load(path.join(root, 'src/web/csoundOpcodes.ts'), {...mocks, './utils': utils}, {self: globalThis});

(async () => {
    // grouping, without the engine
    const grouped = utils.groupListedOpcodes([
        {opname: 'poscil3.a', outypes: 'a', intypes: 'kk'},
        {opname: 'poscil3.k', outypes: 'k', intypes: 'kk'},
        {opname: 'poscil3', outypes: 'a', intypes: 'kk'},
        {opname: 'turnoff', outypes: '', intypes: ''},
        {opname: '##add', outypes: 'a', intypes: 'aa'},
    ]);
    assert.deepEqual([...grouped.keys()], ['poscil3', 'turnoff']);
    // arrays built in the vm context have another Array prototype
    const plain = value => JSON.parse(JSON.stringify(value));
    assert.deepEqual(plain(grouped.get('poscil3')), [['a', 'kk'], ['k', 'kk']], 'variants merged, duplicate signature once');
    assert.deepEqual(plain(grouped.get('turnoff')), [['(null)', '(null)']]);
    assert.equal(utils.csoundVersionName(7000), 'Csound 7.0.0');
    console.log('PASS opcode grouping and version name');

    // discovery with the real engine
    assert.equal(globalThis.window, undefined);
    const {source, opcodes} = await listBrowserCsoundOpcodes();
    assert.equal(globalThis.window, undefined, 'window removed after loading the engine');
    assert.match(source, /^Csound \d+\.\d+\.\d+$/);
    assert.ok(opcodes.size > 1000, `only ${opcodes.size} opcodes listed`);
    for (const name of ['printfi', 'oscili', 'poscil3']) {
        assert.ok(opcodes.has(name), `${name} not listed by ${source}`);
    }
    assert.ok([...opcodes.keys()].every(name => !name.includes('.')), 'internal variant names leaked');
    console.log(`PASS ${source} lists ${opcodes.size} opcodes`);

    // merge with the bundled manual data, as the web server does
    const manualJson = JSON.parse(fs.readFileSync(path.join(root, 'src/web/resources/csound-json_data/csound.json'), 'utf8'));
    const manual = new Map(Object.entries(manualJson));
    assert.ok(!manual.has('printfi'), 'printfi now has a manual page: pick another undocumented opcode');
    const before = new Map([...manual].map(([name, entry]) => [name, structuredClone(entry)]));

    const added = utils.addListedOpcodes(manual, opcodes, source);
    assert.equal(added, manual.size - before.size);
    assert.ok(added > 0);
    const printfi = manual.get('printfi');
    assert.equal(printfi.body, 'printfi');
    assert.ok(printfi.description.startsWith(`Opcode listed by ${source}`), printfi.description);
    for (const [name, entry] of before) {
        assert.deepEqual(manual.get(name), entry, `manual entry ${name} changed`);
    }
    assert.ok([...manual.keys()].every(name => name.length > 1 || before.has(name)), 'one-letter type casts added');
    console.log(`PASS ${added} opcodes without a manual page added, ${before.size} manual entries unchanged`);
})().catch(error => {
    console.error(error);
    process.exit(1);
});
