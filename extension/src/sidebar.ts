import * as vscode from "vscode";
import { buildContext } from "./context";
import { executeActions, Action } from "./executor";
import { SessionManager } from "./session";

export class SidebarProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _isListening = false;
    private _isContinuousLoop = false;
    private readonly _backendUrl: string;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _session: SessionManager
    ) {
        this._backendUrl =
            vscode.workspace.getConfiguration("speakcode").get<string>("backendUrl")
            ?? "http://localhost:8000";
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._buildHtml(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.type) {
                case "start_recording":
                    await this._handleRecordingStart();
                    break;
                case "stop_recording":
                    await this._handleRecordingStop();
                    break;
                case "reset_session":
                    this._session.reset();
                    this._postMessage({ type: "session_reset" });
                    this._log("Session reset.");
                    break;
                case "error":
                    vscode.window.showErrorMessage(`SpeakCode: ${msg.message}`);
                    break;
            }
        });
    }

    startListening() {
        if (!this._view) { return; }
        this._isListening = true;
        this._postMessage({ type: "start_recording" });
        this._setStatus("LISTENING");
    }

    stopListening() {
        if (!this._view) { return; }
        this._isListening = false;
        this._postMessage({ type: "stop_recording" });
        this._setStatus("IDLE");
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private async _handleRecordingStart() {
        this._isListening = true;
        this._isContinuousLoop = true; // Mode engaged
        this._setStatus("LISTENING");
        
        try {
            const context = await buildContext();
            const res = await fetch(`${this._backendUrl}/api/listen/start`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    session_id: this._session.id,
                    context: context,
                    auto_stop: true
                })
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Backend error ${res.status}: ${text}`);
            }

            const data = await res.json() as { actions: Action[]; speech: string; status: string };
            this._setStatus("PROCESSING");
            this._log("Gemini responded. Processing actions...");
            this._postMessage({ type: "transcript", text: `Response: ${data.speech}` });

            this._setStatus("EXECUTING");
            await executeActions(
                data.actions,
                (text) => this._log(text),
                this._view?.webview
            );

        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this._log(`⚠ ${msg}`);
            this._setStatus("IDLE");
            this._postMessage({ type: "recording_failed" });
            this._isContinuousLoop = false;
        } finally {
            // Only go to idle if the loop was manually broken or failed
            if (!this._isContinuousLoop) {
                this._setStatus("IDLE");
                this._postMessage({ type: "recording_stopped" });
            }
        }
    }

    private async _handleRecordingStop() {
        this._isContinuousLoop = false;
        this._isListening = false;
        try {
            await fetch(`${this._backendUrl}/api/listen/stop`, { method: "POST" });
        } catch (err) { /* ignore */ }
    }

    private _postMessage(msg: object) {
        this._view?.webview.postMessage(msg);
    }

    private _setStatus(status: "IDLE" | "LISTENING" | "PROCESSING" | "EXECUTING") {
        this._postMessage({ type: "status", value: status });
    }

    private _log(text: string) {
        this._postMessage({ type: "log", text });
    }

    // ── HTML ──────────────────────────────────────────────────────────────────

    private _buildHtml(webview: vscode.Webview): string {
        const nonce = getNonce();
        const mediaUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "media")
        );

        return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src 'unsafe-inline';
             script-src 'nonce-${nonce}';
             media-src blob:;
             connect-src ${this._backendUrl};" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SpeakCode</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    /* Status badge */
    #status-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 99px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      align-self: flex-start;
      transition: background 0.2s;
    }
    #status-badge.listening  { background: #1a7a3c; color: #fff; animation: pulse 1.2s infinite; }
    #status-badge.processing { background: #7b5ea7; color: #fff; }
    #status-badge.executing  { background: #b85c00; color: #fff; }
    @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.6 } }

    /* Buttons */
    .btn-row { display: flex; gap: 6px; }
    button {
      flex: 1;
      padding: 6px 10px;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button:disabled { opacity: 0.45; cursor: not-allowed; }
    #btn-stop { background: var(--vscode-errorForeground); color: #fff; }
    #btn-reset { background: transparent; color: var(--vscode-descriptionForeground); font-weight: 400; }

    /* Transcript */
    .section-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
    }
    #transcript {
      min-height: 36px;
      padding: 6px 8px;
      background: var(--vscode-input-background);
      border-radius: 4px;
      font-style: italic;
      font-size: 12px;
      color: var(--vscode-input-foreground);
      word-break: break-word;
    }

    /* Action log */
    #log {
      height: 220px;
      overflow-y: auto;
      padding: 6px 8px;
      background: var(--vscode-terminal-background, var(--vscode-editor-background));
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
      line-height: 1.6;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .log-entry { word-break: break-word; }
    .log-entry.error { color: var(--vscode-errorForeground); }

    audio { width: 100%; border-radius: 4px; }
  </style>
</head>
<body>
  <span id="status-badge">IDLE</span>

  <div class="btn-row">
    <button id="btn-listen">🎙 Listen</button>
    <button id="btn-stop" disabled>⏹ Stop</button>
  </div>
  <button id="btn-reset">↺ Reset Session</button>

  <div class="section-label">Last Response</div>
  <div id="transcript">—</div>

  <div class="section-label">Action Log</div>
  <div id="log"></div>

  <audio id="audio-player" controls style="display:none;"></audio>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const backendUrl = "${this._backendUrl}";

  // ── DOM refs ────────────────────────────────────────────────────────────────
  const badge      = document.getElementById("status-badge");
  const transcript = document.getElementById("transcript");
  const logEl      = document.getElementById("log");
  const btnListen  = document.getElementById("btn-listen");
  const btnStop    = document.getElementById("btn-stop");
  const btnReset   = document.getElementById("btn-reset");
  const audioEl    = document.getElementById("audio-player");

  // ── Recorder state ──────────────────────────────────────────────────────────
  // No longer using MediaRecorder in frontend. Backend handles recording!

  // ── Button handlers ─────────────────────────────────────────────────────────
  btnListen.addEventListener("click", () => {
      // Audio Priming: Unlocks audio playback for the session in Chromium
      audioEl.play().then(() => {
          audioEl.pause();
          audioEl.currentTime = 0;
      }).catch(() => { /* Silent fail if already locked */ });

      vscode.postMessage({ type: "start_recording" });
      btnListen.disabled = true;
      btnStop.disabled   = false;
  });

  btnStop.addEventListener("click", () => {
      vscode.postMessage({ type: "stop_recording" });
      btnStop.disabled   = true;
  });

  btnReset.addEventListener("click",  () => vscode.postMessage({ type: "reset_session" }));

  // ── Continuous Loop Logic ───────────────────────────────────────────────────
  audioEl.onended = () => {
      // Re-trigger listening automatically after the AI finishes speaking
      console.log("Audio ended, restarting loop...");
      vscode.postMessage({ type: "start_recording" });
  };

  // ── Speak action: fetch TTS and play ────────────────────────────────────────
  async function playTTS(message) {
    try {
      const res = await fetch(backendUrl + "/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message })
      });
      if (!res.ok) { return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      audioEl.src = url;
      audioEl.style.display = "block";
      
      // Attempt to play — should succeed because we primed earlier
      audioEl.play().catch(e => console.error("Playback failed:", e));
    } catch (_) { /* TTS is best-effort */ }
  }

  // ── Log helper ───────────────────────────────────────────────────────────────
  function appendLog(text, isError = false) {
    const div = document.createElement("div");
    div.className = "log-entry" + (isError ? " error" : "");
    div.textContent = text;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ── Messages from extension host ────────────────────────────────────────────
  window.addEventListener("message", (event) => {
    const msg = event.data;
    switch (msg.type) {

      case "status":
        badge.textContent = msg.value;
        badge.className = "";
        if (msg.value === "LISTENING")  badge.classList.add("listening");
        if (msg.value === "PROCESSING") badge.classList.add("processing");
        if (msg.value === "EXECUTING")  badge.classList.add("executing");
        break;

      case "transcript":
        transcript.textContent = msg.text;
        break;

      case "log":
        appendLog(msg.text);
        break;

      case "speak":
        playTTS(msg.message);
        break;

      case "error":
        appendLog(msg.message, true);
        break;

      case "recording_failed":
      case "recording_stopped":
        btnListen.disabled = false;
        btnStop.disabled   = true;
        break;

      case "session_reset":
        logEl.innerHTML = "";
        transcript.textContent = "—";
        appendLog("Session reset. Fresh conversation started.");
        break;
    }
  });
</script>
</body>
</html>`;
    }
}

function getNonce() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
