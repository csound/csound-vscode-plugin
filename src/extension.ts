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
            let changes: vscode.TextEdit[] = [];
            let section : "OPTIONS" | "INSTRUMENTS" | "SCORE" | "EMPTY" = "EMPTY";
            for(let i = 0; i < document.lineCount; i++) {
                const line = document.lineAt(i);
                switch(true){
                    case line.text.includes("<CsOptions>"):
                        section = "OPTIONS";
                        break;
                    case line.text.includes("<CsInstruments>"):
                        section = "INSTRUMENTS";
                        break;
                    case line.text.includes("</"):
                        section = "EMPTY";
                        break;
                }
                switch(section){
                    case "OPTIONS":
                        changes.push(new vscode.TextEdit(line.range, line.text.replace(/\s/g, "")));
                        break;
                    case "INSTRUMENTS":
                        changes.push(new vscode.TextEdit(line.range, line.text.replace(/(,(?![ ])|,[ ]{2,})/g, ', ')));
                        break;
                    case "EMPTY":
                    default:
                        break;
                } 
            }        
            return changes;
        }
    });

    
}

// this method is called when your extension is deactivated
export function deactivate() {
    commands.killCsoundProcess();
}
