"""
Speech-to-text for FrameDesk, using Qwen3-ASR-1.7B (run locally with PyTorch),
plus Qwen3-ForcedAligner-0.6B for word timings, so subtitle lines get real
start and end times.

Only the API container talks to this service, over the private Docker network,
with a shared bearer key. With local storage it reads uploaded media straight
from the shared volume (read-only), so videos are never copied over HTTP. With
S3 storage the API sends a short-lived signed link instead, and the file is
downloaded to a temporary file when its turn comes.

  GET    /health                 model status
  POST   /jobs                   {storageKey | url, language?} -> {id}   (long files, queued)
  GET    /jobs/{id}?start=N      status, progress and segments N.. so far
  DELETE /jobs/{id}              cancel / forget
  POST   /dictation?language=xx  raw audio body (short clip) -> {text, language}

Languages are ISO codes (en, hi, ...) on the wire, the same as before. Qwen3-ASR
does not translate: the API translates "translate" jobs itself, so `task` is
accepted and ignored here.

Jobs live in memory. If this container restarts, the API sees a 404 for its
job and queues the file again.
"""

import hmac
import logging
import os
import queue
import re
import subprocess
import tempfile
import threading
import time
import unicodedata
import uuid
from collections import Counter
from dataclasses import dataclass, field
from typing import Literal, Optional
from urllib.parse import urlparse

import numpy as np
import requests
import torch
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from pydantic import BaseModel
from qwen_asr import Qwen3ASRModel, Qwen3ForcedAligner
from qwen_asr.inference.utils import split_audio_into_chunks
from starlette.concurrency import run_in_threadpool

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO").upper())
log = logging.getLogger("asr")

API_KEY = os.environ.get("ASR_API_KEY", "")
if len(API_KEY) < 24:
    raise SystemExit("ASR_API_KEY must be set (at least 24 characters)")

STORAGE_DIR = os.path.realpath(os.environ.get("STORAGE_DIR", "/data/uploads"))
MODEL_NAME = os.environ.get("ASR_MODEL", "Qwen/Qwen3-ASR-1.7B")
# Word timings for subtitles. Empty turns it off: lines then get estimated
# times inside each ~30 s piece (less RAM, a little faster).
ALIGNER_NAME = os.environ.get("ASR_ALIGNER", "Qwen/Qwen3-ForcedAligner-0.6B")
DEVICE = os.environ.get("ASR_DEVICE", "cpu")
# float32 is the safe choice on a CPU (bfloat16 is only fast on CPUs with
# AVX-512 BF16 / AMX); bfloat16 on a GPU.
DTYPE_NAME = os.environ.get("ASR_DTYPE") or ("float32" if DEVICE == "cpu" else "bfloat16")
DTYPE = {"float32": torch.float32, "bfloat16": torch.bfloat16, "float16": torch.float16}[DTYPE_NAME]


def usable_cores() -> int:
    try:
        return len(os.sched_getaffinity(0))
    except AttributeError:  # not Linux
        return os.cpu_count() or 4


CPU_THREADS = int(os.environ.get("ASR_CPU_THREADS", "0")) or usable_cores()
# Pieces of a long file decoded at once. Larger is faster on a GPU; on a CPU it
# mostly costs memory.
BATCH_SIZE = max(1, int(os.environ.get("ASR_BATCH_SIZE", "1" if DEVICE == "cpu" else "16")))
# Seconds of work per second of audio, used to move the progress bar while a
# batch is decoding, until the real speed of this machine has been measured.
EXPECTED_RTF = float(os.environ.get("ASR_EXPECTED_RTF", "2.5" if DEVICE == "cpu" else "0.15"))
# Share of the bar for getting the audio ready (download + decode); the rest is transcription.
PREPARE_SHARE = 0.05
# Long files are cut at quiet moments into pieces about this long (the aligner
# takes up to 180 s; shorter pieces show progress sooner).
PIECE_SECONDS = float(os.environ.get("ASR_PIECE_SECONDS", "30"))
SAMPLE_RATE = 16000
MAX_DICTATION_BYTES = 25 * 1024 * 1024
MAX_DICTATION_SECONDS = 5 * 60
# Pieces quieter than this (RMS of the waveform in [-1, 1]) are treated as
# silence and skipped: faster, and no made-up lines.
SILENCE_RMS = float(os.environ.get("ASR_SILENCE_RMS", "0.002"))
# Subtitle line limits.
LINE_MAX_CHARS = 84
LINE_MAX_SECONDS = 7.0
LINE_PAUSE_SECONDS = 0.8
# Downloads of S3 files: connect quickly, then allow slow chunks of a big video.
DOWNLOAD_TIMEOUT = (10, 120)
DOWNLOAD_CHUNK_BYTES = 8 * 1024 * 1024
# Finished jobs the API never collected are dropped after this long.
FINISHED_JOB_TTL_SECONDS = 6 * 3600

