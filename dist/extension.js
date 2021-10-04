/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ([
/* 0 */,
/* 1 */
/***/ ((module) => {

module.exports = require("vscode");

/***/ }),
/* 2 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.evalSco = exports.evalOrc = exports.killCsoundProcess = exports.playActiveDocument = void 0;
const path = __webpack_require__(3);
const cp = __webpack_require__(4);
const vscode = __webpack_require__(1);
const dgram = __webpack_require__(5);
const utils_1 = __webpack_require__(6);
const socket = dgram.createSocket("udp4");
let output;
const processMap = {};
async function playActiveDocument(textEditor) {
    const config = vscode.workspace.getConfiguration("csound");
    const document = textEditor.document;
    // Currently only play csd files.
    // We need to figure out how to find matching .sco for .orc
    // (or .orc for .sco) before we can play those.
    if (document.languageId !== "csound-csd") {
        return;
    }
    if (document.isDirty) {
        if (!config.get("saveSilentlyOnPlay")) {
            const selection = await saveToPlayDialog();
            if (selection === "Cancel") {
                return;
            }
        }
        await document.save();
    }
    if (output === undefined) {
        output = vscode.window.createOutputChannel("Csound output");
    }
    const command = config.get("executable", "csound");
    // We need to clone the args array because if we don't, when we push the filename on, it
    // will actually go into the config in memory, and be in the args of our next syntax check.
    const args = [...config.get("playArgs", [])];
    args.push(document.fileName);
    const options = { cwd: path.dirname(document.fileName) };
    output.clear();
    output.show(true); // true means keep focus in the editor window
    const process = cp.spawn(command, args, options);
    processMap[process.pid] = process;
    process.stdout.on("data", (data) => {
        // I've seen spurious 'ANSI reset color' sequences in some csound output
        // which doesn't render correctly in this context. Stripping that out here.
        output.append(data.toString().replace(/\x1b\[m/g, ""));
    });
    process.stderr.on("data", (data) => {
        // It looks like all csound output is written to stderr, actually.
        // If you want your changes to show up, change this one.
        output.append(data.toString().replace(/\x1b\[m/g, ""));
    });
    if (process.pid) {
        console.log("Csound is playing (pid " + process.pid + ")");
    }
}
exports.playActiveDocument = playActiveDocument;
async function saveToPlayDialog() {
    const selected = await vscode.window
        .showInformationMessage("Save file for Csound to play?", { modal: true }, { title: "Cancel", isCloseAffordance: true }, { title: "Save", isCloseAffordance: false }, {
        title: "Always silently save before playing",
        isCloseAffordance: false,
    })
        .then((selected) => {
        if (selected) {
            if (selected.title === "Always silently save before playing") {
                setSaveSilentlyOnPlay();
                return "Save";
            }
            else {
                return selected.title;
            }
        }
        else {
            return "Cancel";
        }
    });
    return selected || "Cancel";
}
async function setSaveSilentlyOnPlay() {
    const config = vscode.workspace.getConfiguration("csound");
    config.update("saveSilentlyOnPlay", "true", true);
}
function killCsoundProcess() {
    for (let pid in processMap) {
        let p = processMap[pid];
        if (p === undefined) {
            delete processMap[pid];
        }
        else {
            console.log("Killing Csound process (pid " + p.pid + ")");
            p.kill("SIGTERM");
            console.log("Csound subprocess terminated");
        }
    }
}
exports.killCsoundProcess = killCsoundProcess;
async function evalOrc(textEditor) {
    const config = vscode.workspace.getConfiguration("csound");
    const port = config.get("UDPPort");
    const address = config.get("UDPAddress");
    const document = textEditor.document;
    const selection = textEditor.selection;
    const { text, from, to } = (0, utils_1.getEvalText)(document, selection);
    socket.send(text, port, address);
    (0, utils_1.flash)(textEditor, new vscode.Range(from, to));
}
exports.evalOrc = evalOrc;
async function evalSco(textEditor) {
    const config = vscode.workspace.getConfiguration("csound");
    const port = config.get("UDPPort");
    const address = config.get("UDPAddress");
    const document = textEditor.document;
    const selection = textEditor.selection;
    const { text, from, to } = (0, utils_1.getScoEvalText)(document, selection);
    socket.send("$" + text, port, address);
    (0, utils_1.flash)(textEditor, new vscode.Range(from, to));
}
exports.evalSco = evalSco;


/***/ }),
/* 3 */
/***/ ((module) => {

module.exports = require("path");

/***/ }),
/* 4 */
/***/ ((module) => {

module.exports = require("child_process");

/***/ }),
/* 5 */
/***/ ((module) => {

module.exports = require("dgram");

/***/ }),
/* 6 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.flash = exports.getScoEvalText = exports.getEvalText = void 0;
const vscode = __webpack_require__(1);
const starts = [
    [/^\s*instr/, "instr"],
    [/^\s*endin/, "endin"],
    [/^\s*opcode/, "opcode"],
    [/^\s*endop/, "endop"],
];
const startsWithOneOfThese = function (txt) {
    for (let i = 0; i < starts.length; i++) {
        if (txt.text.match(starts[i][0]) !== null) {
            return starts[i][1];
        }
    }
    return null;
};
const findLineWithBlock = function (document, start, direction, limit) {
    for (let i = start; i !== limit; i += direction) {
        let find = startsWithOneOfThese(document.lineAt(i));
        if (find !== null) {
            return [i, find];
        }
    }
    return [-1, ""];
};
const getEvalText = function (document, selection) {
    let text = document.getText(selection);
    let from = selection.start;
    let to = selection.end;
    if (selection.isEmpty) {
        let prevBlockMark = findLineWithBlock(document, selection.start.line, -1, -1);
        let nextBlockMark = findLineWithBlock(document, selection.start.line, 1, document.lineCount);
        if (prevBlockMark !== null &&
            nextBlockMark !== null &&
            ((prevBlockMark[1] === "instr" && nextBlockMark[1] === "endin") ||
                (prevBlockMark[1] === "opcode" && nextBlockMark[1] === "endop"))) {
            from = document.lineAt(prevBlockMark[0]).range.start;
            to = document.lineAt(nextBlockMark[0]).range.end;
            text = document.getText(new vscode.Range(from, to));
        }
        else {
            const line = document.lineAt(selection.active);
            from = line.range.start;
            to = line.range.end;
            text = document.getText(line.range);
        }
    }
    return { text, from, to };
};
exports.getEvalText = getEvalText;
const getScoEvalText = function (document, selection) {
    let text = document.getText(selection);
    let from = selection.start;
    let to = selection.end;
    if (selection.isEmpty) {
        const line = document.lineAt(selection.active);
        from = line.range.start;
        to = line.range.end;
        text = document.getText(line.range);
    }
    return { text, from, to };
};
exports.getScoEvalText = getScoEvalText;
const flash = function (textEditor, range) {
    const flashDecorationType = vscode.window.createTextEditorDecorationType({
        light: {
            backgroundColor: 'darkGray'
        },
        dark: {
            backgroundColor: 'rgba(255, 255, 255, 0.5)'
        }
    });
    textEditor.setDecorations(flashDecorationType, [range]);
    setTimeout(function () {
        flashDecorationType.dispose();
    }, 250);
};
exports.flash = flash;


/***/ })
/******/ 	]);
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
var exports = __webpack_exports__;

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.deactivate = exports.activate = void 0;
const vscode = __webpack_require__(1);
const commands = __webpack_require__(2);
function activate(context) {
    // play command
    const playCommand = vscode.commands.registerTextEditorCommand('extension.csoundPlayActiveDocument', commands.playActiveDocument);
    context.subscriptions.push(playCommand);
    const killCommand = vscode.commands.registerTextEditorCommand('extension.csoundKillCsoundProcess', commands.killCsoundProcess);
    context.subscriptions.push(killCommand);
    const evalOrcCommand = vscode.commands.registerTextEditorCommand('extension.csoundEvalOrc', commands.evalOrc);
    context.subscriptions.push(evalOrcCommand);
    const evalScoCommand = vscode.commands.registerTextEditorCommand('extension.csoundEvalSco', commands.evalSco);
    context.subscriptions.push(evalScoCommand);
}
exports.activate = activate;
// this method is called when your extension is deactivated
function deactivate() {
    commands.killCsoundProcess();
}
exports.deactivate = deactivate;

})();

module.exports = __webpack_exports__;
/******/ })()
;
//# sourceMappingURL=extension.js.map