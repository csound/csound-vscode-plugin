"use strict";

import * as vscode from "vscode";
import * as commands from "./commands/csoundCommands";
import { showOpcodeReference } from "./commands/showOpcodeReference";
import { completionItemProvider } from "./completionProvider";

export let documentTokens: Map<string, Set<string>> = new Map(); // Use a Set to avoid duplicates

export function activate(context: vscode.ExtensionContext) {
  console.log("Csound's vscode plugin is now active!");

  // Add autocomplete for opcodes
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      "csound-csd",
      completionItemProvider,
      ""
    )
  );

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      "csound-orc",
      completionItemProvider,
      ""
    )
  );

  // Function to remove single-line and multi-line comments from a line
  function removeComments(lineText: string): string {
    // Remove single-line comments (//)
    lineText = lineText.replace(/\/\/.*$/, '');
    // Remove multi-line comments (/* ... */)
    lineText = lineText.replace(/\/\*[\s\S]*?\*\//g, '');
    return lineText;
  }

  // Function to add tokens (words) to the Set for the given document
  function addTokensToDocumentSet(document: vscode.TextDocument, content: string) {
    const uri = document.uri.toString();

    // Get or create the token set for this document
    let tokensSet = documentTokens.get(uri);
    if (!tokensSet) {
      tokensSet = new Set();
      documentTokens.set(uri, tokensSet);
    }

    // Process the content (can be the entire document or a single line)
    const lines = content.split('\n'); // Split content into lines

    lines.forEach(lineText => {
      // Remove comments from the line
      lineText = removeComments(lineText);

      // Split the line into words
      const newWords = lineText.split(/\W+/).filter(Boolean); // Split by non-alphanumeric characters, remove empty strings

      // Add only words that start with a, k, i, S, f (case-sensitive) or words that follow 'instr'
      newWords.forEach(word => {
        if (/^[akiSf]/.test(word)) { // Matches words starting with the specified characters
          tokensSet?.add(word);
        }

        // Add words following 'instr'
        const instrRegex = /\binstr\s+(\w+)/g;
        let match;
        while ((match = instrRegex.exec(lineText)) !== null) {
          tokensSet?.add(match[1]); // Add the word following 'instr'
        }
      });
    });
  }

  // Listen for changes in text documents
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      const document = event.document;

      event.contentChanges.forEach(change => {
        const lineNumber = change.range.start.line;
        const lineText = document.lineAt(lineNumber).text;
        const changeText = change.text;

        if (/\W/.test(changeText)) {
          // Add tokens from the current line
          addTokensToDocumentSet(document, lineText);
        }
      });
    })
  );

  // Listen for when an editor becomes active (e.g., switching between files)
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        const document = editor.document;
        addTokensToDocumentSet(document, document.getText()); // Parse the active document and add tokens
      }
    })
  );

  // Handle already open files when the extension is activated
  if (vscode.window.activeTextEditor) {
    const document = vscode.window.activeTextEditor.document;
    addTokensToDocumentSet(document, document.getText()); // Parse the currently active file
  }

  // Clean up token sets when a document is closed
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(document => {
      const uri = document.uri.toString();
      documentTokens.delete(uri); // Remove the token set for this document
    })
  );


  const showOpcodeReferenceCommand = vscode.commands.registerCommand(
    "extension.showOpcodeReference",
    showOpcodeReference
  );
  context.subscriptions.push(showOpcodeReferenceCommand);

  const playCommand = vscode.commands.registerTextEditorCommand(
    "extension.csoundPlayActiveDocument",
    commands.playActiveDocument
  );
  context.subscriptions.push(playCommand);

  const killCommand = vscode.commands.registerTextEditorCommand(
    "extension.csoundKillCsoundProcess",
    commands.killCsoundProcess
  );
  context.subscriptions.push(killCommand);

  const evalOrcCommand = vscode.commands.registerTextEditorCommand(
    "extension.csoundEvalOrc",
    commands.evalOrc
  );
  context.subscriptions.push(evalOrcCommand);

  const evalScoCommand = vscode.commands.registerTextEditorCommand(
    "extension.csoundEvalSco",
    commands.evalSco
  );
  context.subscriptions.push(evalScoCommand);

}

// This method is called when your extension is deactivated
export function deactivate() {
  commands.killCsoundProcess();
}