# Same shape the API enforces: "<workspaceId>/<yyyy-mm>/<uuid>". Rules out path traversal.
KEY_PATTERN = re.compile(r"^[a-f\d]{24}/\d{4}-\d{2}/[a-f\d-]{36}$", re.IGNORECASE)

# The 30 languages Qwen3-ASR knows, ISO code -> the name the model uses.
LANGUAGES = {
    "zh": "Chinese", "en": "English", "yue": "Cantonese", "ar": "Arabic", "de": "German",
    "fr": "French", "es": "Spanish", "pt": "Portuguese", "id": "Indonesian", "it": "Italian",
    "ko": "Korean", "ru": "Russian", "th": "Thai", "vi": "Vietnamese", "ja": "Japanese",
    "tr": "Turkish", "hi": "Hindi", "ms": "Malay", "nl": "Dutch", "sv": "Swedish",
    "da": "Danish", "fi": "Finnish", "pl": "Polish", "cs": "Czech", "fil": "Filipino",
    "fa": "Persian", "el": "Greek", "hu": "Hungarian", "mk": "Macedonian", "ro": "Romanian",
}
LANGUAGE_CODES = {name: code for code, name in LANGUAGES.items()}
# The forced aligner covers fewer languages; the rest get estimated line times.
ALIGNER_LANGUAGES = {
    "Chinese", "English", "Cantonese", "French", "German", "Italian",
    "Japanese", "Korean", "Portuguese", "Russian", "Spanish",
}

app = FastAPI(title="FrameDesk ASR", docs_url=None, redoc_url=None, openapi_url=None)

# ---- Model ---------------------------------------------------------------

model: Optional[Qwen3ASRModel] = None
aligner: Optional[Qwen3ForcedAligner] = None
model_state = {"status": "loading", "error": None}


def load_model():
    global model, aligner
    try:
        torch.set_num_threads(CPU_THREADS)
        device_map = "cuda:0" if DEVICE == "cuda" else DEVICE
        log.info(
            "Loading %s%s on %s (%s, %d threads, batch %d); the first start downloads it",
            MODEL_NAME, f" + {ALIGNER_NAME}" if ALIGNER_NAME else "", DEVICE, DTYPE_NAME,
            CPU_THREADS, BATCH_SIZE,
        )
        model = Qwen3ASRModel.from_pretrained(
            MODEL_NAME,
            dtype=DTYPE,
            device_map=device_map,
            max_inference_batch_size=BATCH_SIZE,
            # ~30 s of speech is well under 256 tokens; leave room for fast talkers.
            max_new_tokens=512,
        )
        if ALIGNER_NAME:
            aligner = Qwen3ForcedAligner.from_pretrained(ALIGNER_NAME, dtype=DTYPE, device_map=device_map)
        model_state["status"] = "ready"
        log.info("Model ready")
    except Exception as exc:  # noqa: BLE001 - surfaced through /health
        log.exception("Model failed to load")
        model_state.update(status="error", error=str(exc))


threading.Thread(target=load_model, daemon=True).start()


