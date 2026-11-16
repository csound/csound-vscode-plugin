import { ListedOpcodes, csoundVersionName, groupListedOpcodes } from './utils';
import { loadCsoundBrowser } from './loadCsoundBrowser';

export interface BrowserCsoundOpcodes {
    source: string,
    opcodes: ListedOpcodes
}

// Lists the opcodes of the Csound that plays the code in the browser (@csound/browser), so that
// the web server knows exactly what can run, following the engine version with no file to update.
// The engine is loaded in its own chunk, after the server has started.
export async function listBrowserCsoundOpcodes(): Promise<BrowserCsoundOpcodes> {
    // Outside an AudioWorklet the bundle decodes its wasm with window.atob, and a worker only has self.
    // `window` is defined only while Csound loads, so that other modules keep seeing a worker.
    const scope = self as any;
    const addedWindow = scope.window === undefined;
    if (addedWindow) { scope.window = scope; }

    try {
        const { libcsound } = await loadCsoundBrowser();
        const lib = await libcsound();
        const csound = lib.csoundCreate();
        const factory = lib.csoundUgenFactoryNew(csound);
        try {
            return {
                source: csoundVersionName(lib.csoundGetVersion()),
                opcodes: groupListedOpcodes(lib.csoundUgenListOpcodes(factory))
            };
        } finally {
            lib.csoundUgenFactoryDelete(factory);
            lib.csoundDestroy(csound);
        }
    } finally {
        if (addedWindow) { delete scope.window; }
    }
}
