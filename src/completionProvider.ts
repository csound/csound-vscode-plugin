import * as vscode from "vscode";
import opcodesJson from "./opcodes.json";

// Utility function to convert synopsis with proper markdown and newlines
const formatSynopsisForMarkdown = (synopsis: string): string => {
  // Add two spaces before each newline for single line breaks in Markdown
  return synopsis.replace(/\n/g, "  \n");
};

const fullOpcodeCompletions:Array<vscode.CompletionItem> = [];
  opcodesJson.opcodes.forEach((categoryObj: any) => {
  categoryObj.opcodes.forEach((opcodeObj: any) => {
    // Create a new CompletionItem
    let completionItem = new vscode.CompletionItem(
      opcodeObj.opcodeName,
      vscode.CompletionItemKind.Function
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
    fullOpcodeCompletions.push(completionItem);
  });
});

export const completionItemProvider = {
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ) {
    const config = vscode.workspace.getConfiguration("csound");
    const showHints = config.get("showHints") as boolean;
    if (!showHints) {
      return [];
    }

    // // Get the current line's text
    // const lineText = document.lineAt(position.line).text;

    // // Find the word range at the current position
    // const wordRange = document.getWordRangeAtPosition(position);
    // const currentWord = wordRange ? document.getText(wordRange) : '';

    // console.log("Current word: ", currentWord); 

    // // Filter completions based on the current word
    // return fullOpcodeCompletions.filter(item => 
    //   item.label.toString().toLowerCase().startsWith(currentWord.toLowerCase())
    // );
    return fullOpcodeCompletions;
  },
};