def require_model() -> Qwen3ASRModel:
    if model is None:
        raise HTTPException(503, f"Model is {model_state['status']}")
    return model


# ---- Auth ----------------------------------------------------------------


def check_key(authorization: str = Header(default="")):
    token = authorization.removeprefix("Bearer ").strip()
    if not hmac.compare_digest(token.encode(), API_KEY.encode()):
        raise HTTPException(401, "Bad key")


def check_language(language: Optional[str]) -> Optional[str]:
    """ISO code in, the model's language name out (None = detect)."""
    if not language:
        return None
    name = LANGUAGES.get(language.lower())
    if not name:
        raise HTTPException(400, f"Qwen3-ASR does not support the language '{language}'")
    return name


def to_code(name: Optional[str]) -> Optional[str]:
    # The model may report a mix, e.g. "Chinese,English"; the first one leads.
    first = (name or "").split(",")[0].strip()
    return LANGUAGE_CODES.get(first)


# ---- Audio ---------------------------------------------------------------


def decode_audio(path: str) -> np.ndarray:
    """Any audio or video file -> 16 kHz mono float32 via ffmpeg."""
    command = [
        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error",
        "-i", path, "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "f32le", "pipe:1",
    ]
    result = subprocess.run(command, capture_output=True, check=False)
    if result.returncode != 0:
        detail = result.stderr.decode(errors="replace").strip().splitlines()
        raise ValueError(detail[-1] if detail else "ffmpeg could not read the file")
    return np.frombuffer(result.stdout, dtype=np.float32)


def decode_bytes(data: bytes) -> np.ndarray:
    # Through a file, not a pipe: phone recordings (mp4/m4a) keep their index
    # at the end, which ffmpeg can't seek to on stdin.
    handle, path = tempfile.mkstemp(prefix="dictation-", suffix=".media")
    try:
        with os.fdopen(handle, "wb") as out:
            out.write(data)
        return decode_audio(path)
    finally:
        os.remove(path)


def is_silent(wav: np.ndarray) -> bool:
    return wav.size == 0 or float(np.sqrt(np.mean(np.square(wav, dtype=np.float64)))) < SILENCE_RMS


# ---- Subtitle lines --------------------------------------------------------


def is_kept_char(ch: str) -> bool:
    # Same rule the aligner uses to clean words: letters, numbers and apostrophes.
    return ch == "'" or unicodedata.category(ch)[0] in ("L", "N")


# Includes the Devanagari danda (Hindi) and the Arabic/Urdu question mark and full stop.
SENTENCE_END = set(".!?。！？…।॥؟۔")
SOFT_BREAK = set(",;:，；：、،")


def split_text(text: str) -> list:
    """Text -> subtitle-sized lines, at sentence ends, else at spaces."""
    lines, current = [], ""
    for word in re.findall(r"\S+\s*", text) if " " in text.strip() else list(text):
        current += word
        stripped = current.strip()
        if stripped and (stripped[-1] in SENTENCE_END or len(stripped) >= LINE_MAX_CHARS):
            lines.append(stripped)
            current = ""
    if current.strip():
        lines.append(current.strip())
    return lines


def estimated_segments(text: str, start: float, end: float) -> list:
    """No word timings: spread the piece's lines over it by length."""
    lines = split_text(text)
    total = sum(len(line) for line in lines) or 1
    segments, cursor = [], start
    for line in lines:
        length = (end - start) * len(line) / total
        segments.append({"start": round(cursor, 2), "end": round(cursor + length, 2), "text": line})
        cursor += length
    return segments


