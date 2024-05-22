<!-- markdownlint-disable MD033 -->
# csound-vscode-plugin

A Csound language plugin for Visual Studio Code.

## Features

Program currently provides:

* Syntax Highlighting for Csound .orc and .udo files

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
| `csound.executable`         | `"csound"`    | The Csound executable                                                                                                                       |
| `csound.playArgs`           | `[ "-odac" ]` | Arguments to give to Csound when used for playing the current file.<br /> An array of strings, each element an argument including the leading dash. |
| `csound.saveSilentlyOnPlay` | `false`       | Save without prompting before playing the current file.                                                                                     |
| `csound.UDPAddress` | `127.0.0.1`       | Address to send live coding evaluations over UDP.                                                                                     |
| `csound.UDPPort` | `10000`       |  Port to send live coding evaluations over UDP.                                                                                    |

## Known Issues

None.

## Release Notes

## Next

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
