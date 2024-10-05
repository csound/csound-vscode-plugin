// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { addTokensToDocumentSet, clearTokensForDocumentSet, completionItemProvider } from "../completionProvider";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const notYetImplementedForWeb = () => {
    vscode.window.showInformationMessage(
      "This command has not yet been reimplemented for the web."
    );
  };

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
    notYetImplementedForWeb
  );
  context.subscriptions.push(showOpcodeReferenceCommand);

  // play command
  const playCommand = vscode.commands.registerTextEditorCommand(
    "extension.csoundPlayActiveDocument",
    notYetImplementedForWeb
  );
  context.subscriptions.push(playCommand);

  const killCommand = vscode.commands.registerTextEditorCommand(
    "extension.csoundKillCsoundProcess",
    notYetImplementedForWeb
  );
  context.subscriptions.push(killCommand);

  const evalOrcCommand = vscode.commands.registerTextEditorCommand(
    "extension.csoundEvalOrc",
    notYetImplementedForWeb
  );
  context.subscriptions.push(evalOrcCommand);

  const evalScoCommand = vscode.commands.registerTextEditorCommand(
    "extension.csoundEvalSco",
    notYetImplementedForWeb
  );
  context.subscriptions.push(evalScoCommand);
}

// this method is called when your extension is deactivated
export function deactivate() {}