def aligned_segments(text: str, items, offset: float) -> Optional[list]:
    """
    Word timings -> subtitle lines that keep the punctuation of `text`.
    The aligner's words are the transcript's letters and numbers, in order, so
    each word maps back onto a span of the original text. None if they don't line up.
    """
    kept_positions = [i for i, ch in enumerate(text) if is_kept_char(ch)]
    words, cursor = [], 0
    for item in items:
        length = len(item.text)
        if not length:
            continue
        if cursor + length > len(kept_positions):
            return None
        span = kept_positions[cursor:cursor + length]
        if "".join(text[i] for i in span).lower() != item.text.lower():
            return None
        words.append((span[0], span[-1] + 1, float(item.start_time), float(item.end_time)))
        cursor += length
    if not words or cursor != len(kept_positions):
        return None

    segments, first = [], 0
    for k, (_, word_end, _, end_time) in enumerate(words):
        last = k == len(words) - 1
        if not last:
            next_start_pos, _, next_start_time, _ = words[k + 1]
            between = text[word_end:next_start_pos]
            line_chars = word_end - words[first][0]
            line_seconds = end_time - words[first][2]
            if not (
                any(ch in SENTENCE_END for ch in between)
                or (line_chars > LINE_MAX_CHARS / 2 and any(ch in SOFT_BREAK for ch in between))
                or line_chars >= LINE_MAX_CHARS
                or line_seconds >= LINE_MAX_SECONDS
                or next_start_time - end_time >= LINE_PAUSE_SECONDS
            ):
                continue
        # The line runs from its first word (or the text's start) to the next line's first word.
        line_from = 0 if first == 0 else words[first][0]
        line_to = len(text) if last else words[k + 1][0]
        line = text[line_from:line_to].strip()
        if line:
            start_time = words[first][2]
            segments.append({
                "start": round(offset + start_time, 2),
                "end": round(offset + max(end_time, start_time + 0.2), 2),
                "text": line,
            })
        first = k + 1
    return segments


def transcribe_pieces(asr: Qwen3ASRModel, pieces: list, language: Optional[str]) -> list:
    """[(wav, offset_sec)] -> [(segments, language name)], one per piece."""
    results = asr.transcribe(audio=[(wav, SAMPLE_RATE) for wav, _ in pieces], language=language)
    texts = [r.text.strip() for r in results]
    names = [language or (r.language or "").split(",")[0].strip() for r in results]

    timings = [None] * len(pieces)
    if aligner is not None:
        todo = [i for i, (t, n) in enumerate(zip(texts, names)) if t and n in ALIGNER_LANGUAGES]
        if todo:
            try:
                aligned = aligner.align(
                    audio=[(pieces[i][0], SAMPLE_RATE) for i in todo],
                    text=[texts[i] for i in todo],
                    language=[names[i] for i in todo],
                )
                for i, items in zip(todo, aligned):
                    timings[i] = items
            except Exception:  # noqa: BLE001 - fall back to estimated times
                log.warning("Alignment failed; using estimated line times", exc_info=True)

    out = []
    for (wav, offset), text, name, items in zip(pieces, texts, names, timings):
        if not text:
            out.append(([], name))
            continue
        segments = aligned_segments(text, items, offset) if items is not None else None
        if segments is None:
            segments = estimated_segments(text, offset, offset + len(wav) / SAMPLE_RATE)
        out.append((segments, name))
    return out


# ---- File jobs -----------------------------------------------------------


@dataclass
class Job:
    id: str
    # A file on the shared volume, or None when it has to be downloaded from url.
    path: Optional[str]
    language: Optional[str]  # the model's name for it, or None = detect
    status: str = "queued"  # queued | running | done | failed | cancelled
    progress: float = 0.0  # settled progress; job_progress() adds the running estimate
    detected_language: Optional[str] = None
    duration: Optional[float] = None
    segments: list = field(default_factory=list)
    error: Optional[str] = None
    finished_at: Optional[float] = None
    url: Optional[str] = None
    # Live progress inside the current step.
    audio_done: float = 0.0  # seconds of audio finished
    batch_audio: float = 0.0  # seconds of audio in the batch being decoded
    batch_started: Optional[float] = None
    rtf: float = EXPECTED_RTF  # measured seconds of work per second of audio


