from __future__ import annotations

import asyncio
import http
import logging
from typing import Any, Literal, Optional, Sequence, cast
from urllib.parse import unquote

import websockets
import websockets.legacy.handshake
from websockets.datastructures import Headers
from websockets.exceptions import ConnectionClosed
from websockets.extensions.base import ServerExtensionFactory
from websockets.extensions.permessage_deflate import ServerPerMessageDeflateFactory
from websockets.legacy.server import HTTPResponse
from websockets.server import WebSocketServerProtocol
from websockets.typing import Subprotocol

from uvicorn._types import (
    ASGI3Application,
    ASGISendEvent,
    WebSocketAcceptEvent,
    WebSocketCloseEvent,
    WebSocketConnectEvent,
    WebSocketDisconnectEvent,
    WebSocketReceiveEvent,
    WebSocketResponseBodyEvent,
    WebSocketResponseStartEvent,
    WebSocketScope,
    WebSocketSendEvent,
)
from uvicorn.config import Config
from uvicorn.logging import TRACE_LOG_LEVEL
from uvicorn.protocols.utils import (
    ClientDisconnected,
    get_local_addr,
    get_path_with_query_string,
    get_remote_addr,
    is_ssl,
)
from uvicorn.server import ServerState


class Server:
    closing = False

    def register(self, ws: WebSocketServerProtocol) -> None:
        pass

    def unregister(self, ws: WebSocketServerProtocol) -> None:
        pass

    def is_serving(self) -> bool:
        return not self.closing


