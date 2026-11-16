import asyncio
import shutil
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Protocol

import boto3
from botocore.config import Config

from .config import Settings


class AssetStorage(Protocol):
    async def put(self, source: Path, key: str, media_type: str) -> None: ...

    async def delete(self, key: str) -> None: ...

    def materialize(self, key: str) -> "AsyncAssetContext": ...


class AsyncAssetContext(Protocol):
    async def __aenter__(self) -> Path: ...

    async def __aexit__(self, exc_type: object, exc: object, traceback: object) -> None: ...


class FilesystemStorage:
    def __init__(self, root: Path):
        self.root = root.resolve()

    def _path(self, key: str) -> Path:
        target = (self.root / key).resolve()
        if self.root not in target.parents:
            raise ValueError("Asset key escapes storage root")
        return target

    async def put(self, source: Path, key: str, media_type: str) -> None:
        del media_type
        target = self._path(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(shutil.move, source, target)

    async def delete(self, key: str) -> None:
        target = self._path(key)
        if target.exists():
            await asyncio.to_thread(target.unlink)

    @asynccontextmanager
    async def materialize(self, key: str) -> AsyncIterator[Path]:
        path = self._path(key)
        if not path.is_file():
            raise FileNotFoundError("Audio asset is missing")
        yield path


class S3Storage:
    def __init__(self, settings: Settings):
        self.bucket = settings.s3_bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            config=Config(s3={"addressing_style": "path"}),
            region_name="us-east-1",
        )

    async def put(self, source: Path, key: str, media_type: str) -> None:
        await asyncio.to_thread(
            self.client.upload_file,
            str(source),
            self.bucket,
            key,
            ExtraArgs={"ContentType": media_type, "ServerSideEncryption": "AES256"},
        )
        source.unlink(missing_ok=True)

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self.client.delete_object, Bucket=self.bucket, Key=key)

    @asynccontextmanager
    async def materialize(self, key: str) -> AsyncIterator[Path]:
        with NamedTemporaryFile(suffix=Path(key).suffix, delete=False) as temporary:
            path = Path(temporary.name)
        try:
            await asyncio.to_thread(self.client.download_file, self.bucket, key, str(path))
            yield path
        finally:
            path.unlink(missing_ok=True)


def get_storage(settings: Settings) -> AssetStorage:
    if settings.storage_backend == "s3":
        return S3Storage(settings)
    return FilesystemStorage(settings.storage_root)
