"use strict";

import * as vscode from "vscode";
import { flash, getEvalText, getScoEvalText } from "../utils"; 

let output: vscode.OutputChannel;
// const processMap: { [csd: string]: CsoundObj | undefined } = {};

export async function playActiveDocument(webview:vscode.Webview, textEditor: vscode.TextEditor) {
    const config = vscode.workspace.getConfiguration("csound");
    const document = textEditor.document;
    // Currently only play csd files.
    // We need to figure out how to find matching .sco for .orc
    // (or .orc for .sco) before we can play those.
    if (document.languageId !== "csound-csd") {
        return;
    }
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

    // const view = createWebviewCsoundPanel();
    // view.reveal();
    vscode.window.showInformationMessage("TEST");

    // process.stdout.on("data", (data) => {
    //     // I've seen spurious 'ANSI reset color' sequences in some csound output
    //     // which doesn't render correctly in this context. Stripping that out here.
    //     output.append(data.toString().replace(/\x1b\[m/g, ""));
    // });
    // process.stderr.on("data", (data) => {
    //     // It looks like all csound output is written to stderr, actually.
    //     // If you want your changes to show up, change this one.
    //     output.append(data.toString().replace(/\x1b\[m/g, ""));
    // });
    // if (process.pid) {
    //     console.log("Csound is playing (pid " + process.pid + ")");
    // }
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
    // for (let pid in processMap) {
    //     let p = processMap[pid];
    //     if (p === undefined) {
    //         delete processMap[pid];
    //     } else {
    //         console.log("Killing Csound process (pid " + p.pid + ")");
    //         p.kill("SIGTERM");
    //         console.log("Csound subprocess terminated");
    //     }
    // }
}

export async function evalOrc(textEditor: vscode.TextEditor) {
    const config = vscode.workspace.getConfiguration("csound");
    // const port = config.get("UDPPort") as number;
    // const address = config.get("UDPAddress") as string;

    const document = textEditor.document;
    const selection = textEditor.selection;

    const { text, from , to} = getEvalText(document, selection);
    // socket.send(text, port, address);
    flash(textEditor, new vscode.Range(from, to));
}

export async function evalSco(textEditor: vscode.TextEditor) {
    const config = vscode.workspace.getConfiguration("csound");
    // const port = config.get("UDPPort") as number;
    // const address = config.get("UDPAddress") as string;

    const document = textEditor.document;
    const selection = textEditor.selection;

    const { text, from , to} = getScoEvalText(document, selection);
    // socket.send("$" + text, port, address);
    flash(textEditor, new vscode.Range(from, to));
}