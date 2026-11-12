"""
Speech-to-text for FrameDesk, using faster-whisper (OpenAI Whisper weights on CTranslate2).

Only the API container talks to this service, over the private Docker network,
with a shared bearer key. With local storage it reads uploaded media straight
from the shared volume (read-only), so videos are never copied over HTTP. With
S3 storage the API sends a short-lived signed link instead, and the file is
downloaded to a temporary file when its turn comes.

  GET    /health                 model status
  POST   /jobs                   {storageKey | url, language?, task?} -> {id}   (long files, queued)
  GET    /jobs/{id}?start=N      status, progress and segments N.. so far
  DELETE /jobs/{id}              cancel / forget
  POST   /dictation?language=xx  raw audio body (short clip) -> {text, language}

Jobs live in memory. If this container restarts, the API sees a 404 for its
job and queues the file again.
"""

import hmac
import io
import logging
import os
import queue
import re
import shutil
import tempfile
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Literal, Optional
from urllib.parse import urlparse

import requests

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from faster_whisper import BatchedInferencePipeline, WhisperModel
from faster_whisper.tokenizer import _LANGUAGE_CODES
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO").upper())
log = logging.getLogger("whisper")

API_KEY = os.environ.get("WHISPER_API_KEY", "")
if len(API_KEY) < 24:
    raise SystemExit("WHISPER_API_KEY must be set (at least 24 characters)")

STORAGE_DIR = os.path.realpath(os.environ.get("STORAGE_DIR", "/data/uploads"))
# large-v3-turbo: large-v3's encoder with a 4-layer decoder. Several times
# faster than large-v3 on a CPU with nearly the same accuracy.
MODEL_NAME = os.environ.get("WHISPER_MODEL", "large-v3-turbo")
DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE") or ("int8" if DEVICE == "cpu" else "float16")


def usable_cores() -> int:
    try:
        return len(os.sched_getaffinity(0))
    except AttributeError:  # not Linux
        return os.cpu_count() or 4


# faster-whisper treats 0 as "4 threads", not "all cores", so resolve it here.
CPU_THREADS = int(os.environ.get("WHISPER_CPU_THREADS", "0")) or usable_cores()
# Greedy decoding (1) is much faster on a CPU; beam search (5) is slightly more accurate.
BEAM_SIZE = int(os.environ.get("WHISPER_BEAM_SIZE", "1" if DEVICE == "cpu" else "5"))
# Long files are cut at pauses into ~30 s pieces that are decoded several at a
# time, which keeps every core busy. 0 turns batching off (one piece after another).
BATCH_SIZE = int(os.environ.get("WHISPER_BATCH_SIZE", "8" if DEVICE == "cpu" else "16"))
MAX_DICTATION_BYTES = 25 * 1024 * 1024
MAX_DICTATION_SECONDS = 5 * 60
# Downloads of S3 files: connect quickly, then allow slow chunks of a big video.
DOWNLOAD_TIMEOUT = (10, 120)
DOWNLOAD_CHUNK_BYTES = 8 * 1024 * 1024
# Finished jobs the API never collected are dropped after this long.
FINISHED_JOB_TTL_SECONDS = 6 * 3600

# Same shape the API enforces: "<workspaceId>/<yyyy-mm>/<uuid>". Rules out path traversal.
KEY_PATTERN = re.compile(r"^[a-f\d]{24}/\d{4}-\d{2}/[a-f\d-]{36}$", re.IGNORECASE)

app = FastAPI(title="FrameDesk Whisper", docs_url=None, redoc_url=None, openapi_url=None)

# ---- Model ---------------------------------------------------------------

model: Optional[WhisperModel] = None
batched: Optional[BatchedInferencePipeline] = None
model_state = {"status": "loading", "error": None}


def load_model():
    global model, batched
    try:
        log.info(
            "Loading %s on %s (%s, %d threads, beam %d, batch %d); the first start downloads it",
            MODEL_NAME, DEVICE, COMPUTE_TYPE, CPU_THREADS, BEAM_SIZE, BATCH_SIZE,
        )
        # Two workers: one for queued files, one for dictation, so a short voice
        # note isn't stuck behind a two-hour video.
        model = WhisperModel(
            MODEL_NAME,
            device=DEVICE,
            compute_type=COMPUTE_TYPE,
            cpu_threads=CPU_THREADS,
            num_workers=2,
            download_root=os.environ.get("WHISPER_MODEL_DIR", "/models"),
        )
        if BATCH_SIZE > 0:
            batched = BatchedInferencePipeline(model=model)
        model_state["status"] = "ready"
        log.info("Model ready")
    except Exception as exc:  # noqa: BLE001 - surfaced through /health
        log.exception("Model failed to load")
        model_state.update(status="error", error=str(exc))


threading.Thread(target=load_model, daemon=True).start()


