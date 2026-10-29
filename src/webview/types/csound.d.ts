import '@csound/browser';
// These methods are implemented by the WASI wrapper but omitted from 7.0.0's declarations.
declare module '@csound/browser' {
    interface CsoundFs {
        chdir(path: string): Promise<number>;
        getcwd(): Promise<string>;
    }
}
