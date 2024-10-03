"use strict";

import * as vscode from "vscode";
import * as commands from "./commands/csoundCommands";
import { showOpcodeReference } from "./commands/showOpcodeReference";
import { completionItemProvider } from "./completionProvider";

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
