FROM python:3.12.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    NUMBA_CACHE_DIR=/tmp/numba-cache

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ffmpeg libsndfile1 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 frasi

WORKDIR /app
COPY services/api ./services/api
COPY services/worker ./services/worker
COPY ml ./ml
RUN --mount=type=cache,target=/root/.cache/pip \
    python -m pip install ./services/api ./ml ./services/worker \
    && mkdir -p /data/assets /tmp/numba-cache \
    && chown -R frasi:frasi /app /data /tmp/numba-cache

USER frasi
CMD ["celery", "--app", "frasi_worker.celery_app:celery_app", "worker", "--loglevel=INFO", "--queues=transcription", "--concurrency=1"]
