from celery import Celery
from frasi_api.config import get_settings

settings = get_settings()

celery_app = Celery(
    "frasi-worker",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["frasi_worker.tasks"],
)
celery_app.conf.update(
    task_default_queue=settings.task_queue,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_track_started=True,
    result_expires=86_400,
    broker_connection_retry_on_startup=True,
)
