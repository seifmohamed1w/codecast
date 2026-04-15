import * as vscode from "vscode";
import * as path from "path";

export interface WorkspaceContext {
    workspace_root: string;
    files: string[];
    open_file: string;
    open_content: string;
    diagnostics: string[];
}

export function getWorkspaceRoot(): string {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        return "";
    }
    return folders[0].uri.fsPath;
}

export async function getFileList(): Promise<string[]> {
    const root = getWorkspaceRoot();
    if (!root) { return []; }

    const uris = await vscode.workspace.findFiles(
        "**/*",
        // Exclude common noise
        "{**/node_modules/**,**/.git/**,**/out/**,**/__pycache__/**,**/.venv/**}"
    );

    return uris
        .map(u => path.relative(root, u.fsPath).replace(/\\/g, "/"))
        .sort();
}

export function getOpenFile(): { name: string; content: string } {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return { name: "", content: "" };
    }
    const root = getWorkspaceRoot();
    const relativePath = root
        ? path.relative(root, editor.document.uri.fsPath).replace(/\\/g, "/")
        : editor.document.uri.fsPath;

    return {
        name: relativePath,
        content: editor.document.getText()
    };
}

export function getDiagnostics(): string[] {
    const results: string[] = [];
    for (const [uri, diags] of vscode.languages.getDiagnostics()) {
        const root = getWorkspaceRoot();
        const filePath = root
            ? path.relative(root, uri.fsPath).replace(/\\/g, "/")
            : uri.fsPath;

        for (const d of diags) {
            const severity = vscode.DiagnosticSeverity[d.severity];
            results.push(
                `${filePath} line ${d.range.start.line + 1}: [${severity}] ${d.message}`
            );
        }
    }
    return results;
}

export async function buildContext(): Promise<WorkspaceContext> {
    const root = getWorkspaceRoot();
    const [files, openFile] = await Promise.all([
        getFileList(),
        Promise.resolve(getOpenFile())
    ]);
    const diagnostics = getDiagnostics();

    return {
        workspace_root: root,
        files,
        open_file: openFile.name,
        open_content: openFile.content.slice(0, 8000), // cap at 8k chars
        diagnostics
    };
}
