import base64
import os
from dotenv import load_dotenv
import google.generativeai as genai

from .tools import TOOL_LIST
from .prompts import build_system_prompt

load_dotenv(override=True)
api_key = os.environ.get("GEMINI_API_KEY", "").strip()
if api_key:
    os.environ["GOOGLE_API_KEY"] = api_key
    genai.configure(api_key=api_key)

MAX_TOOL_ROUNDS = 10

async def orchestrate(audio_bytes: bytes, workspace: dict, session_id: str) -> dict:
    from sessions.manager import session_store
    
    if not api_key:
        return {"actions": [{"tool": "error", "message": "GEMINI_API_KEY missing from backend/.env"}], "speech": "API key missing.", "status": "done"}

    system = build_system_prompt(workspace)

    # Get or create a chat session
    chat = session_store.get_or_create(session_id, system)

    # Build the initial message with audio inline
    audio_part = {
        "inline_data": {
            "mime_type": "audio/wav",
            "data": base64.b64encode(audio_bytes).decode('utf-8')
        }
    }
    
    initial_message = [
        audio_part,
        {"text": "The above is the user's voice command. Understand it and take the appropriate actions."}
    ]

    actions = []
    speech  = ""

    try:
        response = chat.send_message(initial_message)

        for _round in range(MAX_TOOL_ROUNDS):
            tool_calls = [p for p in response.parts if hasattr(p, "function_call") and p.function_call]

            if not tool_calls:
                # Handle edge case where Gemini responds with raw text instead of a tool call
                text_parts = [p.text for p in response.parts if hasattr(p, "text") and p.text]
                if text_parts and not speech:
                    speech = "\n".join(text_parts)
                    actions.append({"tool": "speak", "message": speech})
                break
            
            tool_results = []
            for call in tool_calls:
                fn_name = call.function_call.name
                fn_args = dict(call.function_call.args)

                action = {"tool": fn_name, **fn_args}
                actions.append(action)

                if fn_name == "speak":
                    speech = fn_args.get("message", "")
                    result_content = {"acknowledged": True}
                else:
                    result_content = {"pending": True, "note": "Execution delegated to extension"}

                tool_results.append(
                    genai.protos.Part(function_response=genai.protos.FunctionResponse(
                        name=fn_name,
                        response=result_content
                    ))
                )

            if not tool_results:
                break
            response = chat.send_message(tool_results)
    
        return {
            "actions": actions,
            "speech":  speech or "Done.",
            "status":  "done"
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"actions": [{"tool": "error", "message": f"Gemini API Error: {str(e)}"}], "speech": "I had a networking error.", "status": "done"}
