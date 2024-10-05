"use strict";

import * as vscode from "vscode";
import * as commands from "./commands/csoundCommands";
import { showOpcodeReference } from "./commands/showOpcodeReference";
import { completionItemProvider, addTokensToDocumentSet, clearTokensForDocumentSet } from "./completionProvider";

export function activate(context: vscode.ExtensionContext) {
  console.log("Csound's vscode plugin is now active!");

  // Add autocomplete for opcodes
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      ["csound-csd", "csound-orc"],
      completionItemProvider,
      ""
    )
  );

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
      clearTokensForDocumentSet(uri); // Remove the token set for this document
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
