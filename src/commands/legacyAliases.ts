"use strict";

import * as vscode from "vscode";

// Pre-LSP command IDs, kept as hidden forwarders so existing user keybindings keep working.
const legacyAliases: [legacy: string, current: string][] = [
    ["extension.csoundPlayActiveDocument", "csound.runFile"],
    ["extension.csoundKillCsoundProcess", "csound.stopExecution"],
    ["extension.showOpcodeReference", "csound.openManual"],
];

export function registerLegacyAliases(context: vscode.ExtensionContext) {
    for (const [legacy, current] of legacyAliases) {
        context.subscriptions.push(
            vscode.commands.registerCommand(legacy, (...args: unknown[]) =>
                vscode.commands.executeCommand(current, ...args)
            )
        );
    }
}
