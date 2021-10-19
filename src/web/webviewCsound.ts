import * as vscode from "vscode";

export class CsoundWebviewViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "csound.webviewCsound";
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext<unknown>,
    token: vscode.CancellationToken
  ): void | Thenable<void> {
    this._view = webviewView;

    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,

      // localResourceRoots: [
      // 	// this._extensionUri
      // ]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((data) => {
      //   switch (
      //     data.type
      //     // case 'colorSelected':
      //     // 	{
      //     // 		vscode.window.activeTextEditor?.insertSnippet(new vscode.SnippetString(`#${data.value}`));
      //     // 		break;
      //     // 	}
      //   ) {
      //   }
    });
  }

  public start() {
    if (this._view) {
      this._view.show?.(true); // `show` is not implemented in 1.49 but is for 1.50 insiders
      this._view.webview.postMessage({ type: "start" });
    }
  }

  public evalOrc(orcCode: string) {
    if (this._view) {
      this._view.show?.(true); // `show` is not implemented in 1.49 but is for 1.50 insiders
      this._view.webview.postMessage({ type: "evalOrc", data: orcCode });
    }
  }

  public stop() {}

  private _getHtmlForWebview(webview: vscode.Webview) {
    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));

    // // Do the same for the stylesheet.
    // const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css'));
    // const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
    // const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));

    // // Use a nonce to only allow a specific script to be run.
    // const nonce = getNonce();

    return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Csound</title>
			</head>
			<body>
            WebAudio Csound 
			</body>
            <script type="module" src="${scriptUri}"></script>
			</html>`;
  }
}

// export const createWebviewCsoundPanel = () => {
//     const panel = vscode.window.createWebviewPanel(
//         'webviewCsound',
//         'Csound Processes',
//         vscode.ViewColumn.One,
//         { retainContextWhenHidden: true}
//     );

//     // Get path to resource on disk
//     //   const onDiskPath = vscode.Uri.file(
//     //     path.join(context.extensionPath, 'media', 'cat.gif')
//     //   );

//     // And set its HTML content
//     panel.webview.html = `
//     <html>
//     <body>
//     Webview Csound Test
//     </body>
//     </html>
//     `;
//     return panel;
// }
