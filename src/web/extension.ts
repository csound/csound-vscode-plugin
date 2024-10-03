// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { completionItemProvider } from "../completionProvider";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const notYetImplementedForWeb = () => {
    vscode.window.showInformationMessage(
      "This command has not yet been reimplemented for the web."
    );
  };

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
