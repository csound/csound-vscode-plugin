// Plain JavaScript on purpose: the TypeScript config compiles to CommonJS, which turns import()
// into require() and would put the whole engine (~5 MB of wasm) inside server.js.
// Here webpack sees the dynamic import and loads @csound/browser as a separate chunk.
export function loadCsoundBrowser() {
    return import(/* webpackChunkName: "csound-browser" */ '@csound/browser');
}
