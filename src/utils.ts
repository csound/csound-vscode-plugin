"use strict";

import * as vscode from "vscode";

const starts = [
    [/^\s*instr/, "instr"],
    [/^\s*endin/, "endin"],
    [/^\s*opcode/, "opcode"],
    [/^\s*endop/, "endop"],
];
const startsWithOneOfThese = function (txt:vscode.TextLine) {
    for (let i = 0; i < starts.length; i++) {
        if (txt.text.match(starts[i][0]) !== null) {
            return starts[i][1] as string;
        }
    }
    return null;
};

const findLineWithBlock = function (document:vscode.TextDocument, start:number, direction:number, limit:number):[number, string] {
    for (let i = start; i !== limit; i += direction) {
        let find = startsWithOneOfThese(document.lineAt(i));
        if (find !== null) {
            return [i, find];
        }
    }
    return [-1,""];
};

export const getEvalText = function (document:vscode.TextDocument, selection:vscode.Selection) {
    let text = document.getText(selection);
    let from = selection.start;
    let to = selection.end;

    if (selection.isEmpty) {
        let prevBlockMark = findLineWithBlock(document, selection.start.line, -1, -1);
        let nextBlockMark = findLineWithBlock(document, selection.start.line, 1, document.lineCount);

        if (
            prevBlockMark !== null &&
            nextBlockMark !== null &&
            ((prevBlockMark[1] === "instr" && nextBlockMark[1] === "endin") ||
                (prevBlockMark[1] === "opcode" && nextBlockMark[1] === "endop"))
        ) {
            from = document.lineAt(prevBlockMark[0]).range.start;
            to = document.lineAt(nextBlockMark[0]).range.end;
            text = document.getText(new vscode.Range(from, to));
        } else {
            const line = document.lineAt(selection.active);
            from = line.range.start;
            to = line.range.end;
            text = document.getText(line.range);
        }
    }
    return { text, from, to };
};


export const getScoEvalText = function (document:vscode.TextDocument, selection:vscode.Selection) {
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

export const flash = function (textEditor:vscode.TextEditor, range:vscode.Range) {
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