class WebSocketProtocol(WebSocketServerProtocol):
    extra_headers: list[tuple[str, str]]
    logger: logging.Logger | logging.LoggerAdapter[Any]

    def __init__(
        self,
        config: Config,
        server_state: ServerState,
        app_state: dict[str, Any],
        _loop: asyncio.AbstractEventLoop | None = None,
    ):
        if not config.loaded:
            config.load()

        self.config = config
        self.app = cast(ASGI3Application, config.loaded_app)
        self.loop = _loop or asyncio.get_event_loop()
        self.root_path = config.root_path
        self.app_state = app_state

        # Shared server state
        self.connections = server_state.connections
        self.tasks = server_state.tasks

        # Connection state
        self.transport: asyncio.Transport = None  # type: ignore[assignment]
        self.server: tuple[str, int] | None = None
        self.client: tuple[str, int] | None = None
        self.scheme: Literal["wss", "ws"] = None  # type: ignore[assignment]

        # Connection events
        self.scope: WebSocketScope
        self.handshake_started_event = asyncio.Event()
        self.handshake_completed_event = asyncio.Event()
        self.closed_event = asyncio.Event()
        self.initial_response: HTTPResponse | None = None
        self.connect_sent = False
        self.lost_connection_before_handshake = False
        self.accepted_subprotocol: Subprotocol | None = None

        self.ws_server: Server = Server()  # type: ignore[assignment]

        extensions: list[ServerExtensionFactory] = []
        if self.config.ws_per_message_deflate:
            extensions.append(ServerPerMessageDeflateFactory())

        super().__init__(
            ws_handler=self.ws_handler,
            ws_server=self.ws_server,  # type: ignore[arg-type]
            max_size=self.config.ws_max_size,
            max_queue=self.config.ws_max_queue,
            ping_interval=self.config.ws_ping_interval,
            ping_timeout=self.config.ws_ping_timeout,
            extensions=extensions,
            logger=logging.getLogger("uvicorn.error"),
        )
        self.server_header = None
        self.extra_headers = [
            (name.decode("latin-1"), value.decode("latin-1")) for name, value in server_state.default_headers
        ]

    def connection_made(  # type: ignore[override]
        self, transport: asyncio.Transport
    ) -> None:
        self.connections.add(self)
        self.transport = transport
        self.server = get_local_addr(transport)
        self.client = get_remote_addr(transport)
        self.scheme = "wss" if is_ssl(transport) else "ws"

        if self.logger.isEnabledFor(TRACE_LOG_LEVEL):
            prefix = "%s:%d - " % self.client if self.client else ""
            self.logger.log(TRACE_LOG_LEVEL, "%sWebSocket connection made", prefix)

        super().connection_made(transport)

    def connection_lost(self, exc: Exception | None) -> None:
        self.connections.remove(self)

        if self.logger.isEnabledFor(TRACE_LOG_LEVEL):
            prefix = "%s:%d - " % self.client if self.client else ""
            self.logger.log(TRACE_LOG_LEVEL, "%sWebSocket connection lost", prefix)

        self.lost_connection_before_handshake = not self.handshake_completed_event.is_set()
        self.handshake_completed_event.set()
        super().connection_lost(exc)
        if exc is None:
            self.transport.close()

    def shutdown(self) -> None:
        self.ws_server.closing = True
        if self.handshake_completed_event.is_set():
            self.fail_connection(1012)
        else:
            self.send_500_response()
        self.transport.close()

    def on_task_complete(self, task: asyncio.Task[None]) -> None:
        self.tasks.discard(task)

    async def process_request(self, path: str, request_headers: Headers) -> HTTPResponse | None:
        """
        This hook is called to determine if the websocket should return
        an HTTP response and close.

        Our behavior here is to start the ASGI application, and then wait
        for either `accept` or `close` in order to determine if we should
        close the connection.
        """
        path_portion, _, query_string = path.partition("?")

        websockets.legacy.handshake.check_request(request_headers)

        subprotocols: list[str] = []
        for header in request_headers.get_all("Sec-WebSocket-Protocol"):
            subprotocols.extend([token.strip() for token in header.split(",")])

        asgi_headers = [
            (name.encode("ascii"), value.encode("ascii", errors="surrogateescape"))
            for name, value in request_headers.raw_items()
        ]
        path = unquote(path_portion)
        full_path = self.root_path + path
        full_raw_path = self.root_path.encode("ascii") + path_portion.encode("ascii")

        self.scope = {
            "type": "websocket",
            "asgi": {"version": self.config.asgi_version, "spec_version": "2.4"},
            "http_version": "1.1",
            "scheme": self.scheme,
            "server": self.server,
            "client": self.client,
            "root_path": self.root_path,
            "path": full_path,
            "raw_path": full_raw_path,
            "query_string": query_string.encode("ascii"),
            "headers": asgi_headers,
            "subprotocols": subprotocols,
            "state": self.app_state.copy(),
            "extensions": {"websocket.http.response": {}},
        }
        task = self.loop.create_task(self.run_asgi())
        task.add_done_callback(self.on_task_complete)
        self.tasks.add(task)
        await self.handshake_started_event.wait()
        return self.initial_response

    def process_subprotocol(
        self, headers: Headers, available_subprotocols: Sequence[Subprotocol] | None
    ) -> Subprotocol | None:
        """
        We override the standard 'process_subprotocol' behavior here so that
        we return whatever subprotocol is sent in the 'accept' message.
        """
        return self.accepted_subprotocol

    def send_500_response(self) -> None:
        msg = b"Internal Server Error"
        content = [
            b"HTTP/1.1 500 Internal Server Error\r\n" b"content-type: text/plain; charset=utf-8\r\n",
            b"content-length: " + str(len(msg)).encode("ascii") + b"\r\n",
            b"connection: close\r\n",
            b"\r\n",
            msg,
        ]
        self.transport.write(b"".join(content))
        # Allow handler task to terminate cleanly, as websockets doesn't cancel it by
        # itself (see https://github.com/encode/uvicorn/issues/920)
        self.handshake_started_event.set()

    async def ws_handler(self, protocol: WebSocketServerProtocol, path: str) -> Any:  # type: ignore[override]
        """
        This is the main handler function for the 'websockets' implementation
        to call into. We just wait for close then return, and instead allow
        'send' and 'receive' events to drive the flow.
        """
        self.handshake_completed_event.set()
        await self.wait_closed()

    async def run_asgi(self) -> None:
        """
        Wrapper around the ASGI callable, handling exceptions and unexpected
        termination states.
        """
        try:
            result = await self.app(self.scope, self.asgi_receive, self.asgi_send)  # type: ignore[func-returns-value]
        except ClientDisconnected:  # pragma: full coverage
            self.closed_event.set()
            self.transport.close()
        except BaseException:
            self.closed_event.set()
            self.logger.exception("Exception in ASGI application\n")
            if not self.handshake_started_event.is_set():
                self.send_500_response()
            else:
                await self.handshake_completed_event.wait()
            self.transport.close()
        else:
            self.closed_event.set()
            if not self.handshake_started_event.is_set():
                self.logger.error("ASGI callable returned without sending handshake.")
                self.send_500_response()
                self.transport.close()
            elif result is not None:
                self.logger.error("ASGI callable should return None, but returned '%s'.", result)
                await self.handshake_completed_event.wait()
                self.transport.close()

    async def asgi_send(self, message: ASGISendEvent) -> None:
        message_type = message["type"]

        if not self.handshake_started_event.is_set():
            if message_type == "websocket.accept":
                message = cast("WebSocketAcceptEvent", message)
                self.logger.info(
                    '%s - "WebSocket %s" [accepted]',
                    self.scope["client"],
                    get_path_with_query_string(self.scope),
                )
                self.initial_response = None
                self.accepted_subprotocol = cast(Optional[Subprotocol], message.get("subprotocol"))
                if "headers" in message:
                    self.extra_headers.extend(
                        # ASGI spec requires bytes
                        # But for compatibility we need to convert it to strings
                        (name.decode("latin-1"), value.decode("latin-1"))
                        for name, value in message["headers"]
                    )
                self.handshake_started_event.set()

            elif message_type == "websocket.close":
                message = cast("WebSocketCloseEvent", message)
                self.logger.info(
                    '%s - "WebSocket %s" 403',
                    self.scope["client"],
                    get_path_with_query_string(self.scope),
                )
                self.initial_response = (http.HTTPStatus.FORBIDDEN, [], b"")
                self.handshake_started_event.set()
                self.closed_event.set()

            elif message_type == "websocket.http.response.start":
                message = cast("WebSocketResponseStartEvent", message)
                self.logger.info(
                    '%s - "WebSocket %s" %d',
                    self.scope["client"],
                    get_path_with_query_string(self.scope),
                    message["status"],
                )
                # websockets requires the status to be an enum. look it up.
                status = http.HTTPStatus(message["status"])
                headers = [
                    (name.decode("latin-1"), value.decode("latin-1")) for name, value in message.get("headers", [])
                ]
                self.initial_response = (status, headers, b"")
                self.handshake_started_event.set()

            else:
                msg = (
                    "Expected ASGI message 'websocket.accept', 'websocket.close', "
                    "or 'websocket.http.response.start' but got '%s'."
                )
                raise RuntimeError(msg % message_type)

        elif not self.closed_event.is_set() and self.initial_response is None:
            await self.handshake_completed_event.wait()

            try:
                if message_type == "websocket.send":
                    message = cast("WebSocketSendEvent", message)
                    bytes_data = message.get("bytes")
                    text_data = message.get("text")
                    data = text_data if bytes_data is None else bytes_data
                    await self.send(data)  # type: ignore[arg-type]

                elif message_type == "websocket.close":
                    message = cast("WebSocketCloseEvent", message)
                    code = message.get("code", 1000)
                    reason = message.get("reason", "") or ""
                    await self.close(code, reason)
                    self.closed_event.set()

                else:
                    msg = "Expected ASGI message 'websocket.send' or 'websocket.close'," " but got '%s'."
                    raise RuntimeError(msg % message_type)
            except ConnectionClosed as exc:
                raise ClientDisconnected from exc

        elif self.initial_response is not None:
            if message_type == "websocket.http.response.body":
                message = cast("WebSocketResponseBodyEvent", message)
                body = self.initial_response[2] + message["body"]
                self.initial_response = self.initial_response[:2] + (body,)
                if not message.get("more_body", False):
                    self.closed_event.set()
            else:
                msg = "Expected ASGI message 'websocket.http.response.body' " "but got '%s'."
                raise RuntimeError(msg % message_type)

        else:
            msg = "Unexpected ASGI message '%s', after sending 'websocket.close' " "or response already completed."
            raise RuntimeError(msg % message_type)

    async def asgi_receive(self) -> WebSocketDisconnectEvent | WebSocketConnectEvent | WebSocketReceiveEvent:
        if not self.connect_sent:
            self.connect_sent = True
            return {"type": "websocket.connect"}

        await self.handshake_completed_event.wait()

        if self.lost_connection_before_handshake:
            # If the handshake failed or the app closed before handshake completion,
            # use 1006 Abnormal Closure.
            return {"type": "websocket.disconnect", "code": 1006}

        if self.closed_event.is_set():
            return {"type": "websocket.disconnect", "code": 1005}

        try:
            data = await self.recv()
        except ConnectionClosed:
            self.closed_event.set()
            if self.ws_server.closing:
                return {"type": "websocket.disconnect", "code": 1012}
            return {"type": "websocket.disconnect", "code": self.close_code or 1005, "reason": self.close_reason}

        if isinstance(data, str):
            return {"type": "websocket.receive", "text": data}
        return {"type": "websocket.receive", "bytes": data}
