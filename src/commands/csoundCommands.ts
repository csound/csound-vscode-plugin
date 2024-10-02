"use strict";

import * as path from "path";
import * as cp from "child_process";
import * as vscode from "vscode";
import * as dgram from "dgram";
import { flash, getEvalText, getScoEvalText } from "../utils"; 

const socket = dgram.createSocket("udp4");

let output: vscode.OutputChannel;
const processMap: { [pid: number]: cp.ChildProcess | undefined } = {};

export async function playActiveDocument(textEditor: vscode.TextEditor) {
    const config = vscode.workspace.getConfiguration("csound");
    const document = textEditor.document;
    // Currently plays csd files
    // or orc/sco file pair in the same folder with the same basename

    if (document.isDirty) {
        if (!config.get("saveSilentlyOnPlay")) {
            const selection = await saveToPlayDialog();
            if (selection === "Cancel") {
                return;
            }
        }
        await document.save();
    }
    if (output === undefined) {
        output = vscode.window.createOutputChannel("Csound output");
    }

    const command = config.get("executable", "csound");
    // We need to clone the args array because if we don't, when we push the filename on, it
    // will actually go into the config in memory, and be in the args of our next syntax check.
    const args: string[] = [...config.get("playArgs", [])];

    if (document.languageId === "csound-orc" || document.languageId === "csound-sco") {
        const baseName = document.fileName.substring(0, document.fileName.length - 4);
        args.push(baseName + ".orc");
        args.push(baseName + ".sco");
    }
    else if (document.languageId === "csound-csd") {
        args.push(document.fileName);
    }
    else {
        return;
    }

    const options = { cwd: path.dirname(document.fileName) };

    output.clear();
    output.show(true); // true means keep focus in the editor window

    const process = cp.spawn(command, args, options);

    processMap[process.pid] = process;

    process.stdout.on("data", (data) => {
        // I've seen spurious 'ANSI reset color' sequences in some csound output
        // which doesn't render correctly in this context. Stripping that out here.
        output.append(data.toString().replace(/\x1b\[m/g, ""));
    });
    process.stderr.on("data", (data) => {
        // It looks like all csound output is written to stderr, actually.
        // If you want your changes to show up, change this one.
        output.append(data.toString().replace(/\x1b\[m/g, ""));
    });
    if (process.pid) {
        console.log("Csound is playing (pid " + process.pid + ")");
    }
}

async function saveToPlayDialog(): Promise<string> {
    const selected = await vscode.window
        .showInformationMessage<vscode.MessageItem>(
            "Save file for Csound to play?",
            { modal: true },
            { title: "Cancel", isCloseAffordance: true },
            { title: "Save", isCloseAffordance: false },
            {
                title: "Always silently save before playing",
                isCloseAffordance: false,
            }
        )

        .then((selected) => {
            if (selected) {
                if (selected.title === "Always silently save before playing") {
                    setSaveSilentlyOnPlay();
                    return "Save";
                } else {
                    return selected.title;
                }
            } else {
                return "Cancel";
            }
        });
    return selected || "Cancel";
}

async function setSaveSilentlyOnPlay() {
    const config = vscode.workspace.getConfiguration("csound");
    config.update("saveSilentlyOnPlay", "true", true);
}

export function killCsoundProcess() {
    for (let pid in processMap) {
        let p = processMap[pid];
        if (p === undefined) {
            delete processMap[pid];
        } else {
            console.log("Killing Csound process (pid " + p.pid + ")");
            p.kill("SIGTERM");
            console.log("Csound subprocess terminated");
        }
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