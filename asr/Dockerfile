# Speech-to-text service (Qwen3-ASR-1.7B on PyTorch). Built by docker-compose.yml as "asr".
# CPU by default. For an NVIDIA GPU: docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
FROM python:3.12-slim
ARG WITH_CUDA=false
ARG TORCH_VERSION=2.8.0
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    HF_HOME=/models
# ffmpeg reads the audio out of any video; sox and libsndfile are used by qwen-asr.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg sox libsndfile1 \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt ./
# The CPU wheel is ~200 MB instead of several GB of CUDA libraries.
RUN if [ "$WITH_CUDA" = "true" ]; then index=https://download.pytorch.org/whl/cu128; \
    else index=https://download.pytorch.org/whl/cpu; fi \
 && pip install "torch==$TORCH_VERSION" --index-url "$index" \
 && pip install -r requirements.txt
COPY app.py start.sh ./
# Same uid as the API's "node" user (1000), so both can read the shared volume.
RUN useradd --uid 1000 --create-home asr && mkdir -p /models && chown asr /models \
 && sed -i 's/\r$//' start.sh && chmod +x start.sh
USER asr
EXPOSE 9000
# Loading the models takes a while on a CPU; /health answers meanwhile.
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:9000/health').status==200 else 1)"
CMD ["./start.sh"]
