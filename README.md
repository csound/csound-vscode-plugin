<!-- markdownlint-disable MD033 -->
# csound-vscode-plugin

A Csound language plugin for Visual Studio Code.

Language support is provided by the [Csound Language Server](https://github.com/PasqualeMainolfi/csound-lsp), built on the [Csound Tree-sitter grammar](https://github.com/PasqualeMainolfi/tree-sitter-csound), and is compatible with Csound 7. The plugin runs both as a desktop extension and as a web extension (vscode.dev, github.dev), where Csound plays in the browser through WebAudio.

## Features

csound-vscode-plugin currently provides:

* Syntax highlighting for Csound `.csd`, `.orc`, `.sco`, `.udo` and `.instr` files, based on the syntax tree, including code embedded in a CSD: Python, HTML, Cabbage JSON and CsTest TOML

* Diagnostics as you type: unknown opcodes, undefined and unused variables, labels and macros, and syntax errors, with scoping aware of instruments, UDOs, score blocks and globals

* Opcode completion with popup hints for opcode arguments, plus completion for command-line flags and macros

* Show opcode documentation in the editor: hover over a built-in opcode (Cabbage opcodes included), a user-defined opcode or a user-defined type

* Open the Csound manual by choosing `Csound: Open Csound Manual` from the command palette or using the `alt+m` shortcut. On desktop the HTML manual bundled with the language server is shown inside VS Code and works offline; on the web the online manual is opened.

* Play the active document with `Csound: Run Active Document` or `alt+.`. Desktop playback supports CSD files and matching `.orc`/`.sco` pairs; browser playback starts a `.csd`. Stop with `Csound: Stop Running Csound` or `alt+escape` while a Csound editor has focus, or whenever browser playback is active or pending.

* A compact browser player in the bottom Panel, with Run, Pause/Resume, Stop, and Show Output toolbar actions, plus editor toolbar actions and a playback status-bar item. The engine stays alive when the player is hidden or collapsed, and later Runs preserve editor focus.

* Render the active document to `<name>.wav`, next to the file, with `Csound: Save As Audio File` or `alt+s` (desktop only)

* Evaluate code at runtime (live coding) using `Csound: Evaluate Orchestra Code` or `ctrl+enter` (`cmd+enter` on macOS) for ORC code and `Csound: Evaluate Score Code` for SCO code.

* Indentation as you type (desktop) and `Format Document` (web). Raw strings (`{{ }}`, `R{ }R`) and embedded code are left untouched.

* CodeLens at the top of each file (Manual, Run, Stop, To Audio File) and a `Csound actions` menu in the status bar (desktop)

* A CSD template: type `barebone` to insert it

### Commands

| command | shortcut | available on |
| ------- | -------- | ------------ |
| `Csound: Run Active Document` | `alt+.` | desktop, web |
| `Csound: Stop Running Csound` | `alt+escape` | desktop, web |
| `Csound: Pause or Resume` | | web |
| `Csound: Show Player` | | web |
| `Csound: Show Output` | | web |
| `Csound: Save As Audio File` | `alt+s` | desktop |
| `Csound: Open Csound Manual` | `alt+m` | desktop, web |
| `Csound: Evaluate Orchestra Code` | `ctrl+enter` / `cmd+enter` | desktop, web |
| `Csound: Evaluate Score Code` | | desktop, web |
| `Csound: Browse for Csound executable` | | desktop |

Keybindings bound to the previous command IDs (`extension.csoundPlayActiveDocument`, `extension.csoundKillCsoundProcess`, `extension.showOpcodeReference`) keep working.

## Requirements

* VS Code 1.82 or later.

* Desktop: you must have Csound properly configured on your system so you can use it on the command line, or set its path with `csound.executable`.
  On first start the plugin offers to download the Csound Language Server for your platform (Windows x86_64, Linux x86_64, macOS x86_64 and arm64) from its [GitHub releases](https://github.com/PasqualeMainolfi/csound-lsp/releases), and it offers updates when a new release is out. Without a network connection the installed version is used. Commands keep working without the language server.

* Web: nothing to install. Csound runs in the browser in the retained `Csound` player in the bottom Panel, and the language features run in a bundled web version of the language server.

## Browser Playback

Run a `.csd` with `alt+.` or the editor's Run action. If the browser requires audio activation, click **Enable Audio & Play** in the Csound player; the pending document then plays automatically. Suspended audio resumes automatically when browser policy permits, with another activation click requested only when needed. Later Runs preserve editor focus. The player can be collapsed or hidden while audio runs. Its toolbar provides Pause/Resume, Stop, and Show Output; `alt+escape` stops an active or pending performance even outside a Csound editor.

The browser engine and its project files stay alive between Runs. The initial Run mirrors regular files in the document's workspace folder, including binary samples; later Runs send only changed content. `.git` and `node_modules` are excluded. Open dirty source documents use editor contents. Files changed during playback are applied on the next Run; Evaluate Orchestra/Score sends code to the current performance, with the same block selection and visual feedback as desktop.

Use `csound.web.projectRoot` (default `.`), relative to the owning workspace folder, to limit synchronization to a smaller project. The CSD and its includes/samples must be within that root. Relative paths resolve from the CSD directory. One project is mirrored at a time; generated runtime files are retained between Runs within that project and are never written back automatically. Removing the player or reloading the window ends the runtime; Run again to reconnect. A restarted runtime receives a fresh copy of the project, including unchanged includes and samples. Simply hiding or collapsing the player keeps the current runtime alive.

Browser Run starts CSD documents. Use Evaluate Orchestra/Score for standalone `.orc`/`.sco` code after starting a CSD. Initial asset synchronization still consumes memory; it is not a direct mount or a zero-copy filesystem. The Output channel reports synchronization file counts, total project size, transferred bytes, and duration. Successful Runs do not automatically reveal Output; choose **Show Output** to inspect it. Providers without file timestamps require content comparisons on subsequent Runs.

## Live Coding

On desktop, live coding requires Csound to use UDP server mode listening to the port given in settings (by default, port 10000). Csound itself must be configured to listen to the matching port that the plugin will use. This can be done per-project by adding `--port=10000` to the CsOptions of the project's CSD, or done for every project by adding the above flag to the `csound.playArgs` settings. (Caution: Unless all of your Csound work is live coding, adding the --port flag may cause your project to run indefinitely if the project was not designed for live coding.)

In the browser, start a CSD and evaluate `.orc` or `.sco` code directly in the running engine; no UDP server is needed. An explicit selection is evaluated as written. With no selection, orchestra evaluation finds the surrounding `instr ... endin` or `opcode ... endop` block, falling back to the current line; score evaluation uses the current line. Code sent for evaluation is briefly highlighted on both desktop and web.

## Extension Settings

| setting                     | default       | description                                                                                                                                 |
| --------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `csound.executable`         | `"csound"`    | The Csound executable. The default value of `csound` will run the system wide Csound. If you wish to use another Csound executable you can do so by passing an updated path, or browsing for a Csound executable from the Command palette. |
| `csound.playArgs`           | `[ "-odac" ]` | Arguments to give to Csound when used for playing the current file.<br /> An array of strings, each element an argument including the leading dash. |
| `csound.saveSilentlyOnPlay` | `false`       | Save without prompting before playing or rendering the current file. Choosing "Always silently save before playing" in the prompt sets it. |
| `csound.UDPAddress`         | `127.0.0.1`   | Address to send desktop live coding evaluations over UDP. |
| `csound.UDPPort`            | `10000`       | Port to send desktop live coding evaluations over UDP. |
| `csound.web.projectRoot` | `"."` | Browser project directory relative to the owning workspace folder. The CSD, includes, and samples must be inside this directory. |

## Known Issues

* Rendering to an audio file and selecting the Csound executable are not available in the web extension.

## Development Checks

Run `npm run test-web-playback` for playback ordering, cancellation, project synchronization, and shared live-coding checks. These checks also run as part of `npm test` preparation.

For a browser runtime smoke test, run `npm run package-web`, serve the repository with `python3 -m http.server 8000 --bind 127.0.0.1`, and open the [runtime smoke test](http://127.0.0.1:8000/scripts/test-web-runtime.html). Click **Enable Audio & Play** if prompted. The silent test exercises parent includes, WAV samples, switching documents during playback, paused Stop, reuse after reset, and runtime cleanup. This harness checks the browser runtime; view lifetime, native toolbars, and focus behavior also need testing inside VS Code.

## Release Notes

### 0.9.0

* Replace the browser engine controls with a compact, retained Csound player in the bottom Panel, plus editor and player toolbar actions and a playback status-bar item.
* Add browser Pause/Resume and Show Output commands. Keep editor focus on later Runs and allow Stop to cancel an active or pending performance from outside a Csound editor.
* Reuse the browser engine and synchronize changed project files between Runs, including binary samples and unsaved source buffers. Add `csound.web.projectRoot` to scope synchronization to a project directory.
* Preserve relative include and sample paths, handle file additions and deletions, and resynchronize the project when the audio runtime restarts. Resume suspended audio automatically when browser policy permits.
* Order browser playback operations, make the latest pending Run replace earlier requests, and use the same Stop operation for toolbar and keyboard actions, including while paused.
* Share live-coding block selection and visual feedback between desktop and web. Browser playback commands remain available if language-server initialization fails.
* Update WebAudio Csound (`@csound/browser`) to 7.0.0 and add playback, synchronization, and document-switching regression checks.

### 0.8.0

* Add desktop and web language support built on the Csound Language Server and Tree-sitter grammar, including syntax-tree highlighting, diagnostics, completion, hover, formatting and CodeLens.
* Highlight Python, HTML, Cabbage JSON and CsTest TOML embedded in CSD files.
* Download and update the language server automatically; an installed version continues to work offline.
* Show the bundled Csound manual offline on desktop and open the online manual on web.
* Use one command ID per action across desktop and web (`csound.runFile`, `csound.stopExecution`, `csound.openManual`, `csound.saveAsAudioFile`); keep the previous IDs as aliases.
* Add `Csound: Save As Audio File` (`alt+s`) on desktop.
* Require VS Code 1.82 or later; remove `csound.htmlFilePath` because the manual is bundled with the language server.

### 0.7.0

* Initial implementation of in-browser rendering with WebAudio Csound when installed as a web extension.

### 0.6.6

* Fixes release issue with 0.6.5

### 0.6.5

* Adds Cabbage opcodes
* Adds "Csound: Browse for Csound Executable Command" to set the path to the
  Csound executable using file selector dialog.
* Removes type prefix colouring as it makes things look odd in Csound 7

### 0.6.4

* Adds support for autocomplete for variables by document

### 0.6.3

* Adds support for embedded JSON support for Cabbage section of CSDs

### 0.6.2

* Enable opcode completion and hints for web extension

### 0.6.1

* Fix import of opcodes.json

### 0.6.0

* Adds support for autocomplete, popup hints for opcode arguments, and showing opcode documentation in the editor.

### 0.5.2

* Adds .instr as file extension for ORC syntax highlighting

### 0.5.1

* Adds support for folding for #region / #endregion comments

* Updated README for information on using --port=10000 flag for live coding

### 0.5.0

* Can now play from ORC/SCO pair, associating to the file from the currently-active editor window a file contained in the same folder with the same name but opposite extension.

* Added CSD barebone as snippet, use the keyword `barebone` to insert the template code in your CSD file.

### 0.4.0

* Updated to vscode 1.60 extension format to work as a Desktop and Web extension. (Play commands currently disabled until WebAudio Csound can be integrated.)

### 0.3.1

* Updated opcode entries to 6.15.0 (synced to Nate Whetsell's Atom language-csound plugin)

### 0.3.0

* Added live-coding commands to evaluate ORC and SCO code by sending to Csound over UDP.

### 0.2.3

* Don't switch focus to output window when playing a CSD file. `alt+escape` only kills Csound subprocesses when focus is in a CSD text editor window (for better compatibility with other modules).

### 0.2.2

* Fix issue when attempting to kill when there are no Csound subprocesses running.

### 0.2.1

* Add command to kill any running Csound subprocess. Kill any Csound process on exiting from VSCode.

### 0.2.0

* Added the ability to play CSD files from within VSCode.

### 0.0.1

* Alpha: initial release
