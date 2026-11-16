import json
import subprocess
import wave
from dataclasses import dataclass
from pathlib import Path


class AudioValidationError(ValueError):
    pass


@dataclass(frozen=True)
class AudioInfo:
    duration_seconds: float
    sample_rate: int
    channels: int
    media_type: str


MEDIA_TYPES = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
}


def _validate_signature(path: Path, extension: str) -> None:
    header = path.read_bytes()[:16]
    valid = {
        ".wav": header.startswith(b"RIFF") and header[8:12] == b"WAVE",
        ".flac": header.startswith(b"fLaC"),
        ".ogg": header.startswith(b"OggS"),
        ".mp3": header.startswith(b"ID3")
        or (len(header) >= 2 and header[0] == 0xFF and header[1] & 0xE0 == 0xE0),
        ".m4a": len(header) >= 12 and header[4:8] == b"ftyp",
    }.get(extension, False)
    if not valid:
        raise AudioValidationError("File contents do not match the declared audio format")


def _probe_wav(path: Path) -> AudioInfo:
    try:
        with wave.open(str(path), "rb") as audio:
            sample_rate = audio.getframerate()
            channels = audio.getnchannels()
            frames = audio.getnframes()
    except (wave.Error, EOFError) as exc:
        raise AudioValidationError("Invalid WAV container") from exc
    if sample_rate < 8000 or sample_rate > 384000 or channels < 1 or channels > 16:
        raise AudioValidationError("Unsupported WAV channel count or sample rate")
    return AudioInfo(frames / sample_rate, sample_rate, channels, "audio/wav")


def _probe_ffmpeg(path: Path, extension: str) -> AudioInfo:
    try:
        completed = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "a:0",
                "-show_entries",
                "stream=sample_rate,channels,duration:format=duration",
                "-of",
                "json",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=20,
        )
    except FileNotFoundError as exc:
        raise AudioValidationError("Audio probing is unavailable on this server") from exc
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise AudioValidationError("Audio container could not be decoded") from exc
    payload = json.loads(completed.stdout)
    stream = (payload.get("streams") or [{}])[0]
    duration = stream.get("duration") or payload.get("format", {}).get("duration")
    try:
        info = AudioInfo(
            duration_seconds=float(duration),
            sample_rate=int(stream["sample_rate"]),
            channels=int(stream["channels"]),
            media_type=MEDIA_TYPES[extension],
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise AudioValidationError("Audio metadata is incomplete") from exc
    return info


def probe_audio(path: Path, extension: str) -> AudioInfo:
    extension = extension.lower()
    if extension not in MEDIA_TYPES:
        raise AudioValidationError("Unsupported audio format")
    _validate_signature(path, extension)
    info = _probe_wav(path) if extension == ".wav" else _probe_ffmpeg(path, extension)
    if not 0 < info.duration_seconds <= 60 * 60 * 3:
        raise AudioValidationError("Audio duration is outside the supported range")
    return info
