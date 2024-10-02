"use strict";

import * as vscode from "vscode";
import * as commands from "./commands/csoundCommands";
import { showOpcodeReference } from "./commands/showOpcodeReference";
import opcodesJson from "./opcodes.json";

export function activate(context: vscode.ExtensionContext) {
  console.log("Csound's vscode plugin is now active!");

  // Utility function to convert synopsis with proper markdown and newlines
  function formatSynopsisForMarkdown(synopsis: string): string {
    // Add two spaces before each newline for single line breaks in Markdown
    return synopsis.replace(/\n/g, "  \n");
  }

  //add autocomplete for opcodes
  const extensionUri = context.extensionUri;
  const completionItemProvider = {
    async provideCompletionItems(
      document: vscode.TextDocument,
      position: vscode.Position,
      token: vscode.CancellationToken,
      context: vscode.CompletionContext
    ) {
      const config = vscode.workspace.getConfiguration("csound");
      const showHints = config.get("showHints") as boolean;
      const completions: vscode.CompletionItem[] = [];
      if (!showHints) {
        return completions;
      }
      opcodesJson.opcodes.forEach((categoryObj: any) => {
        categoryObj.opcodes.forEach((opcodeObj: any) => {
          // Create a new CompletionItem
          let completionItem = new vscode.CompletionItem(
            opcodeObj.opcodeName,
            vscode.CompletionItemKind.Snippet
          );

          // Set the label to be the opcode name
          completionItem.label = opcodeObj.opcodeName;

          // Forego detail here, as it is not necessary for the opcode list
          completionItem.detail = "";

          const formattedSynopsis = formatSynopsisForMarkdown(
            `**${opcodeObj.opcodeName}**: *${opcodeObj.description}* \n\n` +
              opcodeObj.synopsis +
              "\n\n" +
              opcodeObj.functionalSynopsis
          );
          completionItem.documentation = new vscode.MarkdownString(
            formattedSynopsis
          );

          // Add the item to the completion list
          completions.push(completionItem);
        });
      });

      return completions;
      1;
    },
  };

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
