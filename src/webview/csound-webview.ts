import { Csound, CsoundObj } from '@csound/browser';
import { EngineEvent, EngineMessage, HostMessage, PlaybackState } from './messages';

declare function acquireVsCodeApi(): { postMessage(message: EngineMessage): void };
const vscode = acquireVsCodeApi();
const session = document.body.dataset.session!;
let csound: CsoundObj | undefined;
let audio: AudioContext | undefined;
let initialization: Promise<boolean> | undefined;
let intent = 0;
let chain = Promise.resolve();
let owned = new Set<string>();
let project = '';
let active = false;
let performanceIntent = 0;
let replaceEngine = false;
const status = document.getElementById('status')!;
const enable = document.getElementById('enable') as HTMLButtonElement;
const send = (message: EngineEvent) => vscode.postMessage({ ...message, session });
function state(value: PlaybackState) {
    status.textContent = value;
    enable.hidden = value !== 'Enable Audio';
    send({type: 'state', intent, state: value});
}
async function initialize(): Promise<boolean> {
    if (replaceEngine) {
        await csound?.terminateInstance();
        csound = undefined; initialization = undefined; owned.clear(); active = false; replaceEngine = false;
    }
    audio ||= new AudioContext({latencyHint: 'interactive'});
    if (audio.state === 'suspended') {
        // Previously activated contexts may be suspended when the workbench hides the view.
        // Resume automatically when permitted, but never wait indefinitely for a user gesture.
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            await Promise.race([audio.resume(), new Promise<void>(resolve => {
                timer = setTimeout(resolve, 1000);
            })]);
        } catch { /* The browser can require another user gesture. */ }
        finally { if (timer) { clearTimeout(timer); } }
    }
    if (audio.state !== 'running') { state('Enable Audio'); return false; }
    if (!initialization) {
        initialization = (async () => {
            csound = await Csound({audioContext: audio, useWorker: false, useSAB: false, autoConnect: true});
            if (!csound) { throw new Error('Csound could not initialize.'); }
            csound.on('message', text => send({type: 'output', text}));
            csound.on('stop', () => { active = false; if (performanceIntent === intent) { state('Stopped'); } });
            csound.on('play', () => { if (active && performanceIntent === intent) { state('Playing'); } });
            csound.on('pause', () => { if (performanceIntent === intent) { state('Paused'); } });
            return true;
        })().catch(error => { initialization = undefined; throw error; });
    }
    return initialization;
}
enable.addEventListener('click', () => {
    enable.disabled = true;
    audio ||= new AudioContext({latencyHint: 'interactive'});
    void audio.resume().then(initialize).then(() => send({type: 'audioReady'})).catch(error => {
        state('Enable Audio'); send({type: 'output', text: String(error)});
    }).finally(() => { enable.disabled = false; });
});
window.addEventListener('pagehide', () => { void csound?.terminateInstance(); void audio?.close(); });
async function mkdir(path: string) {
    let current = '';
    for (const part of path.split('/').filter(Boolean)) {
        current += '/' + part;
        if (!await csound!.fs.pathExists(current)) { await csound!.fs.mkdir(current); }
    }
}
async function execute(message: HostMessage & {id: number}) {
    if (message.intent !== intent) { return false; }
    if (message.command === 'initialize') { return initialize(); }
    if (message.command === 'dispose') { await csound?.terminateInstance(); await audio?.close(); return true; }
    if (!csound) { if (message.command === 'stop') { state('Stopped'); return true; } throw new Error('Enable browser audio first.'); }
    const engine = csound;
    switch (message.command) {
        case 'stop': if (active) { await engine.stop(); } active = false; state('Stopped'); break;
        case 'pause': await engine.pause(); break;
        case 'resume': await engine.resume(); break;
        case 'begin': {
            if (active) { await engine.stop(); } active = false;
            await engine.reset();
            // Csound 7 retains the pause flag across stop/reset; clear it before start waits for audio.
            await engine.resume();
            if (message.intent !== intent) { return false; }
            state('Preparing');
            const paths = new Set(message.paths);
            for (const path of owned) {
                if (project !== message.root || !paths.has(path)) {
                    if (await engine.fs.pathExists(path)) { await engine.fs.unlink(path); }
                    owned.delete(path);
                }
            }
            project = message.root;
            await mkdir(project);
            break;
        }
        case 'file':
            await mkdir(message.path.slice(0, message.path.lastIndexOf('/')));
            owned.add(message.path);
            if (message.append) { await engine.fs.appendFile(message.path, new Uint8Array(message.bytes)); }
            else { await engine.fs.writeFile(message.path, new Uint8Array(message.bytes)); }
            break;
        case 'start': {
            const changed = await engine.fs.chdir(message.path.slice(0, message.path.lastIndexOf('/')));
            if (changed !== 0) { throw new Error(`Cannot set project directory (${changed}).`); }
            send({type: 'output', text: `Compiling ${message.path}`} );
            // WASI file calls expect a relative name after chdir, unlike the JS fs methods.
            const result = await engine.compileCSD(message.path.slice(message.path.lastIndexOf('/') + 1), 0);
            if (message.intent !== intent) { return false; }
            if (result !== 0) { throw new Error(`Compilation failed for ${message.path} (${result}). See Csound Output.`); }
            performanceIntent = message.intent;
            active = true;
            const started = await engine.start();
            if (started !== 0) { active = false; throw new Error(`Csound could not start (${started}).`); }
            if (message.intent !== intent) { await engine.stop(); active = false; return false; }
            break;
        }
        case 'eval': {
            if (!active) { throw new Error('Run a CSD before evaluating code.'); }
            const result = message.score ? await engine.inputMessage(message.text) : await engine.compileOrc(message.text);
            if (result !== 0) { throw new Error(`Evaluation failed (${result}). See Csound Output.`); }
            break;
        }
    }
    return true;
}
window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
    const message = event.data;
    if (!message || message.session !== session) { return; }
    if (message.command === 'cancel') { intent = message.intent; return; }
    chain = chain.then(async () => {
        try {
            const value = await execute(message);
            send({type: 'reply', id: message.id, value});
        } catch (error) {
            if (['begin', 'file', 'start'].includes(message.command)) { replaceEngine = true; }
            if (message.intent === intent && !['eval', 'pause', 'resume', 'stop'].includes(message.command)) { state('Error'); }
            send({type: 'reply', id: message.id, error: String(error)});
        }
    });
});
send({type: 'ready'});
