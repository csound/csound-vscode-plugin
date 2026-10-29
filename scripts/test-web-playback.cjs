// Behavioral checks without an Electron download. Run with npm run test-web-playback.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const {webcrypto: crypto} = require('node:crypto');
function load(file, mocks, globals = {}) {
    const exports = {};
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
    vm.runInNewContext(source, {exports, require: name => mocks[name] || load(path.resolve(path.dirname(file), name + '.ts'), mocks), console, setTimeout, clearTimeout, crypto, TextEncoder, ...globals}, {filename:file});
    return exports;
}
const disposable = {dispose(){}};
const event = () => disposable;
function uri(p) { return {scheme:'test', authority:'host', path:p, toString(){return 'test://host'+p;}}; }
function doc(p,text,dirty=false) {return {uri:uri(p), languageId:'csound',isDirty:dirty,isUntitled:false,getText:()=>text};}
let data = new Map([['/root/sub/main.csd',new TextEncoder().encode('saved')],['/root/sample.bin',new Uint8Array([0,255,128])]]);
const main = doc('/root/sub/main.csd','unsaved',true);
let watcherChange;
const vscode = {
    Uri:{joinPath:(u,...p)=>uri(path.posix.normalize(u.path+'/'+p.join('/')))},
    RelativePattern:class {constructor(base,pattern){this.base=base;this.pattern=pattern;}},
    StatusBarAlignment:{Left:1},
    commands:{executeCommand:async()=>{}},
    window:{activeTextEditor:{document:main},onDidChangeActiveTextEditor:event, createStatusBarItem:()=>({show(){},hide(){},dispose(){}}),createOutputChannel:()=>({show(){},appendLine(){},dispose(){}}),showInformationMessage(){},showErrorMessage(){}},
    workspace:{
        workspaceFolders:[{uri:uri('/other')},{uri:uri('/root')}],textDocuments:[main],
        getWorkspaceFolder:u=>({uri:uri(u.path.startsWith('/root')?'/root':'/other')}),
        getConfiguration:()=>({get:()=>'.'}),
        createFileSystemWatcher:()=>({dispose(){},onDidChange:fn=>{watcherChange=fn;return disposable;},onDidCreate:event,onDidDelete:event}),
        onDidChangeTextDocument:event,onDidCloseTextDocument:event,onDidSaveTextDocument:event,
        findFiles:async pattern=>[...data.keys()].filter(p=>p.startsWith(pattern.base.path+'/')).map(uri),
        fs:{stat:async u=>({mtime:u.path.endsWith('.bin')?0:1,size:data.get(u.path).length}),readFile:async u=>data.get(u.path)}
    }
};
(async()=>{
    const {ProjectFiles} = load(path.resolve('src/web/projectFiles.ts'),{vscode});
    const files = new ProjectFiles();
    let snap = await files.snapshot(main,main.getText());
    assert.equal(snap.entries.length,2);
    assert.equal(snap.main,'/workspace/1/sub/main.csd');
    assert.equal(new TextDecoder().decode(snap.entries.find(e=>e.path.endsWith('.csd')).bytes),'unsaved');
    assert.deepEqual([...await vscode.workspace.fs.readFile(snap.entries.find(e=>e.path.endsWith('.bin')).uri)],[0,255,128]);
    files.commit(snap.entries);
    snap = await files.snapshot(main,main.getText());
    assert.equal(snap.entries.filter(e=>files.changed(e)).length,0);
    data.set('/root/sample.bin',new Uint8Array([0,254,128]));
    snap = await files.snapshot(main,main.getText());
    assert.equal(snap.entries.filter(e=>files.changed(e)).length,1,'mtime=0 fallback finds a same-size edit');
    data.delete('/root/sample.bin');
    snap = await files.snapshot(main,main.getText());assert.equal(snap.entries.length,1);
    const other=doc('/other/sub/main.csd','other');vscode.workspace.textDocuments.push(other);
    const second=await files.snapshot(other,'other');assert.equal(second.main,'/workspace/2/sub/main.csd');
    files.invalidate();assert.ok(files.changed(snap.entries[0]));files.dispose();
    console.log('PASS project mapping, binary bytes, dirty overlay, unchanged sync, metadata fallback, deletion and multiple roots');

    data.set('/root/chain.orc', new TextEncoder().encode('instr 1\nendin'));
    const {CsoundWebViewProvider} = load(path.resolve('src/webview/csoundWebViewProvider.ts'),{vscode});
    const provider = new CsoundWebViewProvider(uri('/extension'));
    let receive;
    const sent=[];const held=[];
    const view={show(){},onDidDispose:event,webview:{cspSource:'test:',asWebviewUri:u=>u.toString(),onDidReceiveMessage:fn=>{receive=fn;return disposable;},postMessage:async m=>{
        sent.push(m);
        if(m.id){
            const reply=()=>{if(m.command==='start'){receive({session:m.session,type:'state',intent:m.intent,state:'Playing'});}receive({session:m.session,type:'reply',id:m.id,value:true});};
            if(m.command==='initialize'){held.push(reply);}else{setTimeout(reply,0);}
        }
        return true;
    }}};
    provider.resolveWebviewView(view);
    receive({type:'ready',session:provider.session});
    const first=provider.run();
    while(!held.length){await new Promise(r=>setTimeout(r,0));}
    await provider.stopCsound();held.shift()();await first;
    assert.equal(sent.filter(m=>m.command==='start').length,0,'Stop during initialization cancels Run');
    const secondRun=provider.run();while(!held.length){await new Promise(r=>setTimeout(r,0));}
    const thirdRun=provider.run();while(held.length<2){await new Promise(r=>setTimeout(r,0));}
    held.splice(0).forEach(reply=>reply());await Promise.all([secondRun,thirdRun]);
    assert.equal(sent.filter(m=>m.command==='start').length,1,'only the latest Run starts');
    const beforeSwitch=sent.length;
    const sameProject=doc('/root/sub/other.csd','#include "../chain.orc"');
    vscode.window.activeTextEditor.document=sameProject;
    vscode.workspace.textDocuments.push(sameProject);
    const nextRun=provider.run();while(!held.length){await new Promise(r=>setTimeout(r,0));}
    held.shift()();await nextRun;
    assert.ok(!sent.slice(beforeSwitch).some(m=>m.command==='file' && m.path.endsWith('/chain.orc')),
        'switching documents in the same live runtime preserves unchanged includes');
    // VS Code may bootstrap the iframe again without resolving a new WebviewView.
    // Its new engine has no files, even though the host still has a manifest.
    const beforeReload=sent.length;
    receive({type:'ready',session:provider.session});
    const switched=doc('/root/sub/test2_repeats.csd','#include "../chain.orc"');
    vscode.window.activeTextEditor.document=switched;
    vscode.workspace.textDocuments.push(switched);
    const switchedRun=provider.run();
    while(!held.length){await new Promise(r=>setTimeout(r,0));}
    held.shift()();await switchedRun;
    assert.ok(sent.slice(beforeReload).some(m=>m.command==='file' && m.path.endsWith('/chain.orc')),
        'a bootstrapped engine must receive unchanged includes before a different CSD starts');
    await provider.stopCsound();provider.dispose();
    console.log('PASS host cancellation, latest-Run-wins, document switching, and fresh-iframe file synchronization');

    vscode.Range=class {constructor(start,end){this.start=start;this.end=end;}};
    const {getEvalText,getScoEvalText}=load(path.resolve('src/liveCoding.ts'),{vscode});
    for(const [open,close] of [['instr 1','endin'],['opcode Example, a, k','endop']]){
        const lines=[open,'a1 oscili 0.1, 440',close];
        const textDocument={lineCount:lines.length,lineAt:n=>{n=typeof n==='number'?n:n.line;return {text:lines[n],range:{start:{line:n,character:0},end:{line:n,character:lines[n].length}}};},getText:range=>range?lines.slice(range.start.line,range.end.line+1).join('\n'):''};
        const pos={line:1,character:0};const selection={isEmpty:true,start:pos,end:pos,active:pos};
        assert.equal(getEvalText(textDocument,selection).text,lines.join('\n'));
        assert.equal(getScoEvalText(textDocument,selection).text,lines[1]);
    }
    console.log('PASS shared instrument/opcode block evaluation and score-line evaluation');

    const callbacks={};const replies=[];let created=0;let starts=0;let stops=0;let terminates=0;let compileRelease;let testAudio;let audioResumes=0;
    const contents=new Map();const handlers={};
    const engine={
        on:(name,fn)=>{handlers[name]=fn;},stop:async()=>{stops++;handlers.stop?.();},reset:async()=>{},terminateInstance:async()=>{terminates++;},
        fs:{pathExists:async p=>contents.has(p),mkdir:async p=>contents.set(p,null),writeFile:async(p,b)=>contents.set(p,b),appendFile:async(p,b)=>contents.set(p,new Uint8Array([...contents.get(p),...b])),unlink:async p=>contents.delete(p),chdir:async()=>0,getcwd:async()=>'/workspace/1',readFile:async p=>contents.get(p)},
        compileCSD:async()=>{if(compileRelease){await new Promise(resolve=>{compileRelease=resolve;});}return 0;},
        start:async()=>{starts++;handlers.play?.();return 0;},pause:async()=>handlers.pause?.(),resume:async()=>handlers.play?.(),compileOrc:async()=>0,inputMessage:async()=>0
    };
    const elements=new Map();
    load(path.resolve('src/webview/csound-webview.ts'),{'@csound/browser':{Csound:async()=>{created++;return engine;}}},{
        acquireVsCodeApi:()=>({postMessage:m=>replies.push(m)}),
        AudioContext:class {state='running';constructor(){testAudio=this;}async resume(){audioResumes++;this.state='running';}async close(){}},
        document:{body:{dataset:{session:'test'}},getElementById:id=>{if(!elements.has(id))elements.set(id,{addEventListener(){}});return elements.get(id);}},
        window:{addEventListener:(name,fn)=>{callbacks[name]=fn;}}
    });
    let id=0;let intent=1;
    function cancel(){callbacks.message({data:{command:'cancel',session:'test',intent}});}
    async function send(command){const n=++id;callbacks.message({data:{...command,session:'test',intent,id:n}});for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,0));const reply=replies.find(m=>m.type==='reply'&&m.id===n);if(reply){if(reply.error)throw Error(reply.error);return reply;}}throw Error('No reply');}
    cancel();await send({command:'initialize'});
    testAudio.state='suspended';
    const resumed=await send({command:'initialize'});
    assert.equal(resumed.value,true);
    assert.equal(audioResumes,1,'a permitted audio resume must not require a second click');
    assert.ok(!replies.some(m=>m.type==='state' && m.state==='Enable Audio'));

    await send({command:'begin',root:'/workspace/1',paths:['/workspace/1/main.csd']});
    await send({command:'file',path:'/workspace/1/main.csd',bytes:new Uint8Array([1,2]).buffer,append:false});
    await send({command:'file',path:'/workspace/1/main.csd',bytes:new Uint8Array([3]).buffer,append:true});
    assert.deepEqual([...contents.get('/workspace/1/main.csd')],[1,2,3]);
    await send({command:'start',path:'/workspace/1/main.csd'});await send({command:'pause'});await send({command:'stop'});assert.equal(stops,1);
    await send({command:'begin',root:'/workspace/1',paths:['/workspace/1/main.csd']});await send({command:'start',path:'/workspace/1/main.csd'});assert.equal(created,1);assert.equal(starts,2);
    await send({command:'stop'});await send({command:'begin',root:'/workspace/1',paths:[]});assert.ok(!contents.has('/workspace/1/main.csd'));
    compileRelease=true;
    const compiling=send({command:'start',path:'/workspace/1/main.csd'});
    while(typeof compileRelease!=='function'){await new Promise(r=>setTimeout(r,0));}
    intent++;cancel();compileRelease();await compiling;await send({command:'stop'});assert.equal(starts,2,'Stop during compile prevents stale start');
    compileRelease=undefined;
    engine.compileCSD=async()=>-1;
    await assert.rejects(send({command:'start',path:'/workspace/1/main.csd'}),/Compilation failed/);
    await send({command:'initialize'});
    assert.equal(created,2,'failed preparation replaces the engine on retry');
    assert.equal(terminates,1,'replacement fully terminates the failed engine');
    callbacks.pagehide();assert.equal(terminates,2);
    console.log('PASS engine reuse, ordered byte chunks, paused Stop, deletion, canceled compilation, and termination');
})().catch(error=>{console.error(error);process.exitCode=1;});
