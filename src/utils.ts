"use strict";

import * as vscode from "vscode";
import fs from "fs";
import path from "path";
import os from "os";
import * as https from "https";
import { pipeline } from "stream";

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
    // pick the newest by numeric version (v1_10 > v1_9); leave `installed` intact for cleanup
    const newest = [...installed].sort((a, b) => compareVersions(tagOf(a, binaryStem), tagOf(b, binaryStem))).pop();
    const installedPath = newest ? path.join(binDir, newest) : undefined;

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
        try { fs.rmSync(tmpPath, { force: true }); } catch (e) { console.warn("Could not remove partial download:", e); }
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

// installed file name -> its release tag, e.g. "v1_3_52"
function tagOf(fileName: string, binaryStem: string): string {
    return fileName.slice(binaryStem.length);
}

function compareVersions(a: string, b: string): number {
    const pa = (a.match(/\d+/g) ?? []).map(Number);
    const pb = (b.match(/\d+/g) ?? []).map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (diff !== 0) { return diff; }
    }
    return 0;
}

const MAX_REDIRECTS = 5;
const DOWNLOAD_IDLE_TIMEOUT_MS = 30000;

// The caller removes destPath on rejection.
function downloadFile(
    url: string, destPath: string, progress: vscode.Progress<{ message?: string; increment?: number }>,
    redirectsLeft = MAX_REDIRECTS
): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = https.get(url, (response) => {
            const status = response.statusCode ?? 0;
            if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
                response.resume();
                if (redirectsLeft === 0) {
                    reject(new Error("Too many redirects"));
                    return;
                }
                const next = new URL(response.headers.location, url).toString();
                downloadFile(next, destPath, progress, redirectsLeft - 1).then(resolve, reject);
                return;
            }

            if (status !== 200) {
                response.resume();
                reject(new Error(`Status code HTTP: ${status}`));
                return;
            }

            const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
            let receivedBytes = 0;

            // create the file only for the final response; pipeline rejects on any
            // failure of either stream (open error, aborted connection, write error)
            pipeline(response, fs.createWriteStream(destPath), (err) => {
                if (err) { reject(err); } else { resolve(); }
            });

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
        });

        // a stalled connection destroys the socket, which also fails the pipeline
        request.setTimeout(DOWNLOAD_IDLE_TIMEOUT_MS, () => request.destroy(new Error("Download timed out")));
        request.on('error', reject);
    });
}

function getLatestReleaseTag(): Promise<string> {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: `/repos/PasqualeMainolfi/csound-lsp/releases/latest`,
            method: 'GET',
            headers: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
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
        // only registered by the Node entry point, so all native actions are available
        // (also in browser-based UIs such as Codespaces, where this runs on the remote host)
        const actions: { label: string; command: string }[] = [
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
