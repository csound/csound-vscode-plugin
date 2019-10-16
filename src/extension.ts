'use strict';

import * as vscode from 'vscode';

import * as commands from './csoundCommands';

export function activate(context: vscode.ExtensionContext) {

    // play command
    const playCommand = vscode.commands.registerTextEditorCommand(
        'extension.csoundPlayActiveDocument',
        commands.playActiveDocument);
    context.subscriptions.push(playCommand);

    const killCommand = vscode.commands.registerCommand(
        'extension.csoundKillCsoundProcess',
        commands.killCsoundProcess);
    context.subscriptions.push(killCommand);
}

// this method is called when your extension is deactivated
export function deactivate() {
    commands.killCsoundProcess();
}
