'use strict';

import * as vscode from 'vscode';

import * as commands from './csoundCommands';

const fullRange = (doc: vscode.TextDocument) => doc.validateRange(new vscode.Range(new vscode.Position(0, 0), new vscode.Position(Number.MAX_VALUE, Number.MAX_VALUE)));

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

    vscode.languages.registerDocumentFormattingEditProvider('csound-csd', {
        provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
            let text = document.getText();
            // Replace all commas without a following space or with more than one with a single space
            text = text.replace(/(,(?![ ])|,[ ]{2,})/g, ', ');
            // Replace all space before instr headers with a single tab
            text = text.replace(/[ ]{0,}instr/g, '\tinstr');
            // Replace all space before instr footers with a single tab
            text = text.replace(/[ ]{0,}endin/g, '\endin');
            return [vscode.TextEdit.replace(fullRange(document), text)];
        }
    });

    
}

// this method is called when your extension is deactivated
export function deactivate() {
    commands.killCsoundProcess();
}
