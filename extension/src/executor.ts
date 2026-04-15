import * as vscode from "vscode";
import * as cp from "child_process";
import { getWorkspaceRoot } from "./context";

export interface Action {
    tool: string;
    path?: string;
    content?: string;
    command?: string;
    message?: string;
}

export interface RunResult {
    stdout: string;
    stderr: string;
    code: number;
}

type LogFn = (text: string) => void;

// ─── Shell helpers ────────────────────────────────────────────────────────────

function runAndCapture(command: string, cwd: string): Promise<RunResult> {
    return new Promise((resolve) => {
        const proc = cp.exec(command, { cwd }, (error, stdout, stderr) => {
            resolve({
                stdout,
                stderr,
                code: error?.code ?? 0
            });
        });

        // Hard 30-second cap — prevents infinite hangs
        const timer = setTimeout(() => {
            proc.kill();
            resolve({ stdout: "", stderr: "Command timed out after 30 seconds", code: -1 });
        }, 30_000);

        proc.on("close", () => clearTimeout(timer));
    });
}

// ─── Main executor ────────────────────────────────────────────────────────────

export async function executeActions(
    actions: Action[],
    log: LogFn,
    webview?: vscode.Webview
): Promise<void> {
    const rootPath = getWorkspaceRoot();
    const workspaceUri = rootPath ? vscode.Uri.file(rootPath) : undefined;

    for (const action of actions) {
        try {
            await executeSingle(action, rootPath, workspaceUri, log, webview);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            log(`⚠ Error executing ${action.tool}: ${msg}`);
        }
    }
}

async function executeSingle(
    action: Action,
    rootPath: string,
    workspaceUri: vscode.Uri | undefined,
    log: LogFn,
    webview?: vscode.Webview
): Promise<void> {

    // Helper to enforce workspace
    function requireWorkspace(): boolean {
        if (!workspaceUri || !rootPath) {
            const msg = "Requires an open workspace folder.";
            log(`⚠ Error executing ${action.tool}: ${msg}`);
            webview?.postMessage({ type: "error", message: msg });
            return false;
        }
        return true;
    }

    switch (action.tool) {

        // ── create_file ─────────────────────────────────────────────────────
        case "create_file": {
            if (!action.path || action.content === undefined || !requireWorkspace()) { break; }
            const uri = vscode.Uri.joinPath(workspaceUri!, action.path);
            await vscode.workspace.fs.writeFile(uri, Buffer.from(action.content, "utf8"));
            log(`✓ Created ${action.path}`);
            break;
        }

        // ── edit_file ───────────────────────────────────────────────────────
        case "edit_file": {
            if (!action.path || action.content === undefined || !requireWorkspace()) { break; }
            const uri = vscode.Uri.joinPath(workspaceUri!, action.path);
            await vscode.workspace.fs.writeFile(uri, Buffer.from(action.content, "utf8"));
            log(`✓ Edited ${action.path}`);
            break;
        }

        // ── read_file ───────────────────────────────────────────────────────
        case "read_file": {
            if (!action.path || !requireWorkspace()) { break; }
            const uri = vscode.Uri.joinPath(workspaceUri!, action.path);
            const bytes = await vscode.workspace.fs.readFile(uri);
            const content = Buffer.from(bytes).toString("utf8");
            log(`✓ Read ${action.path} (${content.length} chars)`);
            // inform webview so it can show the content if needed
            webview?.postMessage({ type: "file_content", path: action.path, content });
            break;
        }

        // ── run_and_capture ─────────────────────────────────────────────────
        case "run_and_capture": {
            if (!action.command || !requireWorkspace()) { break; }
            log(`▶ Running: ${action.command}`);
            const result = await runAndCapture(action.command, rootPath);
            const summary = result.code === 0
                ? `✓ Exit 0${result.stdout ? ": " + result.stdout.slice(0, 200) : ""}`
                : `✗ Exit ${result.code}${result.stderr ? ": " + result.stderr.slice(0, 200) : ""}`;
            log(summary);
            webview?.postMessage({ type: "run_result", command: action.command, ...result });
            break;
        }

        // ── run_interactive ─────────────────────────────────────────────────
        case "run_interactive": {
            if (!action.command) { break; }
            const terminal = vscode.window.activeTerminal
                ?? vscode.window.createTerminal("SpeakCode");
            terminal.show();
            terminal.sendText(action.command);
            log(`▶ Sent to terminal: ${action.command}`);
            break;
        }

        // ── open_file ───────────────────────────────────────────────────────
        case "open_file": {
            if (!action.path || !requireWorkspace()) { break; }
            const uri = vscode.Uri.joinPath(workspaceUri!, action.path);
            await vscode.window.showTextDocument(uri);
            log(`✓ Opened ${action.path}`);
            break;
        }

        // ── speak ───────────────────────────────────────────────────────────
        case "speak": {
            if (!action.message) { break; }
            log(`🔊 ${action.message}`);
            // The sidebar fetches /tts and plays the audio
            webview?.postMessage({ type: "speak", message: action.message });
            break;
        }

        // ── error ───────────────────────────────────────────────────────────
        case "error": {
            log(`⚠ ${action.message ?? "Unknown error"}`);
            webview?.postMessage({ type: "error", message: action.message });
            break;
        }

        default:
            log(`? Unknown action: ${action.tool}`);
    }
}
