"use strict";

import * as vscode from "vscode";
import * as dgram from "dgram";
import { flash, getEvalText, getScoEvalText } from "../utils";
import path from "path";
import * as fs from "fs";
import * as http from "http";

const socket = dgram.createSocket("udp4");

let terminal: vscode.Terminal | undefined;
let manualServer: http.Server | null = null;

export async function selectCsoundExecutable() {
    const config = vscode.workspace.getConfiguration('csound');

    const csoundExecPath = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: 'Select Csound Executable'
    });

    if (csoundExecPath && csoundExecPath.length > 0) {
        // Use the correct key name that matches your package.json configuration
        await config.update('executable', csoundExecPath[0].fsPath, vscode.ConfigurationTarget.Global);
    }
}

export async function evalOrc(textEditor: vscode.TextEditor) {
    const config = vscode.workspace.getConfiguration("csound");
    const port = config.get("UDPPort") as number;
    const address = config.get("UDPAddress") as string;

    const document = textEditor.document;
    const selection = textEditor.selection;

    const { text, from , to} = getEvalText(document, selection);
    socket.send(text, port, address);
    flash(textEditor, new vscode.Range(from, to));
}

export async function evalSco(textEditor: vscode.TextEditor) {
    const config = vscode.workspace.getConfiguration("csound");
    const port = config.get("UDPPort") as number;
    const address = config.get("UDPAddress") as string;

    const document = textEditor.document;
    const selection = textEditor.selection;

    const { text, from , to} = getScoEvalText(document, selection);
    socket.send("$" + text, port, address);
    flash(textEditor, new vscode.Range(from, to));
}

async function _runSaveHelper(cmd: string, action: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }

    const file = editor.document.uri.fsPath;
    let paths: string[] = [];

    if (file.endsWith(".orc")) {
        let orc = file;
        paths.push(orc);
        let sco = orc.replace(/\.orc$/, ".sco");
        paths.push(sco);
    } else if (file.endsWith(".sco")) {
        let sco = file;
        let orc = sco.replace(/\.sco$/, ".orc");
        paths.push(orc);
        paths.push(sco);
    } else if (file.endsWith(".csd")) {
        paths.push(file);
    } else {
        console.log("Wrong file path!");
        return;
    }

    const result = await vscode.commands.executeCommand(
        cmd,
        paths
    ) as unknown as { action: string; exec: string; args: string; path: string[]; };

    if (result?.action === action) {
        if (terminal) { terminal.dispose(); } 

        terminal = vscode.window.createTerminal("Csound");
        terminal.sendText(`${result.exec} ${result.args} ${result.path.map(p => `${p}`).join(" ")}`);
        terminal.show();
    }
}

export async function runFile() {
    _runSaveHelper("csound-lsp.run_file", "run csound file");
}

export async function saveAsAudioFile() {
    _runSaveHelper("csound-lsp.to_audio_file", "save as audio file");
}

export async function openManual() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }

    const result = await vscode.commands.executeCommand(
        "csound-lsp.open_manual"
    ) as unknown as { action: string; args: string; path: string; };
    
    if (result?.action === "open html csound manual") {
        try {
            const localUrl = await startManualLocalServer(result.path, { server: manualServer });
            
            const panel = vscode.window.createWebviewPanel(
                "CsoundManual",
                "Csound Manual",
                vscode.ViewColumn.Beside,
                { 
                    enableScripts: true,
                    enableForms: true,
                }
            );

            panel.webview.html = `
                <!DOCTYPE html>
                <html style="height: 100%; width: 100%; margin: 0; padding: 0;">
                <head>
                    <meta charset="UTF-8">
                    <title>Csound Manual</title>
                    <style>
                        body { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; background: white; }
                        iframe { width: 100%; height: 100%; border: none; display: block; }
                    </style>
                </head>
                <body>
                    <iframe src="${localUrl}/index.html" width="100%" height="100%"></iframe>
                </body>
                </html>
            `;

            panel.onDidDispose(() => {
                if (manualServer) {
                    manualServer.close();
                    manualServer = null;
                    console.log("Manual Server off.");
                }
            });

        } catch (err) {
            vscode.window.showErrorMessage(`Manual server error: ${err}`);
        }
    }
}

export function closeManualServer() {
    if (manualServer) { manualServer.close(); }
}

export async function stopExecution() {
    if (terminal) { 
        terminal.sendText('\x03');
        terminal.dispose();
        terminal = undefined;
    }
}

async function startManualLocalServer(rootPath: string, manualServer: { server: http.Server | null }): Promise<string> {
    if (manualServer.server) { 
        await new Promise(res => manualServer.server!.close(res)); 
    }

    manualServer.server = http.createServer((req, res) => {
        if (req.method !== 'GET') {
            res.statusCode = 405;
            res.end();
            return;
        }
        const baseURL = `http://${req.headers.host || 'localhost'}`;
        let requestUrl: URL;
        try {
            requestUrl = new URL(req.url || '', baseURL);

        } catch (e) {
            res.statusCode = 400;
            res.end('Bad Request');
            return;
        }

        let pathname = requestUrl.pathname;
        try {
            pathname = decodeURIComponent(pathname);
        } catch (e) { }
        
        let sanitizePath = path.normalize(pathname || '').replace(/^(\.\.[\/\\])+/, '');
        let filePath = path.join(rootPath, sanitizePath);

        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
            filePath = path.join(filePath, 'index.html');
        }

        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.statusCode = 404;
                res.end('File not found');
            } else {
                const ext = path.extname(filePath).toLowerCase();
                const mimeTypes: { [key: string]: string } = {
                    '.html': 'text/html',
                    '.js': 'text/javascript',
                    '.css': 'text/css',
                    '.json': 'application/json',
                    '.png': 'image/png',
                    '.jpg': 'image/jpg',
                    '.gif': 'image/gif',
                };
                res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
                res.end(data);
            }
        });
    });
    
    return new Promise((resolve, reject) => {
        manualServer.server!.listen(0, "localhost", () => {
            const address = manualServer.server!.address();
            if (address && typeof address !== 'string') {
                console.log(`Start csound manual server on localhost:${address.port}`);
                resolve(`http://localhost:${address.port}`);
            } else {
                reject("Manual Server Error");
            }
        });
    });
}