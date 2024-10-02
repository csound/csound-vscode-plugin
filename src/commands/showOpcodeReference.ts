"use strict";

import * as vscode from "vscode";

export const showOpcodeReference = async () => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage("No active editor found.");
    return;
  }

  const position = editor.selection.active;
  const wordRange = editor.document.getWordRangeAtPosition(position);
  const opcode = editor.document.getText(wordRange).trim(); // Get the opcode

  console.log(`Opcode: ${opcode}`); // Log the opcode for debugging

  const config = vscode.workspace.getConfiguration("csound");
  let htmlFilePath = config.get<string>("htmlFilePath");
  const osPlatform = process.platform;

  if (!htmlFilePath) {
    if (osPlatform === "win32") {
      htmlFilePath = "C:\\Program Files\\Csound6_x64\\doc\\manual"; // Default path for Windows
    } else if (osPlatform === "darwin") {
       htmlFilePath = "/Library/Frameworks/CsoundLib64.framework/Versions/6.0/Resources/Manual"; // Default path for macOS
    }
    // } else {
    //   defaultPath = "html"; // Default for other OS (like Linux)
    // }
  }   
  // Construct the URI for the HTML file
  const htmlFileUri = vscode.Uri.file(`${htmlFilePath}/${opcode}.html`);

  try {
    // Check if the file exists before reading
    await vscode.workspace.fs.stat(htmlFileUri);

    // Read the HTML file content
    const htmlContent = await vscode.workspace.fs.readFile(htmlFileUri);
    const htmlString = htmlContent.toString(); // Convert buffer to string

    const panel = vscode.window.createWebviewPanel(
      "htmlPreview", // Identifies the type of the webview. Used internally
      `Preview for ${opcode}`, // Title of the panel displayed to the user
      vscode.ViewColumn.Beside, // Editor column to show the new webview panel in
      {} // Webview options
    );

    panel.webview.html = getWebviewContent(htmlString);
  } catch (error) {
    console.error(error); // Log the error to console for debugging
    const errorMessage = (error as Error).message;
    vscode.window.showErrorMessage(
      `Failed to load HTML file for opcode '${opcode}': ${errorMessage}`
    );
  }
};

const getWebviewContent = (htmlContent: string) => {
  return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>HTML Preview</title>
      </head>
      <body>
          ${htmlContent}
      </body>
      </html>
      `;
}
