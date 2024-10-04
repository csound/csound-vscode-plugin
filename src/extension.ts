"use strict";

import * as vscode from "vscode";
import * as commands from "./commands/csoundCommands";
import { showOpcodeReference } from "./commands/showOpcodeReference";
import { completionItemProvider } from "./completionProvider";

export let tokens: Set<string> = new Set(); // Use a Set to avoid duplicates

export function activate(context: vscode.ExtensionContext) {
  console.log("Csound's vscode plugin is now active!");

  //add autocomplete for opcodes
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

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      const document = event.document;
      event.contentChanges.forEach(change => {
        // Get the position of the line that was modified
        const lineNumber = change.range.start.line;
        const lineText = document.lineAt(lineNumber).text; // Get the entire line text
        // Detect whether the change contains a non-alphanumeric character (end of a word)
        const changeText = change.text;
        if (/\W/.test(changeText)) {
          // If a non-alphanumeric character was entered, split the line into words
          const newWords = lineText.split(/\W+/).filter(Boolean); // Split by non-alphanumeric characters, remove empty strings
          // Add each completed word from the current line to the Set
          newWords.forEach(word => tokens.add(word));
        }
      });
    })
  );

  // Function to parse an entire document and add words
  const addWordsFromDocument = (document: vscode.TextDocument) => {
    const text = document.getText(); // Get the entire text of the document
    console.log("text", text);
    const wordsInDocument = text.split(/\W+/).filter(Boolean); // Split text by non-alphanumeric characters
    wordsInDocument.forEach(word => tokens.add(word)); // Add each word to the set
  };

  // Listen for when a document is opened
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(document => {
      addWordsFromDocument(document); // Parse the document and add words
    })
  );

  // Listen for when an editor becomes active (e.g., when switching between files)
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        const document = editor.document;
        addWordsFromDocument(document); // Parse the active document and add words
      }
    })
  );

  // Listen for when an editor becomes active (in case the file is still loading when opened)
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        const document = editor.document;
        addWordsFromDocument(document); // Parse the active document and add words
      }
    })
  );

  // Handle already open files when extension is activated
  if (vscode.window.activeTextEditor) {
    const document = vscode.window.activeTextEditor.document;
    addWordsFromDocument(document); // Parse the currently active file
  }

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

// this method is called when your extension is deactivated
export function deactivate() {
  commands.killCsoundProcess();
}
