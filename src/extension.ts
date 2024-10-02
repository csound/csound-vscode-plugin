'use strict';

import * as vscode from 'vscode';
import * as commands from './csoundCommands';
import { XMLParser } from 'fast-xml-parser';


export function activate(context: vscode.ExtensionContext) {
    console.log("Csound's vscode plugin is now active!");

    // Utility function to convert synopsis with proper markdown and newlines
    function formatSynopsisForMarkdown(synopsis: string): string {
        // Add two spaces before each newline for single line breaks in Markdown
        return synopsis.replace(/\n/g, '  \n');
    }

    //add autocomplete for opcodes
    const extensionUri = context.extensionUri;
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider('csound-csd', {
        async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
            const config = vscode.workspace.getConfiguration("csound");
            const showHints = config.get("showHints") as boolean;
            const filePath = vscode.Uri.joinPath(extensionUri, 'src', 'opcodes.json');
            // Read the file asynchronously and await the result
            const fileData = await vscode.workspace.fs.readFile(filePath);
            const completions: vscode.CompletionItem[] = [];
            if(!showHints){
                return completions;
            }
            // Convert the Buffer (Uint8Array) to a string
            const jsonString = Buffer.from(fileData).toString('utf-8');
            const json = JSON.parse(jsonString);
            json.opcodes.forEach((categoryObj: any) => {
                categoryObj.opcodes.forEach((opcodeObj: any) => {
                    // Create a new CompletionItem
                    let completionItem = new vscode.CompletionItem(opcodeObj.opcodeName, vscode.CompletionItemKind.Snippet);

                    // Set the label to be the opcode name
                    completionItem.label = opcodeObj.opcodeName;

                    // Forego detail here, as it is not necessary for the opcode list
                    completionItem.detail = "";

                    const formattedSynopsis = formatSynopsisForMarkdown(`**${opcodeObj.opcodeName}**: *${opcodeObj.description}* \n\n` + opcodeObj.synopsis + '\n\n' + opcodeObj.functionalSynopsis);
                    completionItem.documentation = new vscode.MarkdownString(formattedSynopsis);

                    // Add the item to the completion list
                    completions.push(completionItem);
                });
            });


            return completions; 1
        }
    }, ''));

    const disposable = vscode.commands.registerCommand('extension.showOpcodeReference', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('No active editor found.');
            return;
        }

        const position = editor.selection.active;
        const wordRange = editor.document.getWordRangeAtPosition(position);
        const opcode = editor.document.getText(wordRange).trim(); // Get the opcode

        console.log(`Opcode: ${opcode}`); // Log the opcode for debugging

        const config = vscode.workspace.getConfiguration('yourExtension');
        const customPath = config.get<string>('htmlFilePath');
        const osPlatform = process.platform;
        let defaultPath: string;

        if (!customPath) {
            if (osPlatform === 'win32') {
                defaultPath = 'C:\\Program Files\\Csound6_x64\\doc\\manual'; // Default path for Windows
            } else if (osPlatform === 'darwin') {
                defaultPath = '/path/to/html'; // Default path for macOS
            } else {
                defaultPath = 'html'; // Default for other OS (like Linux)
            }
        } else {
            defaultPath = customPath; // Use user-defined path if available
        }
        // Construct the URI for the HTML file
        const htmlFileUri = vscode.Uri.file(`${defaultPath}/${opcode}.html`);

        try {
            // Check if the file exists before reading
            await vscode.workspace.fs.stat(htmlFileUri);

            // Read the HTML file content
            const htmlContent = await vscode.workspace.fs.readFile(htmlFileUri);
            const htmlString = htmlContent.toString(); // Convert buffer to string

            const panel = vscode.window.createWebviewPanel(
                'htmlPreview', // Identifies the type of the webview. Used internally
                `Preview for ${opcode}`, // Title of the panel displayed to the user
                vscode.ViewColumn.Beside, // Editor column to show the new webview panel in
                {} // Webview options
            );

            panel.webview.html = getWebviewContent(htmlString);
        } catch (error) {
            console.error(error); // Log the error to console for debugging
            const errorMessage = (error as Error).message;
            vscode.window.showErrorMessage(`Failed to load HTML file for opcode '${opcode}': ${errorMessage}`);
        }
    });

    context.subscriptions.push(disposable);
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

function getWebviewContent(htmlContent: string) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>HTML Preview</title>
    </head>
    <body>
        ${htmlContent}
    </body>
    </html>
    `;
}