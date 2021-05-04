'use strict';

import * as vscode from 'vscode';

import * as commands from './csoundCommands';

export function activate(context: vscode.ExtensionContext) {

    // play command
    const playCommand = vscode.commands.registerTextEditorCommand(
        'extension.csoundPlayActiveDocument',
        commands.playActiveDocument);
    context.subscriptions.push(playCommand);

    const killCommand = vscode.commands.registerTextEditorCommand(
        'extension.csoundKillCsoundProcess',
        commands.killCsoundProcess);
    context.subscriptions.push(killCommand);

    const evalOrcCommand = vscode.commands.registerTextEditorCommand(
        'extension.csoundEvalOrc',
        commands.evalOrc);
    context.subscriptions.push(evalOrcCommand);

    const evalScoCommand = vscode.commands.registerTextEditorCommand(
        'extension.csoundEvalSco',
        commands.evalSco);
    context.subscriptions.push(evalScoCommand);
}

// this method is called when your extension is deactivated
export function deactivate() {
    commands.killCsoundProcess();
}
