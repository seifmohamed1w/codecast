from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from services.recorder import recorder
from agent.orchestrator import orchestrate

app = FastAPI(title="SpeakCode Local Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import asyncio
from typing import Optional

class StartRequest(BaseModel):
    session_id: str
    context: dict
    auto_stop: Optional[bool] = True

class StopRequest(BaseModel):
    session_id: str
    context: dict

@app.post("/api/listen/start")
async def start_listening(request: StartRequest):
    recorder.start_recording()
    
    if not request.auto_stop:
        return {"status": "recording_started"}
    
    # Wait for silence detection or manual stop via recorder.stop_event
    # We use asyncio.to_thread to wait without blocking the event loop
    try:
        await asyncio.to_thread(recorder.stop_event.wait, timeout=30)
    except Exception:
        pass
    
    # Once signaled, stop and orchestrate
    audio_bytes = recorder.stop_recording()
    if not audio_bytes:
        return {"actions": [], "speech": "I couldn't hear anything.", "status": "done"}
        
    try:
        result = await orchestrate(audio_bytes, request.context, request.session_id)
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"actions": [{"tool": "error", "message": str(e)}], "speech": "Err...", "status": "done"}

@app.post("/api/listen/stop")
async def stop_listening(request: Optional[StopRequest] = None):
    # This manually triggers the stop_event inside Recorder, 
    # which will then fulfill the wait in start_listening if it's running.
    recorder.stop_recording()
    return {"status": "stopped"}

from fastapi.responses import Response
from services.tts import synthesize

class TTSRequest(BaseModel):
    text: str

@app.post("/tts")
@app.post("/api/tts")
async def tts(request: TTSRequest):
    audio_bytes = await synthesize(request.text)
    return Response(content=audio_bytes, media_type="audio/mpeg")

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/key_test")
async def key_test():
    import os
    k = os.environ.get("GOOGLE_API_KEY", "")
    return {"key_len": len(k), "first_4": k[:4]}
