import asyncio
import shutil
from pathlib import Path
from typing import Protocol

import boto3

from .config import Settings


class AssetStorage(Protocol):
    async def put(self, source: Path, key: str, media_type: str) -> None: ...

    async def delete(self, key: str) -> None: ...


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


class S3Storage:
    def __init__(self, settings: Settings):
        self.bucket = settings.s3_bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
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


def get_storage(settings: Settings) -> AssetStorage:
    if settings.storage_backend == "s3":
        return S3Storage(settings)
    return FilesystemStorage(settings.storage_root)
