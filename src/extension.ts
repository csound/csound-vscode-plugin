'use strict';

import * as vscode from 'vscode';
import * as commands from './csoundCommands';
import { XMLParser } from 'fast-xml-parser';


export function activate(context: vscode.ExtensionContext) {
    console.log("Csound's vscode plugin is now active!");
    function parseXMLAndGenerateCompletions(xmlString: string) {
        // Create a DOM parser
        const parser = new XMLParser();
        const xmlDoc = parser.parse(xmlString);
    
        // Create an array to store completions
        const completions = [];
    
        // Extract all categories
        const categories = xmlDoc.getElementsByTagName("category");
    
        // Loop over each category
        for (let i = 0; i < categories.length; i++) {
            const category = categories[i];
            const categoryName = category.getAttribute("name");
    
            // Extract all opcodes within this category
            const opcodes = category.getElementsByTagName("opcode");
    
            // Loop over each opcode within the category
            for (let j = 0; j < opcodes.length; j++) {
                const opcode = opcodes[j];
    
                // Extract opcode name and description
                const synopsisElements = opcode.getElementsByTagName("synopsis");
                const description = opcode.getElementsByTagName("desc")[0].textContent;
    
                // Loop through multiple synopsis elements if they exist
                for (let k = 0; k < synopsisElements.length; k++) {
                    const synopsisElement = synopsisElements[k];
                    const opcodeName = synopsisElement.getElementsByTagName("opcodename")[0].textContent;
                    const signature = synopsisElement.textContent.trim();
    
                    // Create a completion object
                    const completion = {
                        label: opcodeName,
                        kind: "Function", // Assuming these are all function-like completions
                        detail: `${categoryName}: ${signature}`,
                        documentation: description
                    };
    
                    // Add the completion to the array
                    completions.push(completion);
                }
            }
        }
    
        // Return the generated completions
        return completions;
    }

    const provider = vscode.languages.registerCompletionItemProvider('javascript', {
        provideCompletionItems: (document: vscode.TextDocument, position: vscode.Position) => {
            // Load completions from XML (return a promise)
            const filePath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'src', 'resources', 'opcodes.xml');
            const fileData = vscode.workspace.fs.readFile(filePath);
            return new Promise((resolve, reject) => {
                try {                    
                    const xmlString = fileData.toString(); // Convert the Buffer to a string
                    const completionItems = parseXMLAndGenerateCompletions(xmlString); // Call your function
                    return completionItems;
                } catch (error) {
                    reject(error);
                }
            });
        }
    });

    context.subscriptions.push(provider);
    
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
