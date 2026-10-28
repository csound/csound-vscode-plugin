import * as assert from 'assert';
import * as vscode from 'vscode';
import { getEvalText, getScoEvalText } from '../../../liveCoding';

suite('Browser live coding', () => {
    for (const [open, close] of [['instr 1', 'endin'], ['opcode Example, a, k', 'endop']]) {
        test(`empty selection evaluates a complete ${open.split(' ')[0]} block`, async () => {
            const content = `${open}\n  a1 oscili 0.1, 440\n${close}\n`;
            const document = await vscode.workspace.openTextDocument({content, language: 'plaintext'});
            const selection = new vscode.Selection(1, 3, 1, 3);
            const result = getEvalText(document, selection);
            assert.strictEqual(result.text, content.trimEnd());
            assert.strictEqual(result.from.line, 0);
            assert.strictEqual(result.to.line, 2);
        });
    }
    test('score evaluation uses the current line and explicit selections win', async () => {
        const document = await vscode.workspace.openTextDocument({content: 'i 1 0 1\ni 2 1 2', language: 'plaintext'});
        assert.strictEqual(getScoEvalText(document, new vscode.Selection(1, 0, 1, 0)).text, 'i 2 1 2');
        const selection = new vscode.Selection(0, 0, 1, 7);
        assert.strictEqual(getEvalText(document, selection).text, document.getText(selection));
    });
});