def require_model() -> WhisperModel:
    if model is None:
        raise HTTPException(503, f"Model is {model_state['status']}")
    return model


# ---- Auth ----------------------------------------------------------------


def check_key(authorization: str = Header(default="")):
    token = authorization.removeprefix("Bearer ").strip()
    if not hmac.compare_digest(token.encode(), API_KEY.encode()):
        raise HTTPException(401, "Bad key")


def check_language(language: Optional[str]) -> Optional[str]:
    if language and language not in _LANGUAGE_CODES:
        raise HTTPException(400, f"Unknown language code: {language}")
    return language or None


# ---- File jobs -----------------------------------------------------------


@dataclass
class Job:
    id: str
    # A file on the shared volume, or None when it has to be downloaded from url.
    path: Optional[str]
    language: Optional[str]
    task: str
    status: str = "queued"  # queued | running | done | failed | cancelled
    progress: float = 0.0
    detected_language: Optional[str] = None
    duration: Optional[float] = None
    segments: list = field(default_factory=list)
    error: Optional[str] = None
    finished_at: Optional[float] = None
    url: Optional[str] = None


jobs: dict[str, Job] = {}
jobs_lock = threading.Lock()
job_queue: "queue.Queue[str]" = queue.Queue()


def download(url: str) -> str:
    # Streams the file to disk; a long video would not fit in memory.
    handle, path = tempfile.mkstemp(prefix="framedesk-", suffix=".media")
    try:
        with os.fdopen(handle, "wb") as out, requests.get(url, stream=True, timeout=DOWNLOAD_TIMEOUT) as response:
            if response.status_code != 200:
                raise RuntimeError(f"Could not download the file (HTTP {response.status_code})")
            shutil.copyfileobj(response.raw, out, DOWNLOAD_CHUNK_BYTES)
        return path
    except BaseException:
        os.remove(path)
        raise


def run_job(job: Job):
    if job.path:
        transcribe(job, job.path)
        return
    path = download(job.url)
    try:
        if job.status != "cancelled":
            transcribe(job, path)
    finally:
        os.remove(path)


def transcribe(job: Job, path: str):
    whisper = require_model()
    options = dict(
        language=job.language,
        task=job.task,
        beam_size=BEAM_SIZE,
        vad_filter=True,  # skips silence: faster, and fewer made-up lines
    )
    if batched is not None:
        # Keep timestamps inside each piece, so lines stay short for subtitles.
        segments, info = batched.transcribe(
            path, batch_size=BATCH_SIZE, without_timestamps=False, **options
        )
    else:
        segments, info = whisper.transcribe(path, **options)
    job.detected_language = info.language
    job.duration = info.duration
    for segment in segments:  # lazy: each step decodes the next piece
        if job.status == "cancelled":
            return
        text = segment.text.strip()
        if text:
            job.segments.append({"start": round(segment.start, 2), "end": round(segment.end, 2), "text": text})
        if info.duration:
            job.progress = min(0.99, segment.end / info.duration)
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
    task: Literal["transcribe", "translate"] = "transcribe"


@app.get("/health")
def health():
    return {"status": model_state["status"], "error": model_state["error"], "model": MODEL_NAME, "device": DEVICE}


@app.post("/jobs", dependencies=[Depends(check_key)], status_code=201)
def create_job(body: JobRequest):
    language = check_language(body.language)
    if body.url:
        if urlparse(body.url).scheme not in ("https", "http"):
            raise HTTPException(400, "The file link must be http(s)")
        job = Job(id=uuid.uuid4().hex, path=None, url=body.url, language=language, task=body.task)
    else:
        if not body.storageKey or not KEY_PATTERN.match(body.storageKey):
            raise HTTPException(400, "Invalid storage key")
        path = os.path.join(STORAGE_DIR, *body.storageKey.split("/"))
        if not os.path.isfile(path):
            raise HTTPException(404, "File not found on the shared volume")
        job = Job(id=uuid.uuid4().hex, path=path, language=language, task=body.task)
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
        "progress": round(job.progress, 4),
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
        job.status = "cancelled"  # the worker stops at the next segment
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
    whisper = require_model()

    def transcribe_clip():
        with dictation_slot:
            segments, info = whisper.transcribe(
                io.BytesIO(audio), language=language, beam_size=BEAM_SIZE, vad_filter=True
            )
            if info.duration > MAX_DICTATION_SECONDS:
                raise HTTPException(413, "Recordings can be up to 5 minutes")
            text = " ".join(segment.text.strip() for segment in segments).strip()
            return {"text": text, "language": info.language, "duration": info.duration}

    try:
        return await run_in_threadpool(transcribe_clip)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 - usually an unreadable recording
        log.warning("Dictation failed: %s", exc)
        raise HTTPException(422, "Could not read that recording") from exc
