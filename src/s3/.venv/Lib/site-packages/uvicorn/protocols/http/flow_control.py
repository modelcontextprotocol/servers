import asyncio

from uvicorn._types import ASGIReceiveCallable, ASGISendCallable, Scope

CLOSE_HEADER = (b"connection", b"close")

HIGH_WATER_LIMIT = 65536


class FlowControl:
    def __init__(self, transport: asyncio.Transport) -> None:
        self._transport = transport
        self.read_paused = False
        self.write_paused = False
        self._is_writable_event = asyncio.Event()
        self._is_writable_event.set()

    async def drain(self) -> None:
        await self._is_writable_event.wait()  # pragma: full coverage

    def pause_reading(self) -> None:
        if not self.read_paused:
            self.read_paused = True
            self._transport.pause_reading()

    def resume_reading(self) -> None:
        if self.read_paused:
            self.read_paused = False
            self._transport.resume_reading()

    def pause_writing(self) -> None:
        if not self.write_paused:  # pragma: full coverage
            self.write_paused = True
            self._is_writable_event.clear()

    def resume_writing(self) -> None:
        if self.write_paused:  # pragma: full coverage
            self.write_paused = False
            self._is_writable_event.set()


async def service_unavailable(scope: Scope, receive: ASGIReceiveCallable, send: ASGISendCallable) -> None:
    await send(
        {
            "type": "http.response.start",
            "status": 503,
            "headers": [
                (b"content-type", b"text/plain; charset=utf-8"),
                (b"content-length", b"19"),
                (b"connection", b"close"),
            ],
        }
    )
    await send({"type": "http.response.body", "body": b"Service Unavailable", "more_body": False})
