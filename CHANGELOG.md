# Change Log

All notable changes to the "csound-vscode-plugin" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## Next

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
## 0.3.0

* Added live-coding commands to evaluate ORC and SCO code by sending to Csound over UDP. 

## 0.2.3

* Playing the contents of the CSD text editor doesn't shift focus to the output window.
* `alt+escape` to kill CSound processes only works when focus is in a CSD text editor window (to increase
  compatibility with other modules).

## 0.2.2

* Fixed to prevent error when running kill command with no Csound subprocesses.

## 0.2.1

* Add command to kill any running Csound subprocess. Kill any Csound process on exiting from VSCode.

## 0.2.0

* Implemented the ability to play the CSD file in the currently-active editor window from within VSCode.

## 0.0.3

* Updated to use converted version of Nate Whetsell's language-csound Atom plugin.  

## 0.0.2, 0.0.1

* Initial release
