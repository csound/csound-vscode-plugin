import Csound from "https://unpkg.com/@csound/browser@6.16.0-beta4/dist/csound.esm.js";

const vscode = acquireVsCodeApi();

let state = vscode.getState();
vscode.setState(null);
if (state) {
  console.log("Reusing old state");
} else {
  console.log("Creating new state");
}

  Csound().then((csound) => {
    state = { csound };
    vscode.setState(state);

    console.log("hello");

    window.addEventListener("message", async (event) => {
      const message = event.data; // The json data that the extension sent
      const cs = state.csound;
      switch (message.type) {
        case "addFile": {
          break;
        }
        case "evalOrc": {
          await cs.compileOrc(message.data);
          break;
        }
        case "start": {
          await cs.stop();
          await cs.reset();
          await cs.setOption("-m0");
          await cs.setOption("-odac");
          await cs.setOption("-+msg_color=false");
          await cs.setOption("--daemon");
          await cs.compileOrc("ksmps=32\n0dbfs=1\nnchnls=2\nnchnls_i=1");
          await cs.start();
          break;
        }
        case "stop": {
          await cs.stop();
          await cs.reset();
          break;
        }
      }
    });
  });
