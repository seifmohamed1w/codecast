import google.generativeai.protos as protos

TOOL_LIST = protos.Tool(function_declarations=[
    protos.FunctionDeclaration(
        name="create_file",
        description="Create a new file in the project with the given content.",
        parameters=protos.Schema(
            type=protos.Type.OBJECT,
            properties={
                "path":    protos.Schema(type=protos.Type.STRING, description="Relative path, e.g. src/app.py"),
                "content": protos.Schema(type=protos.Type.STRING, description="Full file content"),
            },
            required=["path", "content"]
        )
    ),
    protos.FunctionDeclaration(
        name="edit_file",
        description="Overwrite an existing file with new content.",
        parameters=protos.Schema(
            type=protos.Type.OBJECT,
            properties={
                "path":    protos.Schema(type=protos.Type.STRING),
                "content": protos.Schema(type=protos.Type.STRING),
            },
            required=["path", "content"]
        )
    ),
    protos.FunctionDeclaration(
        name="read_file",
        description="Read a file's content. Use before editing to check existing code.",
        parameters=protos.Schema(
            type=protos.Type.OBJECT,
            properties={"path": protos.Schema(type=protos.Type.STRING)},
            required=["path"]
        )
    ),
    protos.FunctionDeclaration(
        name="run_and_capture",
        description="Run a terminal command and return stdout/stderr. Use for installs, tests, scripts.",
        parameters=protos.Schema(
            type=protos.Type.OBJECT,
            properties={"command": protos.Schema(type=protos.Type.STRING)},
            required=["command"]
        )
    ),
    protos.FunctionDeclaration(
        name="run_interactive",
        description="Run a command in the visible terminal (servers, long-running processes). No output captured.",
        parameters=protos.Schema(
            type=protos.Type.OBJECT,
            properties={"command": protos.Schema(type=protos.Type.STRING)},
            required=["command"]
        )
    ),
    protos.FunctionDeclaration(
        name="open_file",
        description="Open a file in the VS Code editor.",
        parameters=protos.Schema(
            type=protos.Type.OBJECT,
            properties={"path": protos.Schema(type=protos.Type.STRING)},
            required=["path"]
        )
    ),
    protos.FunctionDeclaration(
        name="speak",
        description="Send a voice response to the user. ALWAYS call this last to summarize what you did.",
        parameters=protos.Schema(
            type=protos.Type.OBJECT,
            properties={"message": protos.Schema(type=protos.Type.STRING)},
            required=["message"]
        )
    ),
])
