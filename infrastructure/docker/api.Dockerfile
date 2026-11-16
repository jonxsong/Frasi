FROM python:3.12.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
    && apt-get install --yes --no-install-recommends curl ffmpeg libsndfile1 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 frasi

WORKDIR /app
COPY services/api ./services/api
COPY infrastructure/scripts/init_object_storage.py ./infrastructure/scripts/init_object_storage.py
RUN --mount=type=cache,target=/root/.cache/pip \
    python -m pip install ./services/api \
    && mkdir -p /data/assets \
    && chown -R frasi:frasi /app /data

USER frasi
WORKDIR /app/services/api
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && uvicorn frasi_api.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'"]
