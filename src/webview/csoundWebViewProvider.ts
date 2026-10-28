import * as vscode from 'vscode';

export class CsoundWebViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'csound.webview';

    private _view?: vscode.WebviewView;
    private _csoundReady = false;
    private _messageQueue: any[] = [];
    private _outputChannel: vscode.OutputChannel;

    constructor(private readonly _extensionUri: vscode.Uri) {
        this._outputChannel = vscode.window.createOutputChannel('Csound');
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,
            localResourceRoots: [
                // this._extensionUri
                vscode.Uri.joinPath(this._extensionUri, 'dist'),
                vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview'),
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            message => {
                switch (message.type) {
                    case 'csoundReady':
                        this._csoundReady = true;
                        this._processMessageQueue();
                        break;
                    case 'startRender':
                        // Show and focus the output channel when rendering starts
                        this._outputChannel.show(true);
                        this._outputChannel.appendLine('');
                        this._outputChannel.appendLine(`🎵 Starting render: ${message.filename}`);
                        this._outputChannel.appendLine('='.repeat(60));
                        break;
                    case 'csoundStatus':
                        vscode.window.showInformationMessage(`Csound: ${message.message}`);
                        break;
                    case 'csoundError':
                        this._outputChannel.appendLine(`❌ ERROR: ${message.message}`);
                        this._outputChannel.show(true);
                        break;
                    case 'csoundOutput':
                        this._outputChannel.appendLine(message.message);
                        break;
                }
            },
            undefined,
            []
        );
    }

    public async playCsd(csdContent: string, filename?: string) {
        // Collect project files
        const projectFiles = await this.collectProjectFiles();

        const message = {
            command: 'playCsd',
            content: csdContent,
            filename: filename || 'untitled.csd',
            projectFiles: projectFiles
        };

        if (this._csoundReady && this._view) {
            this._view.webview.postMessage(message);
        } else {
            this._messageQueue.push(message);
        }
    }

    public evalOrc(orcContent: string) {
        const message = {
            command: 'evalOrc',
            content: orcContent
        };

        if (this._csoundReady && this._view) {
            this._view.webview.postMessage(message);
        } else {
            this._messageQueue.push(message);
        }
    }

    public evalSco(scoContent: string) {
        const message = {
            command: 'evalSco',
            content: scoContent
        };

        if (this._csoundReady && this._view) {
            this._view.webview.postMessage(message);
        } else {
            this._messageQueue.push(message);
        }
    }

    public stopCsound() {
        const message = {
            command: 'stop'
        };

        if (this._csoundReady && this._view) {
            this._view.webview.postMessage(message);
        }
    }

    public dispose() {
        // Clean up output channel
        this._outputChannel.dispose();
    }

    private _processMessageQueue() {
        while (this._messageQueue.length > 0 && this._view) {
            const message = this._messageQueue.shift();
            this._view.webview.postMessage(message);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'csound-webview.js'));

        // Do the same for the stylesheet.
        const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'reset.css'));
        const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'vscode.css'));
        const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'main.css'));

        // Use a nonce to only allow a specific script to be run.
        const nonce = getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy"
                    content="default-src 'none';
                    style-src ${webview.cspSource} 'unsafe-inline';
                    script-src 'nonce-${nonce}' 'wasm-unsafe-eval' 'unsafe-inline' data: blob:;
                    worker-src 'self' blob: data:;
                    connect-src 'self' data: blob: https:;
                    img-src 'self' data: https:;">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleResetUri}" rel="stylesheet">
                <link href="${styleVSCodeUri}" rel="stylesheet">
                <link href="${styleMainUri}" rel="stylesheet">
                <title>Csound WebAudio</title>
                <style>
                    body {
                        margin: 0;
                        padding: 0;
                        overflow: hidden;
                    }
                    .control-container {
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        display: flex;
                        flex-direction: column;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        background-color: var(--vscode-editor-background);
                        z-index: 1000;
                    }
                    .control-row {
                        display: grid;
                        grid-template-columns: auto auto 1fr;
                        align-items: center;
                        padding: 6px 12px;
                        gap: 8px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }
                    .control-row:last-child {
                        border-bottom: none;
                    }
                    .control-label {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                    }
                    .control-row button {
                        font-size: 11px;
                        padding: 2px 12px;
                        border: none;
                        border-radius: 2px;
                        cursor: pointer;
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                    }
                    .control-row button + button {
                        margin-left: 6px;
                    }
                    .control-row button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                    .control-row button:disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                    }
                    .status-text {
                        font-size: 12px;
                        color: var(--vscode-foreground);
                        justify-self: end;
                    }
                    .content {
                        margin-top: 74px;
                        padding: 16px;
                        height: calc(100vh - 74px);
                        overflow-y: auto;
                    }
                </style>
            </head>
            <body>
                <div class="control-container">
                    <div class="control-row">
                        <span class="control-label">AudioContext:</span>
                        <button id="pauseResumeButton" class="button secondary" disabled>Start</button>
                        <span class="status-text" id="audioStatus">Not Started</span>
                    </div>
                    <div class="control-row">
                        <span class="control-label">Csound:</span>
                        <div>
                            <button id="csoundPauseButton" class="button secondary" disabled>Pause</button>
                            <button id="csoundStopButton" class="button secondary" disabled>Stop</button>
                        </div>
                        <span class="status-text" id="engineStatus">Not initialized</span>
                    </div>
                </div>

                <div class="content">
                    <p style="color: var(--vscode-descriptionForeground); font-size: 12px; margin: 0;">
                        Use the Csound controls above to manage the running performance.
                    </p>
                </div>

                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }

    private async collectProjectFiles(): Promise<{[path: string]: string}> {
        const projectFiles: {[path: string]: string} = {};

        console.log('collectProjectFiles: Starting file collection...');

        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            const workspaceFolder = vscode.workspace.workspaceFolders[0];
            console.log(`collectProjectFiles: Workspace folder: ${workspaceFolder.uri.fsPath}`);

            try {
                // Find all relevant files in the workspace
                const pattern = new vscode.RelativePattern(workspaceFolder, '**/*.{csd,orc,sco,wav,aif,aiff,txt,inc}');
                console.log(`collectProjectFiles: Searching with pattern: ${pattern.pattern}`);
                const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
                console.log(`collectProjectFiles: Found ${files.length} files`);

                for (const file of files) {
                    try {
                        const content = await vscode.workspace.fs.readFile(file);
                        const relativePath = vscode.workspace.asRelativePath(file);
                        console.log(`collectProjectFiles: Processing ${relativePath}`);

                        // Convert to string (assuming text files for now)
                        // For binary files like WAV, we'd need different handling
                        if (file.path.match(/\.(wav|aif|aiff)$/i)) {
                            console.log(`collectProjectFiles: Skipping binary file ${relativePath}`);
                            continue;
                        }

                        // CRITICAL FIX #2: Store files with absolute paths starting with /
                        // This allows parent directory includes like "../chain.orc" to work
                        const absolutePath = '/' + relativePath;

                        // Convert Uint8Array to string (Buffer is not available in web context)
                        const decoder = new (globalThis as any).TextDecoder('utf-8');
                        projectFiles[absolutePath] = decoder.decode(content);
                        console.log(`collectProjectFiles: Added ${absolutePath} (${content.length} bytes)`);
                    } catch (error) {
                        console.warn(`Failed to read file ${file.path}:`, error);
                    }
                }
            } catch (error) {
                console.warn('Failed to collect project files:', error);
            }
        } else {
            console.log('collectProjectFiles: No workspace folders found');
        }

        console.log(`collectProjectFiles: Collected ${Object.keys(projectFiles).length} files total`);
        return projectFiles;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
