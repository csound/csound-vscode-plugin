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


    // Function to concatenate text properties from synopsis
    function concatenateTexts(synopsis: any): string {
        // Check if synopsis is an array or an object and handle accordingly
        if (Array.isArray(synopsis)) {
            return synopsis.map(item => item["#text"]).join(' '); // Join with a space
        } else if (synopsis && typeof synopsis === 'object') {
            return synopsis["#text"] || ''; // Return the text if it's a single object
        }
        return ''; // Default return if neither
    }

    // Function to parse the XML content and generate the desired array of objects
    async function parseOpcodes(xmlContent: string): Promise<Opcode[]> {
        // Initialize the XML parser
        const parser = new XMLParser({
            preserveOrder: true
        });

        try {
            // Parse the XML string into a JavaScript object
            const jsonObj = parser.parse(xmlContent)[1];

            // Create a new text document
            // const document = await vscode.workspace.openTextDocument({
            //     content: JSON.stringify(jsonObj, null, 2), // Convert the JSON object to a string
            //     language: 'plaintext' // You can change this to any language you prefer
            // });

            // Show the new document in a new editor tab
            // await vscode.window.showTextDocument(document);
            // Check if parsing was successful
            if (!jsonObj || !jsonObj.opcodes || !jsonObj.opcodes[0].category) {
                console.error('Failed to parse XML content or structure is unexpected.');
                return [];
            }

            // Array to store the results
            const opcodesArray: Opcode[] = [];

            console.log(`Found ${jsonObj.opcodes.length} categories.`);
            // Access the opcodes from the parsed JSON object
            jsonObj.opcodes.forEach((opcode: any) => {
                const opcodes = opcode.category.flatMap((category: any) => category.opcode || []);

                // Use a Map to track duplicates and accumulate descriptions with syntax
                const opcodeMap = new Map<string, Opcode>();

                // Loop through each opcode object and extract data
                for (const opcode of opcodes) {
                    // Get the description (within <desc> tag)
                    const description = opcode.desc || '';

                    // Check if synopsis exists
                    const synopsisList = opcode.synopsis || [];
                    const synopses = Array.isArray(synopsisList) ? synopsisList : [synopsisList]; // Ensure it's an array

                    // Loop through each synopsis to extract opcodename and create syntax
                    for (const synopsis of synopses) {
                        const opcodeName = synopsis?.opcodename || '';
                        if (opcodeName) {
                            if (opcodeName[0]["#text"] === "oscili") {
                                console.log(`Found opcode: ${JSON.stringify(opcodeName, null, 2)}`);
                                console.log(`Synopsis: ${JSON.stringify(synopsisList, null, 2)}`);
                            }
                            let syntaxString = '';
                            // Extract the first text element
                            if(synopsisList.length > 3){
                            const firstText = synopsisList[0]["#text"];

                            // // Extract the opcodename text
                            const opcodeNameText = synopsisList[1].opcodename[0]["#text"];

                            // // Extract the second text element
                            const secondText = synopsisList[2]["#text"];

                            // // Create the new string
                            syntaxString = `${firstText} ${opcodeNameText} ${secondText}`;
                            // // Create a new syntax string using the concatenateTexts function
                            // const syntaxString = 'Syntax: ';;
                            }

                            // If this opcodeName already exists in the map, append the new syntax to the description
                            if (opcodeMap.has(opcodeName)) {
                                const existingOpcode = opcodeMap.get(opcodeName)!;
                                existingOpcode.description += `\n${syntaxString}`;
                            } else {
                                opcodeMap.set(opcodeName, {
                                    label: `${opcodeName[0]["#text"]}`,
                                    description: `${description}\n\n${syntaxString}`
                                });
                            }
                        }
                    }
                }

                // Convert the map to an array
                opcodesArray.push(...opcodeMap.values());
            });
            console.log(`Parsed ${opcodesArray.length} opcodes.`);
            return opcodesArray;

        } catch (error) {
            console.error('Error parsing XML:', error);
            return [];
        }
    }

    const extensionUri = context.extensionUri;
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider('csound-csd', {
        async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {

            const filePath = vscode.Uri.joinPath(extensionUri, 'src', 'opcodes.xml');
            // Read the file asynchronously
            // Read the file asynchronously and await the result
            const fileData = await vscode.workspace.fs.readFile(filePath);
            const completions: vscode.CompletionItem[] = [];
            // Convert the Buffer (Uint8Array) to a string
            const xmlString = Buffer.from(fileData).toString('utf-8');
            let opcodes = parseOpcodes(xmlString);
            (await opcodes).forEach((item) => {
                const completion = new vscode.CompletionItem(item.label, vscode.CompletionItemKind.Function);
                completion.detail = `${item.label}: ${item.description}`;  // Set the detail (opcode + arguments)
                // completion.documentation = new vscode.MarkdownString().appendCodeblock(item.syntax, 'csound');  // Set the documentation
                completions.push(completion);
            });

            //const completionItems = parseXMLAndGenerateCompletions(xmlString);

            // simpleCompletion.detail = 'Inserts Hello World';
            return completions;
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
