import * as vscode from "vscode";
import { randomUUID } from "crypto";

export class SessionManager {
    private _sessionId: string;
    private readonly _stateKey = "speakcode.sessionId";

    constructor(private readonly context: vscode.ExtensionContext) {
        // Reuse session across reloads within the same workspace, or create a new one
        const stored = context.globalState.get<string>(this._stateKey);
        this._sessionId = stored ?? this._generateAndStore();
    }

    get id(): string {
        return this._sessionId;
    }

    /** Wipe the current session and start a fresh one (user-triggered) */
    reset(): string {
        this._sessionId = this._generateAndStore();
        return this._sessionId;
    }

    private _generateAndStore(): string {
        const id = randomUUID();
        this.context.globalState.update(this._stateKey, id);
        return id;
    }
}
