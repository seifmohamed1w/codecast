import * as vscode from "vscode";
import { SidebarProvider } from "./sidebar";
import { SessionManager } from "./session";

export function activate(context: vscode.ExtensionContext) {
    console.log("🎙 SpeakCode: activate() called — extension is loading!");

    // ── Session manager ────────────────────────────────────────────────────────
    const session = new SessionManager(context);

    // ── Sidebar provider ───────────────────────────────────────────────────────
    const sidebarProvider = new SidebarProvider(context.extensionUri, session);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            "speakcode.sidebar",
            sidebarProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    // ── Commands ───────────────────────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand("speakcode.listen", () => {
            sidebarProvider.startListening();
        }),
        vscode.commands.registerCommand("speakcode.stop", () => {
            sidebarProvider.stopListening();
        }),
        vscode.commands.registerCommand("speakcode.resetSession", () => {
            session.reset();
            vscode.window.showInformationMessage("SpeakCode: Session reset.");
        })
    );

    // ── Status bar button ──────────────────────────────────────────────────────
    const statusBar = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBar.text = "$(mic) SpeakCode";
    statusBar.tooltip = "Click to start listening";
    statusBar.command = "speakcode.listen";
    statusBar.show();
    context.subscriptions.push(statusBar);

    // ── Backend health check ───────────────────────────────────────────────────
    const backendUrl =
        vscode.workspace.getConfiguration("speakcode").get<string>("backendUrl")
        ?? "http://localhost:8000";

    fetch(`${backendUrl}/health`)
        .then((res) => {
            if (!res.ok) { throw new Error(`Status ${res.status}`); }
        })
        .catch(() => {
            vscode.window.showWarningMessage(
                "SpeakCode: Backend not reachable at " + backendUrl +
                ". Start the FastAPI server first.",
                "Dismiss"
            );
        });
}

export function deactivate() {
    // Nothing to clean up — subscriptions handle disposal automatically
}
