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

const DOWNLOAD_SUFFIX = ".download";

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

    // installed binaries are named <stem>-<tag><ext>, e.g. csound-lsp-macos-aarch64-v1_3_52
    // or csound-lsp-windows-x86_64-v1_3_52.exe; the tag goes before ".exe" so Windows
    // still sees an executable. <binaryName>-<tag> is the old Windows layout, matched so
    // those installs are reused and cleaned up on the next update.
    const { name: binaryStem, ext: binaryExt } = path.parse(binaryName);
    const isInstalledBinary = (f: string) =>
        (f.startsWith(binaryStem + "-") || f.startsWith(binaryName + "-")) && !f.endsWith(DOWNLOAD_SUFFIX);
    const installed = fs.existsSync(binDir) ? fs.readdirSync(binDir).filter(isInstalledBinary) : [];
    const installedPath = installed.length > 0 ? path.join(binDir, installed.sort().pop()!) : undefined;

    let relTag: string;
    try {
        relTag = await getLatestReleaseTag();
    } catch (err) {
        // offline or rate limited: keep using what is installed
        console.warn("Csound LSP update check failed:", err);
        if (!installedPath) {
            vscode.window.showWarningMessage(`No Csound LSP installed and the latest release could not be fetched: ${err}`);
        }
        return installedPath;
    }

    const fullPath = path.join(binDir, `${binaryStem}-${relTag.replaceAll(".", "_")}${binaryExt}`);
    if (fs.existsSync(fullPath)) { return fullPath; }

    const inform = await vscode.window.showInformationMessage(
        installedPath
            ? "A new version of the Csound LSP is available. Do you want to update it?"
            : "The Csound LSP is not installed. Do you want to install it?",
        "Yes", "No"
    );

    if (inform !== "Yes") {
        if (!installedPath) { vscode.window.showWarningMessage("No Csound LSP found!"); }
        return installedPath;
    }

    fs.mkdirSync(binDir, { recursive: true });
    const downloadUrl = `https://github.com/PasqualeMainolfi/csound-lsp/releases/latest/download/${binaryName}`;
    // download next to the target and swap in only once complete, so a failed
    // update leaves the current installation untouched
    const tmpPath = fullPath + DOWNLOAD_SUFFIX;

    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Csound LSP installation (${binaryName})...`,
            cancellable: false
        }, async (progress) => { await downloadFile(downloadUrl, tmpPath, progress); });

        if (fs.statSync(tmpPath).size === 0) { throw new Error("downloaded file is empty"); }
        if (platform !== 'win32') { fs.chmodSync(tmpPath, 0o755); }
        fs.renameSync(tmpPath, fullPath);

    } catch (err) {
        if (fs.existsSync(tmpPath)) { fs.unlinkSync(tmpPath); }
        vscode.window.showErrorMessage(`Csound LSP update failed: ${err}`);
        return installedPath;
    }

    for (const old of installed) {
        try {
            fs.unlinkSync(path.join(binDir, old));
        } catch (e) {
            console.warn("Could not remove old Csound LSP:", e);
        }
    }

    vscode.window.showInformationMessage("Csound LSP is now available!");
    return fullPath;
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

        req.setTimeout(5000, () => req.destroy(new Error("GitHub API request timed out")));
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

    context.subscriptions.push(vscode.commands.registerCommand("csound.showStatusBarActions", async () => {
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
    }));
}
