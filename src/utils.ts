"use strict";

import * as vscode from "vscode";
import fs from "fs";
import path from "path";
import os from "os";
import * as https from "https";

const starts = [
    [/^\s*instr/, "instr"],
    [/^\s*endin/, "endin"],
    [/^\s*opcode/, "opcode"],
    [/^\s*endop/, "endop"],
];
const startsWithOneOfThese = function (txt:vscode.TextLine) {
    for (let i = 0; i < starts.length; i++) {
        if (txt.text.match(starts[i][0]) !== null) {
            return starts[i][1] as string;
        }
    }
    return null;
};

const findLineWithBlock = function (document:vscode.TextDocument, start:number, direction:number, limit:number):[number, string] {
    for (let i = start; i !== limit; i += direction) {
        let find = startsWithOneOfThese(document.lineAt(i));
        if (find !== null) {
            return [i, find];
        }
    }
    return [-1,""];
};

export const getEvalText = function (document:vscode.TextDocument, selection:vscode.Selection) {
    let text = document.getText(selection);
    let from = selection.start;
    let to = selection.end;

    if (selection.isEmpty) {
        let prevBlockMark = findLineWithBlock(document, selection.start.line, -1, -1);
        let nextBlockMark = findLineWithBlock(document, selection.start.line, 1, document.lineCount);

        if (
            prevBlockMark !== null &&
            nextBlockMark !== null &&
            ((prevBlockMark[1] === "instr" && nextBlockMark[1] === "endin") ||
                (prevBlockMark[1] === "opcode" && nextBlockMark[1] === "endop"))
        ) {
            from = document.lineAt(prevBlockMark[0]).range.start;
            to = document.lineAt(nextBlockMark[0]).range.end;
            text = document.getText(new vscode.Range(from, to));
        } else {
            const line = document.lineAt(selection.active);
            from = line.range.start;
            to = line.range.end;
            text = document.getText(line.range);
        }
    }
    return { text, from, to };
};


export const getScoEvalText = function (document:vscode.TextDocument, selection:vscode.Selection) {
    let text = document.getText(selection);
    let from = selection.start;
    let to = selection.end;

    if (selection.isEmpty) {
            const line = document.lineAt(selection.active);
            from = line.range.start;
            to = line.range.end;
            text = document.getText(line.range);
    }
    return { text, from, to };
};

export const flash = function (textEditor:vscode.TextEditor, range:vscode.Range) {
    const flashDecorationType = vscode.window.createTextEditorDecorationType({
        light: {
            backgroundColor: 'darkGray'
        },
        dark: {
            backgroundColor: 'rgba(255, 255, 255, 0.5)'
        }
    });
    textEditor.setDecorations(flashDecorationType, [range]);
    setTimeout(function () {
        flashDecorationType.dispose();
    }, 250);
};

