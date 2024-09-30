'use strict';

import * as vscode from 'vscode';
import * as commands from './csoundCommands';
import { XMLParser } from 'fast-xml-parser';


export function activate(context: vscode.ExtensionContext) {
    console.log("Csound's vscode plugin is now active!");

    function parseXMLAndGenerateCompletions(xmlString: string): vscode.CompletionItem[] {
        // Create a parser instance
        const parser = new XMLParser();
        const xmlDoc = parser.parse(xmlString); // Parse the XML string to a JS object

        // Log the parsed XML structure for debugging
        console.log(JSON.stringify(xmlDoc, null, 2));

        // Create an array to store completions
        const completions: vscode.CompletionItem[] = [];

        // Extract all categories from the parsed XML object
        const categories = xmlDoc.categories?.category || []; // Handle case where categories might not exist

        // Loop over each category
        for (const category of categories) {
            const categoryName = category.name; // Extract category name

            // Extract all opcodes within this category
            const opcodes = category.opcode || []; // Handle case where opcode might not exist

            // Loop over each opcode within the category
            for (const opcode of opcodes) {
                const description = opcode.desc || ""; // Extract description
                const synopsisElements = opcode.synopsis || []; // Access synopsis elements

                // Loop through multiple synopsis elements if they exist
                for (const synopsisElement of synopsisElements) {
                    const opcodeName = synopsisElement.opcodename || ""; // Extract opcode name

                    // Extract signature, which is the text content excluding the opcode name
                    const signature = synopsisElement['#text']?.replace(opcodeName, "").trim() || "";

                    // Create a VS Code CompletionItem
                    const completion = new vscode.CompletionItem(opcodeName, vscode.CompletionItemKind.Function);
                    completion.detail = `${categoryName}: ${opcodeName} ${signature}`; // Set the detail (opcode + arguments)
                    completion.documentation = new vscode.MarkdownString(description); // Set description as documentation
                    completion.command = { command: 'editor.action.triggerSuggest', title: 'Re-trigger completions...' };

                    // Add the completion to the array
                    completions.push(completion);
                }
            }
        }

        // Return the generated completions
        return completions;
    }


    const extensionUri = context.extensionUri;
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider('csound-csd', {
        provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {

            const filePath = vscode.Uri.joinPath(extensionUri, 'src', 'opcodes.xml');
            // Read the file asynchronously
            const fileData = vscode.workspace.fs.readFile(filePath);
            // Convert the Buffer to a string
            const xmlString = fileData.toString();
            const completionItems = parseXMLAndGenerateCompletions(xmlString);

            completionItems.forEach((item) => {
                let i = item;
            });
            // const simpleCompletion = new vscode.CompletionItem('Hello World!');
            // simpleCompletion.detail = 'Inserts Hello World';
            return completionItems;
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
