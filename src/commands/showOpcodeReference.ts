"use strict";

import * as vscode from "vscode";

export const showOpcodeReference = async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showInformationMessage("No active editor found.");
        return;
    }
    const panel = vscode.window.createWebviewPanel(
        "htmlPreview", // Identifies the type of the webview. Used internally
        "Csound Manual", // Title of the panel displayed to the user
        vscode.ViewColumn.Beside, // Editor column to show the new webview panel in
        {
            enableScripts: true
        } // Webview options
    );
    panel.webview.html = getWebviewContent();
};

const getWebviewContent = () => {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                html, body, iframe {
                    width: 100%;
                    height: 100%;
                    margin: 0;
                    padding: 0;
                }
                iframe {
                    border: none;
                }
            </style>
            <title>Csound Manual</title>
        </head>
        <body>
            <iframe src="https://csound.com/manual/"></iframe>
        </body>
        </html>
        `;
};
