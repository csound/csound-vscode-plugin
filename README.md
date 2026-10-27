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

* Play the file in the currently-active editor window by choosing `Csound: Run Active Document`
 from the command palette or using the `alt+.` shortcut. A `.orc` or `.sco` file is played together with the file with the same name and the opposite extension. To stop a playing Csound, choose
 `Csound: Stop Running Csound` from the command palette or use the `alt+escape` shortcut
 while the focus is still in a Csound text editor window (or, on the web, in the Csound WebAudio panel).

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

* Web: nothing to install. Csound runs in the browser in the `Csound WebAudio` panel of the Explorer, and the language features run in a bundled web version of the language server.

## Live Coding

Live coding with csound-vscode-plugin requires Csound to use UDP server mode listening to the port given in settings (by default, port 10000). Csound itself must be configured to listen to the matching port that the plugin will use. This can be done per-project by adding `--port=10000` to the CsOptions of the project's CSD, or done for every project by adding the above flag to the `csound.playArgs` settings. (Caution: Unless all of your Csound work is live coding, adding the --port flag may cause your project to run indefinitely if the project was not designed for live coding.)

## Extension Settings

| setting                     | default       | description                                                                                                                                 |
| --------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `csound.executable`         | `"csound"`    | The Csound executable. The default value of `csound` will run the system wide Csound. If you wish to use another Csound executable you can do so by passing an updated path, or browsing for a Csound executable from the Command palette. |
| `csound.playArgs`           | `[ "-odac" ]` | Arguments to give to Csound when used for playing the current file.<br /> An array of strings, each element an argument including the leading dash. |
| `csound.saveSilentlyOnPlay` | `false`       | Save without prompting before playing or rendering the current file. Choosing "Always silently save before playing" in the prompt sets it. |
| `csound.UDPAddress`         | `127.0.0.1`   | Address to send live coding evaluations over UDP. |
| `csound.UDPPort`            | `10000`       | Port to send live coding evaluations over UDP. |
| `csound.htmlFilePath`       | `""`          | No longer used: the manual is now bundled with the language server. |

## Known Issues

* Rendering to an audio file and selecting the Csound executable are not available in the web extension.

## Release Notes

### Unreleased

* New language support built on the [Csound Language Server](https://github.com/PasqualeMainolfi/csound-lsp) and the [Csound Tree-sitter grammar](https://github.com/PasqualeMainolfi/tree-sitter-csound): syntax-tree based highlighting, diagnostics, completion, hover, formatting and CodeLens, on desktop and web.
* Offline Csound manual inside VS Code on desktop.
* Highlighting of Python, HTML, Cabbage JSON and CsTest TOML embedded in CSD files.
* The language server is downloaded and updated automatically; an installed version keeps working offline.
* One command per action on desktop and web; new command IDs (`csound.runFile`, `csound.stopExecution`, `csound.openManual`, `csound.saveAsAudioFile`), with the previous IDs kept as aliases.
* New `Csound: Save As Audio File` command (`alt+s`).
* Requires VS Code 1.82 or later.

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
