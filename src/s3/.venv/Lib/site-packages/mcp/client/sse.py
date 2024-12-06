import logging
from contextlib import asynccontextmanager
from typing import Any
from urllib.parse import urljoin, urlparse

import anyio
import httpx
from anyio.abc import TaskStatus
from anyio.streams.memory import MemoryObjectReceiveStream, MemoryObjectSendStream
from httpx_sse import aconnect_sse

import mcp.types as types

logger = logging.getLogger(__name__)


def remove_request_params(url: str) -> str:
    return urljoin(url, urlparse(url).path)


@asynccontextmanager
async def sse_client(
    url: str,
    headers: dict[str, Any] | None = None,
    timeout: float = 5,
    sse_read_timeout: float = 60 * 5,
):
    """
    Client transport for SSE.

    `sse_read_timeout` determines how long (in seconds) the client will wait for a new
    event before disconnecting. All other HTTP operations are controlled by `timeout`.
    """
    read_stream: MemoryObjectReceiveStream[types.JSONRPCMessage | Exception]
    read_stream_writer: MemoryObjectSendStream[types.JSONRPCMessage | Exception]

    write_stream: MemoryObjectSendStream[types.JSONRPCMessage]
    write_stream_reader: MemoryObjectReceiveStream[types.JSONRPCMessage]

    read_stream_writer, read_stream = anyio.create_memory_object_stream(0)
    write_stream, write_stream_reader = anyio.create_memory_object_stream(0)

    async with anyio.create_task_group() as tg:
        try:
            logger.info(f"Connecting to SSE endpoint: {remove_request_params(url)}")
            async with httpx.AsyncClient(headers=headers) as client:
                async with aconnect_sse(
                    client,
                    "GET",
                    url,
                    timeout=httpx.Timeout(timeout, read=sse_read_timeout),
                ) as event_source:
                    event_source.response.raise_for_status()
                    logger.debug("SSE connection established")

                    async def sse_reader(
                        task_status: TaskStatus[str] = anyio.TASK_STATUS_IGNORED,
                    ):
                        try:
                            async for sse in event_source.aiter_sse():
                                logger.debug(f"Received SSE event: {sse.event}")
                                match sse.event:
                                    case "endpoint":
                                        endpoint_url = urljoin(url, sse.data)
                                        logger.info(
                                            f"Received endpoint URL: {endpoint_url}"
                                        )

                                        url_parsed = urlparse(url)
                                        endpoint_parsed = urlparse(endpoint_url)
                                        if (
                                            url_parsed.netloc != endpoint_parsed.netloc
                                            or url_parsed.scheme
                                            != endpoint_parsed.scheme
                                        ):
                                            error_msg = (
                                                "Endpoint origin does not match "
                                                f"connection origin: {endpoint_url}"
                                            )
                                            logger.error(error_msg)
                                            raise ValueError(error_msg)

                                        task_status.started(endpoint_url)

                                    case "message":
                                        try:
                                            message = types.JSONRPCMessage.model_validate_json(  # noqa: E501
                                                sse.data
                                            )
                                            logger.debug(
                                                f"Received server message: {message}"
                                            )
                                        except Exception as exc:
                                            logger.error(
                                                f"Error parsing server message: {exc}"
                                            )
                                            await read_stream_writer.send(exc)
                                            continue

                                        await read_stream_writer.send(message)
                        except Exception as exc:
                            logger.error(f"Error in sse_reader: {exc}")
                            await read_stream_writer.send(exc)
                        finally:
                            await read_stream_writer.aclose()

                    async def post_writer(endpoint_url: str):
                        try:
                            async with write_stream_reader:
                                async for message in write_stream_reader:
                                    logger.debug(f"Sending client message: {message}")
                                    response = await client.post(
                                        endpoint_url,
                                        json=message.model_dump(
                                            by_alias=True,
                                            mode="json",
                                            exclude_none=True,
                                        ),
                                    )
                                    response.raise_for_status()
                                    logger.debug(
                                        "Client message sent successfully: "
                                        f"{response.status_code}"
                                    )
                        except Exception as exc:
                            logger.error(f"Error in post_writer: {exc}")
                        finally:
                            await write_stream.aclose()

                    endpoint_url = await tg.start(sse_reader)
                    logger.info(
                        f"Starting post writer with endpoint URL: {endpoint_url}"
                    )
                    tg.start_soon(post_writer, endpoint_url)

                    try:
                        yield read_stream, write_stream
                    finally:
                        tg.cancel_scope.cancel()
        finally:
            await read_stream_writer.aclose()
            await write_stream.aclose()
