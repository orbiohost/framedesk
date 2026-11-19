#!/bin/sh
set -e
# One process: the model sits in memory once and jobs share it.
# Lower CPU priority: transcription uses every core, but the API and web
# server on the same machine still answer at once (no slow page loads).
exec nice -n "${ASR_NICE:-10}" uvicorn app:app --host 0.0.0.0 --port 9000 --workers 1 --no-access-log