def job_progress(job: Job) -> float:
    """Settled progress plus an estimate for the batch being decoded right now."""
    if job.status != "running" or not job.duration or job.batch_started is None:
        return job.progress
    elapsed = time.monotonic() - job.batch_started
    expected = max(1.0, job.rtf * job.batch_audio)
    # Approaches the end of the batch but never claims it before it's done.
    partial = job.batch_audio * min(0.95, elapsed / expected)
    done = (job.audio_done + partial) / job.duration
    return min(0.99, max(job.progress, PREPARE_SHARE + (1 - PREPARE_SHARE) * done))


jobs: dict[str, Job] = {}
jobs_lock = threading.Lock()
job_queue: "queue.Queue[str]" = queue.Queue()


def download(job: Job) -> str:
    # Streams the file to disk; a long video would not fit in memory.
    handle, path = tempfile.mkstemp(prefix="framedesk-", suffix=".media")
    try:
        with os.fdopen(handle, "wb") as out, requests.get(job.url, stream=True, timeout=DOWNLOAD_TIMEOUT) as response:
            if response.status_code != 200:
                raise RuntimeError(f"Could not download the file (HTTP {response.status_code})")
            total = int(response.headers.get("Content-Length") or 0)
            received = 0
            for chunk in response.iter_content(DOWNLOAD_CHUNK_BYTES):
                if job.status == "cancelled":
                    break
                out.write(chunk)
                received += len(chunk)
                if total:
                    # The download fills the first part of the bar's "getting ready" share.
                    job.progress = PREPARE_SHARE * 0.8 * min(1.0, received / total)
        return path
    except BaseException:
        os.remove(path)
        raise


def run_job(job: Job):
    if job.path:
        transcribe(job, job.path)
        return
    path = download(job)
    try:
        if job.status != "cancelled":
            transcribe(job, path)
    finally:
        os.remove(path)


def transcribe(job: Job, path: str):
    asr = require_model()
    try:
        wav = decode_audio(path)
    except ValueError as exc:
        raise RuntimeError(f"Could not read the audio: {exc}") from exc
    duration = len(wav) / SAMPLE_RATE
    job.duration = round(duration, 2)
    if duration < 0.1:
        raise RuntimeError("The file has no audio")
    job.progress = PREPARE_SHARE

    pieces = split_audio_into_chunks(wav=wav, sr=SAMPLE_RATE, max_chunk_sec=PIECE_SECONDS)
    spoken = Counter()
    work_seconds = audio_measured = 0.0
    for start in range(0, len(pieces), BATCH_SIZE):
        if job.status == "cancelled":
            return
        group = pieces[start:start + BATCH_SIZE]
        group_audio = sum(len(wav) for wav, _ in group) / SAMPLE_RATE
        batch = [piece for piece in group if not is_silent(piece[0])]
        if batch:
            job.batch_audio = sum(len(wav) for wav, _ in batch) / SAMPLE_RATE
            job.batch_started = time.monotonic()
            for segments, name in transcribe_pieces(asr, batch, job.language):
                job.segments.extend(segments)
                if segments and name:
                    spoken[name] += 1
            job.detected_language = to_code(job.language or (spoken.most_common(1)[0][0] if spoken else None))
            # Learn this machine's real speed, so the estimate gets better as it goes.
            work_seconds += time.monotonic() - job.batch_started
            audio_measured += job.batch_audio
            job.rtf = work_seconds / max(audio_measured, 1.0)
            job.batch_started = None
        job.audio_done += group_audio
        job.progress = min(0.99, PREPARE_SHARE + (1 - PREPARE_SHARE) * job.audio_done / duration)
    job.progress = 1.0
    job.status = "done"


def file_worker():
    while True:
        job_id = job_queue.get()
        job = jobs.get(job_id)
        if not job or job.status != "queued":
            continue
        if model is None:
            # Still loading: wait, then try again.
            time.sleep(5)
            job_queue.put(job_id)
            continue
        job.status = "running"
        started = time.monotonic()
        try:
            run_job(job)
            log.info("Job %s %s in %.0fs", job.id, job.status, time.monotonic() - started)
        except Exception as exc:  # noqa: BLE001 - reported to the API
            log.exception("Job %s failed", job.id)
            job.status = "failed"
            job.error = str(exc)[:500] or "Transcription failed"
        finally:
            job.finished_at = time.time()


