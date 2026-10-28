import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Command visibility', () => {
    test('native commands follow the selected host and remain discoverable before desktop activation', () => {
        const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'));
        const scenarios: [string, boolean, string | undefined, boolean][] = [
            ['desktop before activation', false, undefined, true],
            ['browser before activation', true, undefined, false],
            ['native desktop host', false, 'native', true],
            ['native host with browser UI', true, 'native', true],
            ['web host with desktop UI', false, 'web', false],
            ['web host with browser UI', true, 'web', false],
        ];

        for (const command of ['csound.saveAsAudioFile', 'extension.csoundSelectExecutable']) {
            const { when } = manifest.contributes.menus.commandPalette.find((item: { command: string }) => item.command === command);
            // These clauses use JS-compatible operators; native/web are string values in VS Code.
            const visible = new Function('csound', 'isWeb', 'native', 'web', `return ${when};`);
            for (const [name, isWeb, host, expected] of scenarios) {
                assert.strictEqual(visible({ host }, isWeb, 'native', 'web'), expected, `${command}: ${name}`);
            }
        }
    });
});
