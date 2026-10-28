import * as vscode from 'vscode';
import { ProjectFiles } from '../web/projectFiles';
import { EngineCommand, EngineMessage, HostMessage, PlaybackState } from './messages';

export class CsoundWebViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    static readonly viewType = 'csound.webview';
    private view?: vscode.WebviewView;
    private session = '';
    private ready?: () => void;
    private loaded?: Promise<void>;
    private intent = 0;
    private sequence = 0;
    private waiting = new Map<number, {resolve: (value: boolean) => void; reject: (error: Error) => void}>();
    private files = new ProjectFiles();
    private output = vscode.window.createOutputChannel('Csound');
    private bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    private document?: vscode.TextDocument;
    private pending?: {document: vscode.TextDocument; content: string};
    private state: PlaybackState = 'Stopped';
    private subscriptions: vscode.Disposable[] = [];
    private disposed = false;
    private bootstrapped = false;
    constructor(private extensionUri: vscode.Uri) {
        this.bar.command = 'csound.showPlayer';
        this.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => this.update(this.state)));
        this.update('Stopped');
    }
    resolveWebviewView(view: vscode.WebviewView) {
        if (!this.loaded) { this.loaded = new Promise<void>(resolve => { this.ready = resolve; }); }
        this.bootstrapped = false;
        this.view = view;
        this.session = `${Date.now()}-${Math.random()}`;
        const session = this.session;
        this.files.invalidate();
        view.webview.options = {enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')]};
        this.subscriptions.push(view.webview.onDidReceiveMessage((message: EngineMessage) => {
            if (message.session !== session || session !== this.session) { return; }
            if (message.type === 'ready') {
                // A retained WebviewView can acquire a new document without being resolved again.
                // Its engine has an empty filesystem, so the previous manifest is no longer valid.
                this.files.invalidate();
                if (this.bootstrapped) {
                    const pending = this.pending;
                    this.cancel();
                    this.rejectWaiting();
                    this.update('Stopped');
                    if (pending) { void this.play(pending.document, pending.content); }
                }
                this.bootstrapped = true;
                this.ready?.();
            }
            if (message.type === 'audioReady' && this.pending) { const pending = this.pending; void this.play(pending.document, pending.content); }
            if (message.type === 'output') { this.output.appendLine(message.text); }
            if (message.type === 'state' && message.intent === this.intent) {
                this.update(message.state);
                if (message.state === 'Enable Audio') { view.show(true); }
            }
            if (message.type === 'reply') {
                const request = this.waiting.get(message.id);
                this.waiting.delete(message.id);
                if (message.error) { request?.reject(new Error(message.error)); }
                else { request?.resolve(message.value !== false); }
            }
        }), view.onDidDispose(() => {
            if (this.session !== session) { return; }
            this.ready?.(); this.view = undefined; this.loaded = undefined; this.pending = undefined; this.intent++;
            this.files.invalidate();
            this.rejectWaiting(); this.update('Stopped');
        }));
        const script = view.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist/webview/csound-webview.js'));
        const css = view.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist/webview/main.css'));
        const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
        view.webview.html = `<!doctype html><html lang="en"><head><meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${view.webview.cspSource}; script-src 'nonce-${nonce}' 'wasm-unsafe-eval' blob: data:; worker-src blob: data:; connect-src ${view.webview.cspSource} blob: data:;">
            <link rel="stylesheet" href="${css}"><title>Csound</title></head>
            <body data-session="${session}"><main><p id="status" role="status" aria-live="polite">Stopped</p>
            <button id="enable" hidden>Enable Audio &amp; Play</button>
            <p class="hint">Run a CSD from the editor. Use the toolbar to pause, stop, or show output.</p></main>
            <script nonce="${nonce}" src="${script}"></script></body></html>`;
    }
    private rejectWaiting() {
        for (const request of this.waiting.values()) { request.reject(new Error('Csound audio host was closed. Run again to reconnect.')); }
        this.waiting.clear();
    }
    private async ensureView() {
        if (!this.loaded) {
            this.loaded = new Promise<void>(resolve => { this.ready = resolve; });
            await vscode.commands.executeCommand('csound.webview.focus');
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            await Promise.race([this.loaded, new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error('Csound view did not load. Reopen the player and Run again.')), 30000);
            })]);
        } finally { if (timer) { clearTimeout(timer); } }
    }
    private async rpc(command: EngineCommand, intent: number): Promise<boolean> {
        if (!this.view) { throw new Error('Csound player is unavailable. Run again.'); }
        const id = ++this.sequence;
        return new Promise<boolean>((resolve, reject) => {
            const timer = setTimeout(() => { this.waiting.delete(id); reject(new Error('Csound did not respond. Reload the audio host and Run again.')); }, 60000);
            this.waiting.set(id, {resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); }});
            void this.view!.webview.postMessage({...command, session: this.session, intent, id} as HostMessage).then(posted => {
                if (!posted) { const request = this.waiting.get(id); this.waiting.delete(id); request?.reject(new Error('Csound audio host is disconnected.')); }
            }, error => { const request = this.waiting.get(id); this.waiting.delete(id); request?.reject(new Error(String(error))); });
        });
    }
    private cancel() {
        const intent = ++this.intent;
        if (this.view) { void this.view.webview.postMessage({command: 'cancel', intent, session: this.session} as HostMessage); }
        return intent;
    }
    async run() {
        const document = vscode.window.activeTextEditor?.document.languageId === 'csound'
            ? vscode.window.activeTextEditor.document : this.document;
        if (!document) { void vscode.window.showInformationMessage('Open a CSD to run Csound.'); return; }
        await this.play(document, document.getText());
    }
    private async play(document: vscode.TextDocument, content: string) {
        if (!document.isUntitled && !document.uri.path.toLowerCase().endsWith('.csd')) {
            void vscode.window.showInformationMessage('Run a .csd to start playback. Use Evaluate Orchestra/Score for .orc and .sco code during a performance.'); return;
        }
        this.document = document;
        if (this.state === 'Preparing') { this.files.invalidate(); }
        this.pending = {document, content};
        const intent = this.cancel();
        this.update('Preparing');
        try {
            await this.ensureView();
            if (intent !== this.intent || this.disposed) { return; }
            void this.view!.webview.postMessage({command: 'cancel', intent, session: this.session} as HostMessage);
            if (!await this.rpc({command: 'initialize'}, intent) || intent !== this.intent) { return; }
            const started = Date.now();
            const snapshot = await this.files.snapshot(document, content);
            if (intent !== this.intent) { return; }
            if (!await this.rpc({command: 'begin', root: snapshot.root, paths: snapshot.entries.map(e => e.path)}, intent)) { return; }
            let transferred = 0;
            for (const entry of snapshot.entries) {
                if (intent !== this.intent) { return; }
                if (!this.files.changed(entry)) { continue; }
                const bytes = entry.bytes || await vscode.workspace.fs.readFile(entry.uri);
                for (let offset = 0; offset < Math.max(1, bytes.byteLength); offset += 1024 * 1024) {
                    if (intent !== this.intent) { return; }
                    const chunk = bytes.slice(offset, offset + 1024 * 1024);
                    if (!await this.rpc({command: 'file', path: entry.path, bytes: chunk.buffer, append: offset > 0}, intent)) { return; }
                }
                transferred += bytes.byteLength;
            }
            if (intent !== this.intent) { return; }
            this.files.commit(snapshot.entries);
            this.output.appendLine(`Project: ${snapshot.entries.length} files, ${snapshot.entries.reduce((sum, entry) => sum + entry.size, 0)} bytes total; transferred ${transferred} bytes in ${Date.now() - started} ms. Use csound.web.projectRoot to scope large projects.`);
            if (await this.rpc({command: 'start', path: snapshot.main}, intent) && intent === this.intent) { this.pending = undefined; }
        } catch (error) {
            this.files.invalidate();
            if (intent === this.intent) { this.fail(error); }
        }
    }
    async stopCsound() {
        this.pending = undefined;
        const intent = this.cancel();
        if (this.state === 'Preparing') { this.files.invalidate(); } // interrupted file application
        if (!this.view) { this.update('Stopped'); return; }
        try { await this.rpc({command: 'stop'}, intent); } catch (error) { if (intent === this.intent) { this.fail(error, false); } }
    }
    async pauseResume() {
        try { await this.rpc({command: this.state === 'Paused' ? 'resume' : 'pause'}, this.intent); } catch (error) { this.fail(error, false); }
    }
    async evaluate(text: string, score: boolean) {
        if (this.state !== 'Playing' && this.state !== 'Paused') { void vscode.window.showInformationMessage('Run a CSD before evaluating orchestra or score code.'); return false; }
        try { return await this.rpc({command: 'eval', text, score}, this.intent); } catch (error) { this.fail(error, false); return false; }
    }
    showOutput() { this.output.show(true); }
    show() { return vscode.commands.executeCommand('csound.webview.focus'); }
    private fail(error: unknown, changeState = true) {
        this.pending = undefined;
        if (changeState) { this.update('Error'); }
        this.output.appendLine(String(error)); this.output.show(true);
        void vscode.window.showErrorMessage(`Csound: ${String(error)}`);
    }
    private update(state: PlaybackState) {
        this.state = state;
        const canStop = ['Preparing', 'Enable Audio', 'Playing', 'Paused'].includes(state);
        void vscode.commands.executeCommand('setContext', 'csound.canStop', canStop);
        void vscode.commands.executeCommand('setContext', 'csound.isPlaying', state === 'Playing');
        void vscode.commands.executeCommand('setContext', 'csound.isPaused', state === 'Paused');
        const name = this.document?.uri.path.split('/').pop() || '';
        this.bar.text = `$(unmute) Csound: ${state}${name ? ` · ${name}` : ''}`;
        this.bar.tooltip = 'Show Csound player';
        if (canStop || vscode.window.activeTextEditor?.document.languageId === 'csound') { this.bar.show(); } else { this.bar.hide(); }
        if (this.view) { this.view.description = `${state}${name ? ` · ${name}` : ''}`; this.view.badge = canStop ? {value: 1, tooltip: state} : undefined; }
    }
    dispose() {
        this.disposed = true; this.pending = undefined; this.cancel();
        if (this.view) { void this.view.webview.postMessage({command: 'dispose', session: this.session, intent: this.intent, id: ++this.sequence} as HostMessage); }
        this.rejectWaiting(); this.files.dispose(); this.bar.dispose(); this.output.dispose(); this.subscriptions.forEach(d => d.dispose());
    }
}