export async function getLatestCsoundLSP(context: vscode.ExtensionContext): Promise<string | undefined> {
    const binDir = path.join(context.extensionPath, 'lsp-bin');
    const platform = os.platform();
    const arch = os.arch();

    let binaryName = '';

    if (platform === 'win32') {
        binaryName = 'csound-lsp-windows-x86_64.exe';
    }
    else if (platform === 'linux') {
        binaryName = 'csound-lsp-linux-x86_64';
    }
    else if (platform === 'darwin') {
        if (arch === 'arm64') {
            binaryName = 'csound-lsp-macos-aarch64';
        } else {
            binaryName = 'csound-lsp-macos-x86_64';
        }
    }
    else {
        vscode.window.showErrorMessage(`OS not supported: ${platform}`);
        return undefined;
    }

    const relTag = await getLatestReleaseTag();

    const fullPath = path.join(binDir, binaryName + "-" + relTag.replaceAll(".", "_"));
    if (fs.existsSync(fullPath)) { return fullPath; }

    const inform = await vscode.window.showInformationMessage(
        "A new version of the Csound LSP is available. Do you want to install or update it?",
        "Yes", "No"
    );

    if (inform === "Yes") {
        if (!fs.existsSync(binDir)) {
            fs.mkdirSync(binDir, { recursive: true });
        } else {
            const files = fs.readdirSync(binDir);
            for (const file of files) {
                fs.unlinkSync(path.join(binDir, file));
            }
        }

        const downloadUrl = `https://github.com/PasqualeMainolfi/csound-lsp/releases/latest/download/${binaryName}`;

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Csound LSP installation (${binaryName})...`,
                cancellable: false
            }, async (progress) => { await downloadFile(downloadUrl, fullPath, progress); });

            vscode.window.showInformationMessage("Csound LSP is now available!");

        } catch (err) {
            vscode.window.showErrorMessage(`Something went wrong: ${err}`);
            if (fs.existsSync(fullPath)) { fs.unlinkSync(fullPath); }
            return undefined;
        }

        if (platform !== 'win32') {
            try {
                fs.chmodSync(fullPath, '755');
            } catch (e) {
                console.warn("permission denied +x:", e);
            }
        }

        return fullPath;
    } else {
        const files = fs.existsSync(binDir) ? fs.readdirSync(binDir) : [];
        const lspFile = files.find(f => f.startsWith("csound-lsp"));
        if (!lspFile) {
            vscode.window.showWarningMessage("No Csound LSP found!");
            return undefined;
        }
        return path.join(binDir, lspFile);
    }

}

function downloadFile(
    url: string, destPath: string, progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<void> {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);

        const request = https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                if (response.headers.location) {
                    file.close();
                    downloadFile(response.headers.location, destPath, progress)
                        .then(resolve)
                        .catch(reject);
                    return;
                }
            }

            if (response.statusCode !== 200) {
                file.close();
                fs.unlink(destPath, () => {});
                reject(new Error(`Status code HTTP: ${response.statusCode}`));
                return;
            }

            const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
            let receivedBytes = 0;

            response.pipe(file);

            response.on('data', (chunk) => {
                receivedBytes += chunk.length;

                if (totalBytes > 0) {
                    const percentage = Math.round((receivedBytes / totalBytes) * 100);
                    progress.report({ message: `${percentage}%` });
                } else {
                    const mb = (receivedBytes / 1024 / 1024).toFixed(2);
                    progress.report({ message: `${mb} MB` });
                }
            });

            file.on('finish', () => {
                file.close();
                resolve();
            });

            file.on('error', (err) => {
                fs.unlink(destPath, () => {});
                reject(err);
            });
        });

        request.on('error', (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
        });
    });
}

function getLatestReleaseTag(): Promise<string> {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: `/repos/PasqualeMainolfi/csound-lsp/releases/latest`,
            method: 'GET',
            headers: {
                'User-Agent': 'VSCode-Csound-Extension'
            }
        };

        const req = https.request(options, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`GitHub API Error: ${res.statusCode}`));
                return;
            }

            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const release = JSON.parse(data);
                    resolve(release.tag_name);
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.end();
    });
}

export function registerCsoundStatusBar(context: vscode.ExtensionContext) {
    const csoundControls = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    csoundControls.text = "$(agent) Csound actions";
    csoundControls.tooltip = "Csound actions";
    csoundControls.command = "csound.showStatusBarActions";
    csoundControls.show();

    context.subscriptions.push(csoundControls);

    vscode.commands.registerCommand("csound.showStatusBarActions", async () => {
        const isWeb = vscode.env.uiKind === vscode.UIKind.Web;

        const actions: { label: string; command: string }[] = isWeb
            ? []
            : [
                { label: "$(play-circle) Run", command: "csound.runFile" },
                { label: "$(stop-circle) Stop", command: "csound.stopExecution" },
                { label: "$(unmute) Generate Audio File", command: "csound.saveAsAudioFile" },
                { label: "$(book) Manual", command: "csound.openManual" }
            ];

        const choice = await vscode.window.showQuickPick(actions, {
            placeHolder: "Csound actions"
        });

        if (!choice) { return; }

        vscode.commands.executeCommand(choice.command);
    });
}
