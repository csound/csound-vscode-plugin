import * as vscode from "vscode";
import * as commands from "./commands/csoundCommands";
import { getLatestCsoundLSP, registerCsoundStatusBar } from "./utils";

import {
    LanguageClientOptions,
    LanguageClient,
    ServerOptions
} from 'vscode-languageclient/node';

let client: LanguageClient;

export async function activate(context: vscode.ExtensionContext) {
    console.log("Csound's vscode plugin is now active!");
    const lspPath = await getLatestCsoundLSP(context);
    // const lspPath = "/Users/pm/AcaHub/Coding/tree-sitter-csound/csound-lsp/target/release/csound-lsp"; // for local test
    // const lspPath = "/Users/pm/AcaHub/Coding/tree-sitter-csound/csound-vscode-plugin/lsp-bin/csound-lsp-macos-aarch64-v1_3_52"; // for local test
    if (!lspPath) { return; }

    const serverOptions: ServerOptions = {
        command: lspPath,
        args: [],
    };

    // if (vscode.env.uiKind === vscode.UIKind.Web) {
    //     return;
    // }

    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { scheme: "file", language: "csound" }
        ],
        initializationOptions: { isOnWeb: false }
    };

    client = new LanguageClient(
        "csound-lsp",
        "Csound Language Server",
        serverOptions,
        clientOptions
    );

    client.start();

    // status bar
    registerCsoundStatusBar(context);

    context.subscriptions.push({
        dispose: () => client.stop()
    });

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "csound.runFile",
            commands.runFile,
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "csound.saveAsAudioFile",
            commands.saveAsAudioFile,
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "csound.stopExecution",
            commands.stopExecution,
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "csound.openManual",
            commands.openManual,
        )
    );

    // context.subscriptions.push(
    //     vscode.commands.registerTextEditorCommand(
    //         "extension.csoundEvalOrc",
    //         commands.evalOrc
    //     )
    // );

    // context.subscriptions.push(
    //     vscode.commands.registerTextEditorCommand(
    //         "extension.csoundEvalSco",
    //         commands.evalSco
    //     )
    // );

}

// This method is called when your extension is deactivated
export function deactivate() {
    commands.closeManualServer();
    return client?.stop();
}
