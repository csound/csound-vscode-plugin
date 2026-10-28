import * as vscode from 'vscode';

export interface ProjectEntry { uri: vscode.Uri; path: string; revision: string; size: number; bytes?: Uint8Array }
export class ProjectFiles implements vscode.Disposable {
    private revisions = new Map<string, string>();
    private dirty = new Map<string, number>();
    private serial = 0;
    private roots = new Map<string, number>();
    private subscriptions: vscode.Disposable[] = [];
    constructor() {
        const watcher = vscode.workspace.createFileSystemWatcher('**/*');
        const mark = (uri: vscode.Uri) => this.dirty.set(uri.toString(), ++this.serial);
        this.subscriptions.push(watcher, watcher.onDidChange(mark), watcher.onDidCreate(mark), watcher.onDidDelete(mark),
            vscode.workspace.onDidChangeTextDocument(e => mark(e.document.uri)),
            vscode.workspace.onDidCloseTextDocument(d => mark(d.uri)), vscode.workspace.onDidSaveTextDocument(d => mark(d.uri)));
    }
    dispose() { this.subscriptions.forEach(d => d.dispose()); }
    invalidate() { this.revisions.clear(); }
    async snapshot(document: vscode.TextDocument, content: string) {
        const folder = vscode.workspace.getWorkspaceFolder(document.uri);
        const override = vscode.workspace.getConfiguration('csound', document.uri).get<string>('web.projectRoot', '.');
        if (override.startsWith('/') || override.split(/[\\/]/).includes('..')) {
            throw new Error('csound.web.projectRoot must be a directory inside the owning workspace.');
        }
        const root = folder ? vscode.Uri.joinPath(folder.uri, override) : undefined;
        const key = root?.toString() || document.uri.toString();
        if (!this.roots.has(key)) { this.roots.set(key, this.roots.size + 1); }
        const prefix = `/workspace/${this.roots.get(key)}`;
        const relative = (uri: vscode.Uri) => {
            if (!root) { return 'untitled.csd'; }
            if (uri.scheme !== root.scheme || uri.authority !== root.authority || !uri.path.startsWith(root.path.replace(/\/$/, '') + '/')) {
                throw new Error('The active document must be inside csound.web.projectRoot. Choose a common project directory.');
            }
            return uri.path.slice(root.path.replace(/\/$/, '').length + 1);
        };
        const main = `${prefix}/${relative(document.uri)}`;
        const uris = new Map<string, vscode.Uri>();
        if (root) {
            for (const uri of await vscode.workspace.findFiles(new vscode.RelativePattern(root, '**/*'), '**/{.git,node_modules}/**')) {
                uris.set(uri.toString(), uri);
            }
            for (const doc of vscode.workspace.textDocuments) {
                if (doc.isDirty && doc.uri.scheme === root.scheme && doc.uri.authority === root.authority && doc.uri.path.startsWith(root.path.replace(/\/$/, '') + '/')) {
                    uris.set(doc.uri.toString(), doc.uri);
                }
            }
        }
        uris.set(document.uri.toString(), document.uri);
        const entries: ProjectEntry[] = [];
        for (const [uriKey, uri] of uris) {
            const path = `${prefix}/${relative(uri)}`;
            const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uriKey);
            let bytes: Uint8Array | undefined;
            let revision: string;
            let size: number;
            if (uriKey === document.uri.toString() || doc?.isDirty) {
                bytes = new TextEncoder().encode(uriKey === document.uri.toString() ? content : doc!.getText());
                size = bytes.byteLength;
                const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
                revision = `text:${doc?.version || 0}:${Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('')}`;
            } else {
                const stat = await vscode.workspace.fs.stat(uri);
                size = stat.size;
                revision = `${stat.mtime}:${stat.size}:${this.dirty.get(uriKey) || 0}`;
                if (!stat.mtime) {
                    bytes = await vscode.workspace.fs.readFile(uri);
                    const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
                    revision = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
                    bytes = undefined; // do not retain an entire virtual workspace's binary payloads during inventory
                }
            }
            entries.push({uri, path, revision, size, bytes});
        }
        return { root: prefix, main, entries };
    }
    changed(entry: ProjectEntry) { return this.revisions.get(entry.path) !== entry.revision; }
    commit(entries: ProjectEntry[]) { this.revisions = new Map(entries.map(e => [e.path, e.revision])); }
}
