"use strict";

import * as vscode from "vscode";
import * as dgram from "dgram";
import { flash, getEvalText, getScoEvalText } from "../utils";
import { showOpcodeReference } from "./showOpcodeReference";
import path from "path";
import * as fs from "fs";
import * as http from "http";
import * as cp from "child_process";

const socket = dgram.createSocket("udp4");

let output: vscode.OutputChannel;
const processes = new Set<cp.ChildProcess>();
// the run that owns the output channel; a stopped run may still flush output after it
let currentProcess: cp.ChildProcess | undefined;
const manualServers = new Set<http.Server>();

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

async function saveToPlayDialog(): Promise<string> {
    const selected = await vscode.window.showInformationMessage<vscode.MessageItem>(
        "Save file for Csound to play?",
        { modal: true },
        { title: "Cancel", isCloseAffordance: true },
        { title: "Save", isCloseAffordance: false },
        { title: "Always silently save before playing", isCloseAffordance: false }
    );

    if (!selected) { return "Cancel"; }
    if (selected.title === "Always silently save before playing") {
        await vscode.workspace.getConfiguration("csound").update(
            "saveSilentlyOnPlay", true, vscode.ConfigurationTarget.Global
        );
        return "Save";
    }
    return selected.title;
}

// Saves the document if needed. Returns false when the user cancels or the save fails.
async function saveBeforeRun(document: vscode.TextDocument): Promise<boolean> {
    if (!document.isDirty) { return true; }

    const config = vscode.workspace.getConfiguration("csound");
    if (!config.get<boolean>("saveSilentlyOnPlay", false)) {
        if (await saveToPlayDialog() === "Cancel") { return false; }
    }

    if (!await document.save()) {
        vscode.window.showErrorMessage(`Could not save ${document.fileName}; Csound was not started.`);
        return false;
    }
    return true;
}

// .csd plays alone, .orc/.sco play as a pair with the same basename
function csoundInputFiles(file: string): string[] | undefined {
    const ext = path.extname(file).toLowerCase();
    const base = file.slice(0, file.length - ext.length);
    if (ext === ".csd") { return [file]; }
    if (ext === ".orc" || ext === ".sco") { return [base + ".orc", base + ".sco"]; }
    return undefined;
}

async function runCsound(outputArgs: (file: string) => string[]) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }

    const document = editor.document;
    const files = csoundInputFiles(document.fileName);
    if (!files) {
        vscode.window.showErrorMessage("Please open a .csd, .orc, or .sco file to run with Csound.");
        return;
    }

    if (!await saveBeforeRun(document)) { return; }

    if (output === undefined) {
        output = vscode.window.createOutputChannel("Csound output");
    }

    const config = vscode.workspace.getConfiguration("csound");
    const command = config.get<string>("executable", "csound");
    const args = [...outputArgs(document.fileName), ...files];

    // one run at a time: a second Run would otherwise mix its output with the first
    stopExecution();

    output.clear();
    output.show(true); // keep focus in the editor
    output.appendLine(`$ ${command} ${args.join(" ")}`);

    // argument array (no shell): paths with spaces stay one argument
    const proc = cp.spawn(command, args, { cwd: path.dirname(document.fileName) });
    processes.add(proc);
    currentProcess = proc;

    // csound writes most of its output to stderr; strip stray 'ANSI reset color' sequences
    const append = (data: Buffer) => {
        if (proc === currentProcess) { output.append(data.toString().replace(/\x1b\[m/g, "")); }
    };
    proc.stdout.on("data", append);
    proc.stderr.on("data", append);
    proc.on("error", (err) => {
        processes.delete(proc);
        vscode.window.showErrorMessage(`Could not start Csound (${command}): ${err.message}`);
    });
    proc.on("close", (code) => {
        processes.delete(proc);
        if (proc === currentProcess) { output.appendLine(`\n[csound exited with code ${code}]`); }
    });
}

export async function runFile() {
    const config = vscode.workspace.getConfiguration("csound");
    // clone: pushing onto the config array would modify the in-memory setting
    await runCsound(() => [...config.get<string[]>("playArgs", [])]);
}

export async function saveAsAudioFile() {
    await runCsound((file) => {
        const wav = path.join(path.dirname(file), path.parse(file).name + ".wav");
        return ["-o", wav];
    });
}

export async function openManual() {
    let result: { action: string; path: string; } | undefined;
    try {
        result = await vscode.commands.executeCommand("csound-lsp.open_manual");
    } catch (err) {
        console.warn("Csound LSP manual unavailable:", err);
    }

    // without the language server (or its local manual) fall back to the online manual
    if (result?.action !== "open html csound manual") {
        await showOpcodeReference();
        return;
    }

    let server: http.Server | undefined;
    try {
        server = createManualServer(result.path);
        manualServers.add(server);
        const localUrl = await listenOnLocalhost(server);

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

        // each panel owns its server
        const panelServer = server;
        panel.onDidDispose(() => closeManualServer(panelServer));

    } catch (err) {
        if (server) { closeManualServer(server); }
        vscode.window.showErrorMessage(`Manual server error: ${err}`);
    }
}

function closeManualServer(server: http.Server) {
    server.close();
    manualServers.delete(server);
    console.log("Manual Server off.");
}

export function closeManualServers() {
    for (const server of [...manualServers]) { closeManualServer(server); }
}

export function stopExecution() {
    for (const proc of processes) {
        console.log("Killing Csound process (pid " + proc.pid + ")");
        proc.kill("SIGTERM");
    }
    processes.clear();
}

function createManualServer(rootPath: string): http.Server {
    return http.createServer((req, res) => {
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
}

function listenOnLocalhost(server: http.Server): Promise<string> {
    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "localhost", () => {
            const address = server.address();
            if (address && typeof address !== 'string') {
                console.log(`Start csound manual server on localhost:${address.port}`);
                resolve(`http://localhost:${address.port}`);
            } else {
                reject("Manual Server Error");
            }
        });
    });
}
