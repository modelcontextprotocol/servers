from contextlib import asynccontextmanager, contextmanager
from typing import Any, AsyncIterator, Iterator

import httpx

from ._decoders import SSEDecoder
from ._exceptions import SSEError
from ._models import ServerSentEvent


class EventSource:
    def __init__(self, response: httpx.Response) -> None:
        self._response = response

    def _check_content_type(self) -> None:
        content_type = self._response.headers.get("content-type", "").partition(";")[0]
        if "text/event-stream" not in content_type:
            raise SSEError(
                "Expected response header Content-Type to contain 'text/event-stream', "
                f"got {content_type!r}"
            )

    @property
    def response(self) -> httpx.Response:
        return self._response

    def iter_sse(self) -> Iterator[ServerSentEvent]:
        self._check_content_type()
        decoder = SSEDecoder()
        for line in self._response.iter_lines():
            line = line.rstrip("\n")
            sse = decoder.decode(line)
            if sse is not None:
                yield sse

    async def aiter_sse(self) -> AsyncIterator[ServerSentEvent]:
        self._check_content_type()
        decoder = SSEDecoder()
        async for line in self._response.aiter_lines():
            line = line.rstrip("\n")
            sse = decoder.decode(line)
            if sse is not None:
                yield sse


@contextmanager
def connect_sse(
    client: httpx.Client, method: str, url: str, **kwargs: Any
) -> Iterator[EventSource]:
    headers = kwargs.pop("headers", {})
    headers["Accept"] = "text/event-stream"
    headers["Cache-Control"] = "no-store"

    with client.stream(method, url, headers=headers, **kwargs) as response:
        yield EventSource(response)


@asynccontextmanager
async def aconnect_sse(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    **kwargs: Any,
) -> AsyncIterator[EventSource]:
    headers = kwargs.pop("headers", {})
    headers["Accept"] = "text/event-stream"
    headers["Cache-Control"] = "no-store"

    async with client.stream(method, url, headers=headers, **kwargs) as response:
        yield EventSource(response)
