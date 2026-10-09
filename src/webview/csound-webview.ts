// This script runs in the WebView context and has access to the browser APIs
// including WebAudio, which is what we need for @csound/browser

import { Csound } from '@csound/browser';

// Define CsoundObj interface locally since it's not exported

// DOM type declarations for webview context
declare const acquireVsCodeApi: any;
declare const document: any;
declare const window: any;

class CsoundWebView {
    private vscode: any;
    private csound?: any;
    private audioContext?: any;
    private isInitialized = false;
    private isAudioRunning = false;
    private isCsoundPlaying = false;

    constructor() {
        this.vscode = acquireVsCodeApi();
        this.setupUI();
        this.setupMessageListener();
        this.loadCsound();
    }

    private async loadCsound() {
        try {
            this.updateAudioStatus('Not Started');
            this.updatePauseResumeButton('Start');
            this.setAudioPauseButtonEnabled(true);
            this.setCsoundControlsEnabled(false);
            this.logOutput('Csound module loaded, ready to start audio context');
        } catch (error) {
            this.updateAudioStatus('Failed to load');
            this.logError(`Failed to load @csound/browser: ${error}`);
        }
    }

    private setupUI() {
        const pauseResumeButton = document.getElementById('pauseResumeButton') as any;
        const csoundPauseButton = document.getElementById('csoundPauseButton') as any;
        const csoundStopButton = document.getElementById('csoundStopButton') as any;

        pauseResumeButton?.addEventListener('click', async () => {
            if (!this.isInitialized) {
                await this.initializeCsound();
                return;
            }
            await this.toggleAudioContext();
        });

        csoundPauseButton?.addEventListener('click', () => this.toggleCsoundPause());
        csoundStopButton?.addEventListener('click', () => this.sendCsoundStopEvent());
    }

    private setupMessageListener() {
        window.addEventListener('message', (event: any) => {
            const message = event.data;

            switch (message.command) {
                case 'playCsd':
                    this.playCsd(message.content, message.filename, message.projectFiles);
                    break;
                case 'evalOrc':
                    this.evalOrc(message.content);
                    break;
                case 'evalSco':
                    this.evalSco(message.content);
                    break;
                case 'stop':
                    this.stopCsound();
                    break;
            }
        });
    }

    private async initializeCsound() {
        if (this.isInitialized) {
            return;
        }

        this.setAudioPauseButtonEnabled(false);

        try {
            this.updateAudioStatus('Starting...');

            // Lazily create shared AudioContext
            if (!this.audioContext) {
                this.logOutput('Creating shared AudioContext...');
                const audioCtxCtor = window.AudioContext || (window as any).webkitAudioContext;
                this.audioContext = new audioCtxCtor({ sampleRate: 44100 });
            }

            if (this.audioContext.state === 'suspended') {
                this.logOutput('Resuming suspended AudioContext...');
                await this.audioContext.resume();
            }

            this.logOutput(`AudioContext state: ${this.audioContext.state}`);

            // Use AudioWorklet only (no ScriptProcessorNode fallback)
            this.logOutput('Initializing Csound with shared AudioContext...');

            // Create Csound instance reusing shared AudioContext
            this.csound = await Csound({
                audioContext: this.audioContext,
                inputChannelCount: 2,
                outputChannelCount: 2,
                autoConnect: true,
                withPlugins: [],
                useWorker: false,
                useSAB: false
            });

            this.logOutput('✅ AudioWorklet initialization successful!');

            if (!this.csound) {
                throw new Error('Failed to create Csound instance');
            }

            this.logOutput("Csound Sample Rate: " + await this.csound.getSr());
            this.logOutput("AudioContext Sample Rate: " + this.audioContext.sampleRate);

            // Set up event listeners
            this.csound.on('message', (message: string) => {
                this.logOutput(message);
            });

            this.csound.on('play', () => {
                this.logOutput('Csound event: play');
                this.isCsoundPlaying = true;
                this.updateEngineStatus('Playing');
                this.updateCsoundPauseButton('Pause');
                this.setCsoundControlsEnabled(true);
            });

            this.csound.on('pause', () => {
                this.logOutput('Csound event: pause');
                this.isCsoundPlaying = false;
                this.updateEngineStatus('Paused');
                this.updateCsoundPauseButton('Play');
            });

            this.csound.on('stop', () => {
                this.logOutput('Csound event: stop');
                this.isCsoundPlaying = false;
                this.updateEngineStatus('Stopped');
                this.updateCsoundPauseButton('Play');
                this.setCsoundControlsEnabled(false);
            });

            this.isInitialized = true;
            this.isAudioRunning = true;
            this.updateAudioStatus('Running');
            this.updateEngineStatus('Ready');

            this.setAudioPauseButtonEnabled(true);
            this.updatePauseResumeButton('Pause');
            this.setCsoundControlsEnabled(false);

            // Notify extension that Csound is ready
            this.vscode.postMessage({
                type: 'csoundReady'
            });

        } catch (error) {
            this.updateAudioStatus('Failed');
            this.logError(`Initialization error: ${error}`);
            this.updatePauseResumeButton('Start');
            this.setAudioPauseButtonEnabled(true);
        }
    }

