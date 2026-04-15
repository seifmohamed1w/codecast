import httpx
import os
import io
from gtts import gTTS
from dotenv import load_dotenv

load_dotenv()

ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY")
VOICE_ID = "hpp4J3VqNfWAUOO0d1Us"

async def synthesize(text: str) -> bytes:
    if not ELEVENLABS_API_KEY:
        return _fallback_gtts(text)

    try:
        async with httpx.AsyncClient() as client:
            url = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}"
            headers = {
                "Accept": "audio/mpeg",
                "Content-Type": "application/json",
                "xi-api-key": ELEVENLABS_API_KEY
            }
            data = {
                "text": text,
                "model_id": "eleven_multilingual_v2",
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.5
                }
            }
            
            response = await client.post(url, json=data, headers=headers, timeout=30.0)
            
            if response.status_code != 200:
                print(f"ElevenLabs error: {response.status_code} - {response.text}")
                return _fallback_gtts(text)
                
            return response.content

    except Exception as e:
        print(f"TTS Error (ElevenLabs): {e}")
        return _fallback_gtts(text)

def _fallback_gtts(text: str) -> bytes:
    try:
        print("Falling back to gTTS...")
        buf = io.BytesIO()
        gTTS(text).write_to_fp(buf)
        return buf.getvalue()
    except Exception as e:
        print(f"TTS Fallback Error: {e}")
        return b""
