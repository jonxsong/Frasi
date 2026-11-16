from celery import Celery

from .config import get_settings

settings = get_settings()
celery_client = Celery("frasi-api", broker=settings.redis_url, backend=settings.redis_url)


def dispatch_job(job_id: str) -> None:
    celery_client.send_task("frasi.transcribe", args=[job_id], queue=settings.task_queue)
