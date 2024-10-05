import * as vscode from "vscode";
import opcodesJson from "./opcodes.json";

export let documentTokens: Map<string, Set<string>> = new Map(); // Use a Set to avoid duplicates

// Utility function to convert synopsis with proper markdown and newlines
const formatSynopsisForMarkdown = (synopsis: string): string => {
  // Add two spaces before each newline for single line breaks in Markdown
  return synopsis.replace(/\n/g, "  \n");
};

// Utility function to remove single-line and multi-line comments from a line
function removeComments(lineText: string): string {
  // Remove single-line comments (//)
  lineText = lineText.replace(/\/\/.*$/, '');
  // Remove multi-line comments (/* ... */)
  lineText = lineText.replace(/\/\*[\s\S]*?\*\//g, '');
  return lineText;
}

// Function to add tokens (words) to the Set for the given document
export const addTokensToDocumentSet = function (document: vscode.TextDocument, content: string) {
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

//delete token from document when document is closed
export const clearTokensForDocumentSet = function (uri: string) {
  documentTokens.delete(uri);
}

const fullOpcodeCompletions: Array<vscode.CompletionItem> = [];
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

    //get unique set for document
    const uri = document.uri.toString();
    const wordsSet = documentTokens.get(uri) || new Set();

    const completionItems = Array.from(wordsSet).map(token => {
      const item = new vscode.CompletionItem(token, vscode.CompletionItemKind.Text);
      return item;
    });

    // fullOpcodeCompletions.push(...completionItems);

    return [...fullOpcodeCompletions, ...completionItems];
  },
};
