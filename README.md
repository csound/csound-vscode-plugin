<!-- markdownlint-disable MD033 -->
# csound-vscode-plugin

A Csound language plugin for Visual Studio Code.

## Features

csound-vscode-plugin currently provides:

* Syntax Highlighting for Csound .orc and .udo files

* Opcode completion with popup hints for opcode arguments

* Show opcode documentation in the editor

* Play the file in the currently-active editor window by choosing `Csound: Play Active Document`
 from the command palette or using the `alt+.` shortcut. To kill a playing Csound subprocess, choose
 `Csound: Terminate any running csound subprocess` from the command palette or use the `alt+escape` shortcut
 while the focus is still in a Csound text editor window.

 * Evaluate code at runtime (live coding) using `Csound: Evaluate Orchestra Code` or `ctrl+enter` (`cmd+enter` on macOS) for ORC code and `Csound: Evaluate Score Code` for SCO code. 

## Requirements

You must have Csound properly configured on your system so you can use it on the command line.

## Live Coding

Live coding with csound-vscode-plugin requires Csound to use UDP server mode listening to the port given in settings (by default, port 10000). Csound itself must be configured to listen to the matching port that the plugin will use. This can be done per-project by adding `--port=10000` to the CsOptions of the project's CSD, or done for every project by adding the above flag to the `csound.playArgs` settings. (Caution: Unless all of your Csound work is live coding, adding the --port flag may cause your project to run indefinitely if the project was not designed for live coding.)

## Extension Settings

| setting                     | default       | description                                                                                                                                 |
| --------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `csound.executable`         | `"csound"`    | The Csound executable. The default value of `csound` will run the system wide Csound. If you wish to use another Csound executable you can do so by passing an updated path, or browsing for a Csound executable from the Command palette.                                                                                                                        |
| `csound.playArgs`           | `[ "-odac" ]` | Arguments to give to Csound when used for playing the current file.<br /> An array of strings, each element an argument including the leading dash. |
| `csound.saveSilentlyOnPlay` | `false`       | Save without prompting before playing the current file.                                                                                     |
| `csound.UDPAddress` | `127.0.0.1`       | Address to send live coding evaluations over UDP.                                                                                     |
| `csound.UDPPort` | `10000`       |  Port to send live coding evaluations over UDP.                                                                                    |
| `csound.htmlFilePath` | `""`       |  Csound manual root directory on local file system for loading opcode documentation. If empty, defaults to C:\\Program Files\\Csound6_x64\\doc\\manual on Windows, and /Library/Frameworks/CsoundLib64.framework/Versions/6.0/Resources/Manual on macOS. |

## Known Issues

None.

## Release Notes

## 0.6.6

* Fixes release issue with 0.6.5

## 0.6.5

* Adds Cabbage opcodes 
* Adds "Csound: Browse for Csound Executable Command" to set the path to the
  Csound executable using file selector dialog.
* Removes type prefix colouring as it makes things look odd in Csound 7

## 0.6.4

* Adds support for autocomplete for variables by document 

## 0.6.3

* Adds support for embedded JSON support for Cabbage section of CSDs 

## 0.6.2

* Enable opcode completion and hints for web extension 

## 0.6.1

* Fix import of opcodes.json

## 0.6.0

* Adds support for autocomplete, popup hints for opcode arguments, and showing opcode documentation in the editor.

## 0.5.2 

* Adds .instr as file extension for ORC syntax highlighting

## 0.5.1 

* Adds support for folding for #region / #endregion comments 

* Updated README for information on using --port=10000 flag for live coding

## 0.5.0
* Can now play from ORC/SCO pair, associating to the file from the currently-active editor window a file contained in the same folder with the same name but opposite extension.

* Added CSD barebone as snippet, use the keyword `barebone` to insert the template code in your CSD file. 

## 0.4.0

* Updated to vscode 1.60 extension format to work as a Desktop and Web extension. (Play commands currently disabled until WebAudio Csound can be integrated.)

## 0.3.1

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