    private async playCsd(csdContent: string, filename: string, projectFiles?: {[path: string]: string}) {
        if (!this.csound || !this.isInitialized) {
            this.logError('Csound not initialized');
            return;
        }

        try {
            this.logOutput(`Playing CSD file: ${filename}`);

            // Debug: Check what project files we received
            if (projectFiles) {
                this.logOutput(`Received ${Object.keys(projectFiles).length} project files: ${Object.keys(projectFiles).join(', ')}`);
            } else {
                this.logOutput('No project files received - projectFiles is undefined/null');
            }

            // Notify extension to focus output channel
            this.vscode.postMessage({
                type: 'startRender',
                filename: filename
            });

            // Stop any current performance
            await this.csound.stop();

            // CRITICAL FIX #1: Reset clears the Csound state but NOT the filesystem
            // We need to destroy and recreate Csound to get a fresh filesystem
            this.logOutput('Destroying and recreating Csound for fresh filesystem...');
            await this.csound.reset();
            await this.csound.destroy();

            if (!this.audioContext) {
                throw new Error('Shared AudioContext not initialized');
            }

            if (this.audioContext.state === 'suspended') {
                this.logOutput('Resuming suspended AudioContext before recreation...');
                await this.audioContext.resume();
            }

            // Recreate Csound using shared AudioContext
            this.csound = await Csound({
                audioContext: this.audioContext,
                inputChannelCount: 2,
                outputChannelCount: 2,
                autoConnect: true,
                withPlugins: [],
                useWorker: false,
                useSAB: false,
            });

            if (!this.csound) {
                throw new Error('Failed to recreate Csound instance');
            }

            this.csound.on('message', (message: string) => {
                this.logOutput(message);
            });

            // Set up state event listeners for recreated instance
            this.csound.on('play', () => {
                this.logOutput('Csound event: play');
                this.isCsoundPlaying = true;
                this.updateEngineStatus('Playing');
                this.updateCsoundPauseButton('Pause');
                this.setCsoundControlsEnabled(true);
            });

            this.csound.on('pause', () => {
                this.logOutput('Csound event: pause');
                this.isCsoundPlaying = false;
                this.updateEngineStatus('Paused');
                this.updateCsoundPauseButton('Play');
            });

            this.csound.on('stop', () => {
                this.logOutput('Csound event: stop');
                this.isCsoundPlaying = false;
                this.updateEngineStatus('Stopped');
                this.updateCsoundPauseButton('Play');
                this.setCsoundControlsEnabled(false);
            });

            this.logOutput(`Csound recreated with fresh filesystem`);

            // Step 1: Sync ALL project files to Csound's filesystem first
            if (projectFiles && Object.keys(projectFiles).length > 0) {
                this.logOutput('Syncing ALL project files to Csound filesystem...');
                await this.syncProjectFiles(projectFiles);
            } else {
                this.logOutput('Skipping project file sync - no files to sync');
            }

            // Step 2: Write the main CSD file to filesystem
            // Ensure filename has absolute path (starts with /)
            const absolutePath = filename.startsWith('/') ? filename : `/${filename}`;

            const encoder = new (window as any).TextEncoder();
            const csdData = encoder.encode(csdContent);
            await this.csound.fs.writeFile(absolutePath, csdData);
            this.logOutput(`Written ${absolutePath} to Csound filesystem`);


            // Step 3: Call csound.compileCsd with absolute path
            this.logOutput(`Calling csound.compileCsd("${absolutePath}", 0)...`);
            const result = await this.csound.compileCSD(absolutePath, 0);
            if (result !== 0) {
                this.logError(`Failed to compile CSD: ${result}`);
                return;
            }


            // this.logOutput("TESTING")
            this.logOutput("B) Csound Sample Rate: " + await this.csound.getSr());
            this.logOutput("B) AudioContext Sample Rate: " + this.audioContext.sampleRate);

            // Start performance
            const startResult = await this.csound.start();
            if (startResult !== 0) {
                this.logError(`Failed to start Csound: ${startResult}`);
                return;
            }

            // State will be updated by 'play' event listener
            this.logOutput('CSD playback started');
            await this.csound.resume();
        } catch (error) {
            this.logError(`Error playing CSD: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
            console.error('Full error object:', error);
            this.isCsoundPlaying = false;
            this.updateEngineStatus('Ready');
            this.updateCsoundPauseButton('Play');
            this.setCsoundControlsEnabled(false);
        }
    }

    private async evalOrc(orcContent: string) {
        if (!this.csound || !this.isInitialized) {
            this.logError('Csound not initialized');
            return;
        }

        try {
            this.logOutput('Evaluating orchestra code...');
            const result = await this.csound.compileOrc(orcContent);
            if (result === 0) {
                this.logOutput('Orchestra code compiled successfully');
            } else {
                this.logError(`Orchestra compilation failed: ${result}`);
            }
        } catch (error) {
            this.logError(`Error evaluating orchestra: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
            console.error('Full error object:', error);
        }
    }

    private async evalSco(scoContent: string) {
        if (!this.csound || !this.isInitialized) {
            this.logError('Csound not initialized');
            return;
        }

        try {
            this.logOutput('Evaluating score code...');
            const result = await this.csound.inputMessage(scoContent);
            if (result === 0) {
                this.logOutput('Score code evaluated successfully');
            } else {
                this.logError(`Score evaluation failed: ${result}`);
            }
        } catch (error) {
            this.logError(`Error evaluating score: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
            console.error('Full error object:', error);
        }
    }

    private async stopCsound() {
        if (!this.csound || !this.isInitialized) {
            this.logError('Csound not initialized');
            return;
        }

        try {
            this.logOutput('Stopping Csound...');
            await this.csound.stop();
            // State will be updated by 'stop' event listener
            this.logOutput('Csound stopped');
        } catch (error) {
            this.logError(`Error stopping Csound: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
            console.error('Full error object:', error);
        }
    }

    private async syncProjectFiles(projectFiles: {[path: string]: string}) {
        try {
            for (const [filePath, content] of Object.entries(projectFiles)) {
                // Create directory structure recursively if needed
                const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
                if (dirPath) {
                    await this.createDirectoryRecursive(dirPath);
                }

                // Convert string to Uint8Array
                const encoder = new (window as any).TextEncoder();
                const data = encoder.encode(content);

                await this.csound!.fs.writeFile(filePath, data);
                this.logOutput(`Synced: ${filePath}`);
            }

            // List files to verify they were written
            try {
                const files = await this.csound!.fs.readdir('/');
                this.logOutput(`Root directory contents: ${files.join(', ')}`);
            } catch (error) {
                this.logOutput('Could not list root directory');
            }
        } catch (error) {
            this.logError(`Error syncing project files: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
        }
    }

    private async inlineIncludes(csdContent: string, projectFiles: {[path: string]: string}): Promise<string> {
        let processedContent = csdContent;

        // Find all #include statements
        const includeRegex = /#include\s+["']([^"']+)["']/g;
        let match;

        while ((match = includeRegex.exec(csdContent)) !== null) {
            const includePath = match[1];
            const fullMatch = match[0];

            this.logOutput(`Processing include: ${includePath}`);

            // Look for the file in project files
            const includeContent = projectFiles[includePath];
            if (includeContent) {
                this.logOutput(`Inlining ${includePath} (${includeContent.length} characters)`);
                // Replace the #include with the actual content
                processedContent = processedContent.replace(fullMatch, `; Inlined from ${includePath}\n${includeContent}\n; End of ${includePath}`);
            } else {
                this.logOutput(`Warning: Include file ${includePath} not found in project files`);
                // Remove the include statement to avoid errors
                processedContent = processedContent.replace(fullMatch, `; Missing include: ${includePath}`);
            }
        }

        return processedContent;
    }

    private async compileCsdManually(csdContent: string, filename: string): Promise<number> {
        try {
            // Parse CSD sections
            const orchestraMatch = csdContent.match(/<CsInstruments>([\s\S]*?)<\/CsInstruments>/i);
            const scoreMatch = csdContent.match(/<CsScore>([\s\S]*?)<\/CsScore>/i);
            const optionsMatch = csdContent.match(/<CsOptions>([\s\S]*?)<\/CsOptions>/i);

            // Set options if present
            if (optionsMatch) {
                const options = optionsMatch[1].trim().split(/\s+/);
                for (const option of options) {
                    if (option.trim()) {
                        this.logOutput(`Setting option: ${option}`);
                        await this.csound!.setOption(option);
                    }
                }
            }

            // Compile orchestra
            if (orchestraMatch) {
                const orchestra = orchestraMatch[1].trim();
                this.logOutput(`Compiling orchestra (${orchestra.length} characters)...`);
                const orcResult = await this.csound!.compileOrc(orchestra);
                if (orcResult !== 0) {
                    this.logError(`Orchestra compilation failed: ${orcResult}`);
                    return orcResult;
                }
                this.logOutput('Orchestra compiled successfully');
            }

            // Handle score
            if (scoreMatch) {
                const score = scoreMatch[1].trim();
                this.logOutput(`Processing score (${score.length} characters)...`);
                const scoreResult = await this.csound!.inputMessage(score);
                if (scoreResult !== 0) {
                    this.logError(`Score processing failed: ${scoreResult}`);
                    return scoreResult;
                }
                this.logOutput('Score processed successfully');
            }

            return 0;
        } catch (error) {
            this.logError(`Manual CSD compilation failed: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
            return -1;
        }
    }

    private async createDirectoryRecursive(dirPath: string) {
        const parts = dirPath.split('/').filter(part => part.length > 0);
        let currentPath = '';

        for (const part of parts) {
            currentPath += '/' + part;
            try {
                await this.csound!.fs.mkdir(currentPath);
                this.logOutput(`Created directory: ${currentPath}`);
            } catch (error) {
                // Directory might already exist, ignore error
            }
        }
    }


    private updateEngineStatus(status: string) {
        const element = document.getElementById('engineStatus');
        if (element) {
            element.textContent = status;
        }
    }

    private updateSampleRate(sr: string) {
        const element = document.getElementById('sampleRate');
        if (element) {
            element.textContent = sr;
        }
    }

    private updateChannels(channels: string) {
        const element = document.getElementById('channels');
        if (element) {
            element.textContent = channels;
        }
    }

    private async toggleAudioContext() {
        if (!this.audioContext) {
            return;
        }

        this.setAudioPauseButtonEnabled(false);

        try {
            if (this.audioContext.state === 'running') {
                await this.audioContext.suspend();
                this.isAudioRunning = false;
                this.updateAudioStatus('Suspended');
                this.updatePauseResumeButton('Resume');
                this.logOutput('AudioContext suspended');
            } else if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
                this.isAudioRunning = true;
                this.updateAudioStatus('Running');
                this.updatePauseResumeButton('Pause');
                this.logOutput('AudioContext resumed');
            }
        } catch (error) {
            this.logError(`Error toggling AudioContext: ${error}`);
        } finally {
            this.setAudioPauseButtonEnabled(true);
        }
    }

    private updatePauseResumeButton(text: string) {
        const button = document.getElementById('pauseResumeButton') as any;
        if (button) {
            button.textContent = text;
        }
    }

    private setAudioPauseButtonEnabled(enabled: boolean) {
        const button = document.getElementById('pauseResumeButton') as any;
        if (button) {
            button.disabled = !enabled;
        }
    }

    private updateCsoundPauseButton(text: string) {
        const button = document.getElementById('csoundPauseButton') as any;
        if (button) {
            button.textContent = text;
        }
    }

    private setCsoundControlsEnabled(enabled: boolean) {
        const pauseButton = document.getElementById('csoundPauseButton') as any;
        const stopButton = document.getElementById('csoundStopButton') as any;
        if (pauseButton) {
            pauseButton.disabled = !enabled;
        }
        if (stopButton) {
            stopButton.disabled = !enabled;
        }
    }

    private updateAudioStatus(status: string) {
        const element = document.getElementById('audioStatus');
        if (element) {
            element.textContent = status;
        }
    }

    private async toggleCsoundPause() {
        if (!this.csound || !this.isInitialized) {
            this.logError('Csound not initialized');
            return;
        }

        try {
            if (this.isCsoundPlaying) {
                await this.csound.pause();
                // State will be updated by 'pause' event listener
                this.logOutput('Csound paused');
            } else {
                await this.csound.resume();
                // State will be updated by 'play' event listener
                this.logOutput('Csound resumed');
            }
        } catch (error) {
            this.logError(`Error toggling Csound: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
        }
    }

    private async sendCsoundStopEvent() {
        if (!this.csound || !this.isInitialized) {
            this.logError('Csound not initialized');
            return;
        }

        try {
            await this.csound.inputMessage('e 0 0');
            this.logOutput('Sent "e 0 0" to stop Csound');
            // State will be updated by 'stop' event listener
        } catch (error) {
            this.logError(`Error sending stop event: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
        }
    }

    private logOutput(message: string) {
        // Send output to VSCode output panel
        this.vscode.postMessage({
            type: 'csoundOutput',
            message: message
        });
    }

    private logError(message: string) {
        // Send error to VSCode output panel
        this.vscode.postMessage({
            type: 'csoundError',
            message: message
        });
    }
}

// Initialize when the page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new CsoundWebView());
} else {
    new CsoundWebView();
}
