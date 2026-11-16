"""Create Frasi's private S3 bucket after the object store becomes available."""

from __future__ import annotations

import os
import time

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError, EndpointConnectionError


def main() -> None:
    endpoint = os.environ["FRASI_S3_ENDPOINT"]
    bucket = os.environ["FRASI_S3_BUCKET"]
    client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=os.environ["FRASI_S3_ACCESS_KEY"],
        aws_secret_access_key=os.environ["FRASI_S3_SECRET_KEY"],
        config=Config(s3={"addressing_style": "path"}),
        region_name="us-east-1",
    )

    last_error: Exception | None = None
    for attempt in range(1, 31):
        try:
            client.head_bucket(Bucket=bucket)
            print(f"Object bucket {bucket!r} is ready.", flush=True)
            return
        except ClientError as exc:
            status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
            if status in {403, 404}:
                try:
                    client.create_bucket(Bucket=bucket)
                    print(f"Created private object bucket {bucket!r}.", flush=True)
                    return
                except (ClientError, EndpointConnectionError) as create_error:
                    last_error = create_error
            else:
                last_error = exc
        except EndpointConnectionError as exc:
            last_error = exc

        print(f"Waiting for object storage ({attempt}/30)...", flush=True)
        time.sleep(2)

    raise RuntimeError("Object storage did not become ready") from last_error


if __name__ == "__main__":
    main()
