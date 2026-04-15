import google.generativeai as genai
from agent.tools import TOOL_LIST
from typing import Dict

MODEL = "gemini-2.5-flash"

class SessionStore:
    def __init__(self):
        self._sessions: Dict[str, genai.ChatSession] = {}

    def get_or_create(self, session_id: str, system_prompt: str) -> genai.ChatSession:
        if session_id not in self._sessions:
            model = genai.GenerativeModel(
                model_name=MODEL,
                tools=[TOOL_LIST],
                system_instruction=system_prompt,
            )
            self._sessions[session_id] = model.start_chat(history=[])
        return self._sessions[session_id]

    def reset(self, session_id: str):
        self._sessions.pop(session_id, None)

session_store = SessionStore()
