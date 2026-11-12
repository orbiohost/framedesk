# Speech-to-text service (faster-whisper). Built by docker-compose.yml as "whisper".
# CPU by default. For an NVIDIA GPU: docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
FROM python:3.12-slim
ARG WITH_CUDA=false
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    HF_HOME=/models WHISPER_MODEL_DIR=/models
WORKDIR /app
COPY requirements.txt requirements-cuda.txt ./
RUN pip install -r requirements.txt \
 && if [ "$WITH_CUDA" = "true" ]; then pip install -r requirements-cuda.txt; fi
COPY app.py start.sh ./
# Same uid as the API's "node" user (1000), so both can read the shared volume.
RUN useradd --uid 1000 --create-home whisper && mkdir -p /models && chown whisper /models \
 && sed -i 's/\r$//' start.sh && chmod +x start.sh
USER whisper
EXPOSE 9000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:9000/health').status==200 else 1)"
CMD ["./start.sh"]