def cleanup_worker():
    while True:
        time.sleep(600)
        cutoff = time.time() - FINISHED_JOB_TTL_SECONDS
        with jobs_lock:
            for job_id in [j.id for j in jobs.values() if j.finished_at and j.finished_at < cutoff]:
                del jobs[job_id]


threading.Thread(target=file_worker, daemon=True).start()
threading.Thread(target=cleanup_worker, daemon=True).start()


class JobRequest(BaseModel):
    # One or the other: a key on the shared volume, or a signed http(s) link.
    storageKey: Optional[str] = None
    url: Optional[str] = None
    language: Optional[str] = None
    # Translation happens in the API; accepted for compatibility.
    task: Literal["transcribe", "translate"] = "transcribe"


@app.get("/health")
def health():
    return {
        "status": model_state["status"],
        "error": model_state["error"],
        "model": MODEL_NAME,
        "aligner": ALIGNER_NAME or None,
        "device": DEVICE,
        "languages": sorted(LANGUAGES),
    }


@app.post("/jobs", dependencies=[Depends(check_key)], status_code=201)
def create_job(body: JobRequest):
    language = check_language(body.language)
    if body.url:
        if urlparse(body.url).scheme not in ("https", "http"):
            raise HTTPException(400, "The file link must be http(s)")
        job = Job(id=uuid.uuid4().hex, path=None, url=body.url, language=language)
    else:
        if not body.storageKey or not KEY_PATTERN.match(body.storageKey):
            raise HTTPException(400, "Invalid storage key")
        path = os.path.join(STORAGE_DIR, *body.storageKey.split("/"))
        if not os.path.isfile(path):
            raise HTTPException(404, "File not found on the shared volume")
        job = Job(id=uuid.uuid4().hex, path=path, language=language)
    with jobs_lock:
        jobs[job.id] = job
    job_queue.put(job.id)
    return {"id": job.id}


@app.get("/jobs/{job_id}", dependencies=[Depends(check_key)])
def get_job(job_id: str, start: int = 0):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "No such job")
    return {
        "id": job.id,
        "status": job.status,
        "progress": round(job_progress(job), 4),
        "language": job.detected_language,
        "duration": job.duration,
        "segments": job.segments[max(0, start):],
        "error": job.error,
    }


@app.delete("/jobs/{job_id}", dependencies=[Depends(check_key)])
def delete_job(job_id: str):
    with jobs_lock:
        job = jobs.pop(job_id, None)
    if job and job.status in ("queued", "running"):
        job.status = "cancelled"  # the worker stops after the current batch
    return {"deleted": job is not None}


# ---- Dictation (short clips, answered right away) -------------------------

dictation_slot = threading.Semaphore(1)


@app.post("/dictation", dependencies=[Depends(check_key)])
async def dictation(request: Request, language: Optional[str] = None):
    language = check_language(language)
    audio = await request.body()
    if not audio:
        raise HTTPException(400, "Empty recording")
    if len(audio) > MAX_DICTATION_BYTES:
        raise HTTPException(413, "Recording is too long")
    asr = require_model()

    def transcribe_clip():
        wav = decode_bytes(audio)
        duration = len(wav) / SAMPLE_RATE
        if duration > MAX_DICTATION_SECONDS:
            raise HTTPException(413, "Recordings can be up to 5 minutes")
        if is_silent(wav):
            return {"text": "", "language": to_code(language), "duration": round(duration, 2)}
        with dictation_slot:
            result = asr.transcribe(audio=(wav, SAMPLE_RATE), language=language)[0]
        return {
            "text": result.text.strip(),
            "language": to_code(language or result.language),
            "duration": round(duration, 2),
        }

    try:
        return await run_in_threadpool(transcribe_clip)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 - usually an unreadable recording
        log.warning("Dictation failed: %s", exc)
        raise HTTPException(422, "Could not read that recording") from exc
