import * as vscode from "vscode";
import * as commands from "./commands/csoundCommands";
import { registerLegacyAliases } from "./commands/legacyAliases";
import { getLatestCsoundLSP, registerCsoundStatusBar } from "./utils";

import {
    LanguageClientOptions,
    LanguageClient,
    ServerOptions
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export async function activate(context: vscode.ExtensionContext) {
    console.log("Csound's vscode plugin is now active!");

    // Commands do not depend on the language server: register them first so they
    // keep working when the LSP cannot be found, downloaded or started.
    context.subscriptions.push(
        vscode.commands.registerCommand("csound.runFile", commands.runFile),
        vscode.commands.registerCommand("csound.saveAsAudioFile", commands.saveAsAudioFile),
        vscode.commands.registerCommand("csound.stopExecution", commands.stopExecution),
        vscode.commands.registerCommand("csound.openManual", commands.openManual),
        vscode.commands.registerCommand("extension.csoundSelectExecutable", commands.selectCsoundExecutable),
        vscode.commands.registerTextEditorCommand("extension.csoundEvalOrc", commands.evalOrc),
        vscode.commands.registerTextEditorCommand("extension.csoundEvalSco", commands.evalSco),
    );
    registerLegacyAliases(context);

    // Native-only commands depend on which entry point runs, not on the UI kind:
    // a browser UI (e.g. Codespaces) can still run this extension in a remote Node host.
    await vscode.commands.executeCommand("setContext", "csound.host", "native");

    // status bar
    registerCsoundStatusBar(context);

    let lspPath: string | undefined;
    try {
        lspPath = await getLatestCsoundLSP(context);
    } catch (err) {
        console.error("Csound LSP setup failed:", err);
        vscode.window.showWarningMessage(`Csound LSP could not be set up: ${err}`);
    }
    // const lspPath = "/Users/pm/AcaHub/Coding/tree-sitter-csound/csound-lsp/target/release/csound-lsp"; // for local test
    if (!lspPath) { return; }

    const serverOptions: ServerOptions = {
        command: lspPath,
        args: [],
    };

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

    context.subscriptions.push({
        dispose: () => client?.stop()
    });

    try {
        await client.start();
    } catch (err) {
        vscode.window.showErrorMessage(`Csound Language Server failed to start: ${err}`);
    }
}

// This method is called when your extension is deactivated
export function deactivate() {
    commands.stopExecution();
    commands.closeManualServers();
    return client?.stop();
}
