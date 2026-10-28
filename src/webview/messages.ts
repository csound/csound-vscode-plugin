export type PlaybackState = 'Stopped' | 'Preparing' | 'Enable Audio' | 'Playing' | 'Paused' | 'Error';
export type EngineCommand =
    | { command: 'initialize' | 'stop' | 'pause' | 'resume' | 'dispose' }
    | { command: 'begin'; paths: string[]; root: string }
    | { command: 'file'; path: string; bytes: ArrayBuffer; append: boolean }
    | { command: 'start'; path: string }
    | { command: 'eval'; text: string; score: boolean };
export type HostMessage = { session: string; intent: number } &
    ({ command: 'cancel' } | (EngineCommand & { id: number }));
export type EngineEvent = (
    | { type: 'ready' | 'audioReady' }
    | { type: 'reply'; id: number; value?: boolean; error?: string }
    | { type: 'state'; intent: number; state: PlaybackState }
    | { type: 'output'; text: string }
);

export type EngineMessage = EngineEvent & { session: string };
