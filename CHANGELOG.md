# Change Log

All notable changes to the "csound-vscode-plugin" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## Next

## 0.9.0

* Replace the browser engine controls with a compact, retained Csound player in the bottom Panel, plus editor and player toolbar actions and a playback status-bar item.
* Add browser Pause/Resume and Show Output commands. Keep editor focus on later Runs and allow Stop to cancel an active or pending performance from outside a Csound editor.
* Reuse the browser engine and synchronize changed project files between Runs, including binary samples and unsaved source buffers. Add `csound.web.projectRoot` to scope synchronization to a project directory.
* Preserve relative include and sample paths, handle file additions and deletions, and resynchronize the project when the audio runtime restarts. Resume suspended audio automatically when browser policy permits.
* Order browser playback operations, make the latest pending Run replace earlier requests, and use the same Stop operation for toolbar and keyboard actions, including while paused.
* Share live-coding block selection and visual feedback between desktop and web. Browser playback commands remain available if language-server initialization fails.
* Update WebAudio Csound (`@csound/browser`) to 7.0.0 and add playback, synchronization, and document-switching regression checks.

## 0.8.0

* Add desktop and web language support built on the Csound Language Server and Tree-sitter grammar, including syntax-tree highlighting, diagnostics, completion, hover, formatting and CodeLens.
* Highlight Python, HTML, Cabbage JSON and CsTest TOML embedded in CSD files.
* Download and update the language server automatically; an installed version continues to work offline.
* Show the bundled Csound manual offline on desktop and open the online manual on web.
* Use one command ID per action across desktop and web (`csound.runFile`, `csound.stopExecution`, `csound.openManual`, `csound.saveAsAudioFile`); keep the previous IDs as aliases.
* Add `Csound: Save As Audio File` (`alt+s`) on desktop.
* Require VS Code 1.82 or later; remove `csound.htmlFilePath` because the manual is bundled with the language server.

## 0.7.0

* Initial implementation of in-browser rendering with WebAudio Csound when installed as a web extension

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
