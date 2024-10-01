'use strict';

import * as vscode from 'vscode';
import * as commands from './csoundCommands';
import { XMLParser } from 'fast-xml-parser';


export function activate(context: vscode.ExtensionContext) {
    console.log("Csound's vscode plugin is now active!");

    // Define the structure of the opcode object
    interface Opcode {
        label: string;
        description: string;
    }

    // Utility function to convert synopsis with proper markdown and newlines
    function formatSynopsisForMarkdown(synopsis: string): string {
        // Add two spaces before each newline for single line breaks in Markdown
        return synopsis.replace(/\n/g, '  \n');
    }


    const extensionUri = context.extensionUri;
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider('csound-csd', {
        async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
            const config = vscode.workspace.getConfiguration("csound");
            const showHints = config.get("showFunctionalSyntax") as boolean;
            const filePath = vscode.Uri.joinPath(extensionUri, 'src', 'opcodes.json');
            // Read the file asynchronously and await the result
            const fileData = await vscode.workspace.fs.readFile(filePath);
            const completions: vscode.CompletionItem[] = [];
            if(!showHints)
                return completions;
            
            // Convert the Buffer (Uint8Array) to a string
            const jsonString = Buffer.from(fileData).toString('utf-8');
            const json = JSON.parse(jsonString);
            json.opcodes.forEach((categoryObj: any) => {
                categoryObj.opcodes.forEach((opcodeObj: any) => {
                    // Create a new CompletionItem
                    let completionItem = new vscode.CompletionItem(opcodeObj.opcodeName, vscode.CompletionItemKind.Snippet);

                    // Set the label to be the opcode name
                    completionItem.label = opcodeObj.opcodeName;

                    // Set the detail to be in the format "opcodeName: description"
                    completionItem.detail = "";//new vscode.MarkdownString();


                    const formattedSynopsis = formatSynopsisForMarkdown(`**${opcodeObj.opcodeName}**: *${opcodeObj.description}* \n\n` + opcodeObj.synopsis + '\n\n' + opcodeObj.functionalSynopsis);
                    completionItem.documentation = new vscode.MarkdownString(formattedSynopsis);



                    // Add the item to the completion list
                    completions.push(completionItem);
                });
            });


            return completions; 1
        }
    }, ''));


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
