from fastapi import APIRouter

from .analysis import router as analysis_router
from .auth import router as auth_router
from .exports import router as exports_router
from .health import router as health_router
from .recordings import router as recordings_router
from .scores import router as scores_router
from .transcriptions import router as transcriptions_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(auth_router)
api_router.include_router(recordings_router)
api_router.include_router(transcriptions_router)
api_router.include_router(scores_router)
api_router.include_router(exports_router)
api_router.include_router(analysis_router)
