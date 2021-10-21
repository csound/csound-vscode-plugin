// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	const notYetImplementedForWeb = () => {
		vscode.window.showInformationMessage("This command has not yet been reimplemented for the web.");
	};

    class GoDocumentFormatter implements vscode.DocumentFormattingEditProvider {
        public provideDocumentFormattingEdits(document: vscode.TextDocument):
            Thenable<vscode.TextEdit[]> {
        return Promise.resolve([]);
        }
    }
    

    // play command
    const playCommand = vscode.commands.registerTextEditorCommand(
        'extension.csoundPlayActiveDocument', notYetImplementedForWeb
        );
    context.subscriptions.push(playCommand);

    const killCommand = vscode.commands.registerTextEditorCommand(
        'extension.csoundKillCsoundProcess',
        notYetImplementedForWeb);
    context.subscriptions.push(killCommand);

    const evalOrcCommand = vscode.commands.registerTextEditorCommand(
        'extension.csoundEvalOrc',
        notYetImplementedForWeb);
    context.subscriptions.push(evalOrcCommand);

    const evalScoCommand = vscode.commands.registerTextEditorCommand(
        'extension.csoundEvalSco',
        notYetImplementedForWeb);
    context.subscriptions.push(evalScoCommand);

    const formatCommand = vscode.languages.registerDocumentFormattingEditProvider(
        'extension.csoundFormat', new GoDocumentFormatter());

    context.subscriptions.push(formatCommand);
}

// this method is called when your extension is deactivated
export function deactivate() {}
