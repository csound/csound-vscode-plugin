<!-- markdownlint-disable MD033 -->
# csound-vscode-plugin

A Csound language plugin for Visual Studio Code.

## Features

Program currently provides:

* Syntax Highlighting for Csound .orc and .udo files

* Play the CSD file in the currently-active editor window by choosing `Csound: Play Active CSD Document` from the command palette or using the `Alt+.` shortcut.

## Requirements

You must have Csound properly configured on your system so you can use it on the comand line.

## Extension Settings

| setting                     | default       | description                                                                                                                                 |
| --------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `csound.executable`         | `"csound"`    | The csound executable                                                                                                                       |
| csound.playArgs             | `[ "-odac" ]` | Arguments to csound when used for playing the current file.<br /> An array of strings, each element an argument including the leading dash. |
| `csound.saveSilentlyOnPlay` | `false`       | Save without prompting before playing the current file.                                                                                     |

## Known Issues

Currently this extension can only play CSD files from the currently-active editor window. A method of associating the appropriate
ORC to a SCO file (or SCO to an ORC file) will need to be implemented before these are playable inside of VSCode.

## Release Notes

### 0.2.0

Added the ability to play CSD files from within VSCode.

### 0.0.1

Alpha: initial release
