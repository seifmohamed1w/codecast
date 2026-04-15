import sounddevice as sd
import soundfile as sf
import io
import numpy as np
import threading

class Recorder:
    def __init__(self):
        self.is_recording = False
        self.stream = None
        self.frames = []
        self.sample_rate = 16000
        self.stop_event = threading.Event()
        
        # VAD Settings
        self.silence_threshold = 0.01
        self.silence_duration_limit = 2.2  # seconds
        self.silent_blocks = 0

    def start_recording(self):
        if self.is_recording:
            return
        self.frames = []
        self.is_recording = True
        self.stop_event.clear()
        self.silent_blocks = 0

        # Calculate block length in seconds
        # sounddevice default blocksize is usually around 0 if not specified, 
        # let's assume a reasonable block size if we want to track time.
        # Actually, InputStream will provide frames based on the device.
        
        def callback(indata, frames, time, status):
            if status:
                print(f"Recording status: {status}")
            
            self.frames.append(indata.copy())
            
            # Simple VAD logic
            rms = np.sqrt(np.mean(indata**2))
            if rms < self.silence_threshold:
                # Each block duration = frames / sample_rate
                self.silent_blocks += frames / self.sample_rate
            else:
                self.silent_blocks = 0
            
            if self.silent_blocks >= self.silence_duration_limit:
                self.stop_event.set()

        self.stream = sd.InputStream(samplerate=self.sample_rate, channels=1, callback=callback)
        self.stream.start()

    def stop_recording(self) -> bytes:
        if not self.is_recording:
            return b""
        self.is_recording = False
        self.stop_event.set() # Ensure event is set if manual stop
        
        if self.stream:
            self.stream.stop()
            self.stream.close()
            self.stream = None

        if not self.frames:
            return b""

        # Concatenate frames
        audio_data = np.concatenate(self.frames, axis=0)

        # Write to in-memory wave bytes
        buf = io.BytesIO()
        sf.write(buf, audio_data, self.sample_rate, format='WAV', subtype='PCM_16')
        return buf.getvalue()

recorder = Recorder()
