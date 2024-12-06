from contextlib import AbstractAsyncContextManager
from datetime import timedelta
from typing import Generic, TypeVar

import anyio
import anyio.lowlevel
import httpx
from anyio.streams.memory import MemoryObjectReceiveStream, MemoryObjectSendStream
from pydantic import BaseModel

from mcp.shared.exceptions import McpError
from mcp.types import (
    ClientNotification,
    ClientRequest,
    ClientResult,
    ErrorData,
    JSONRPCError,
    JSONRPCMessage,
    JSONRPCNotification,
    JSONRPCRequest,
    JSONRPCResponse,
    RequestParams,
    ServerNotification,
    ServerRequest,
    ServerResult,
)

SendRequestT = TypeVar("SendRequestT", ClientRequest, ServerRequest)
SendResultT = TypeVar("SendResultT", ClientResult, ServerResult)
SendNotificationT = TypeVar("SendNotificationT", ClientNotification, ServerNotification)
ReceiveRequestT = TypeVar("ReceiveRequestT", ClientRequest, ServerRequest)
ReceiveResultT = TypeVar("ReceiveResultT", bound=BaseModel)
ReceiveNotificationT = TypeVar(
    "ReceiveNotificationT", ClientNotification, ServerNotification
)

RequestId = str | int


class RequestResponder(Generic[ReceiveRequestT, SendResultT]):
    def __init__(
        self,
        request_id: RequestId,
        request_meta: RequestParams.Meta | None,
        request: ReceiveRequestT,
        session: "BaseSession",
    ) -> None:
        self.request_id = request_id
        self.request_meta = request_meta
        self.request = request
        self._session = session
        self._responded = False

    async def respond(self, response: SendResultT | ErrorData) -> None:
        assert not self._responded, "Request already responded to"
        self._responded = True

        await self._session._send_response(
            request_id=self.request_id, response=response
        )


class BaseSession(
    AbstractAsyncContextManager,
    Generic[
        SendRequestT,
        SendNotificationT,
        SendResultT,
        ReceiveRequestT,
        ReceiveNotificationT,
    ],
):
    """
    Implements an MCP "session" on top of read/write streams, including features
    like request/response linking, notifications, and progress.

    This class is an async context manager that automatically starts processing
    messages when entered.
    """

    _response_streams: dict[
        RequestId, MemoryObjectSendStream[JSONRPCResponse | JSONRPCError]
    ]
    _request_id: int

    def __init__(
        self,
        read_stream: MemoryObjectReceiveStream[JSONRPCMessage | Exception],
        write_stream: MemoryObjectSendStream[JSONRPCMessage],
        receive_request_type: type[ReceiveRequestT],
        receive_notification_type: type[ReceiveNotificationT],
        # If none, reading will never time out
        read_timeout_seconds: timedelta | None = None,
    ) -> None:
        self._read_stream = read_stream
        self._write_stream = write_stream
        self._response_streams = {}
        self._request_id = 0
        self._receive_request_type = receive_request_type
        self._receive_notification_type = receive_notification_type
        self._read_timeout_seconds = read_timeout_seconds

        self._incoming_message_stream_writer, self._incoming_message_stream_reader = (
            anyio.create_memory_object_stream[
                RequestResponder[ReceiveRequestT, SendResultT]
                | ReceiveNotificationT
                | Exception
            ]()
        )

    async def __aenter__(self):
        self._task_group = anyio.create_task_group()
        await self._task_group.__aenter__()
        self._task_group.start_soon(self._receive_loop)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        # Using BaseSession as a context manager should not block on exit (this
        # would be very surprising behavior), so make sure to cancel the tasks
        # in the task group.
        self._task_group.cancel_scope.cancel()
        return await self._task_group.__aexit__(exc_type, exc_val, exc_tb)

    async def send_request(
        self,
        request: SendRequestT,
        result_type: type[ReceiveResultT],
    ) -> ReceiveResultT:
        """
        Sends a request and wait for a response. Raises an McpError if the
        response contains an error.

        Do not use this method to emit notifications! Use send_notification()
        instead.
        """

        request_id = self._request_id
        self._request_id = request_id + 1

        response_stream, response_stream_reader = anyio.create_memory_object_stream[
            JSONRPCResponse | JSONRPCError
        ](1)
        self._response_streams[request_id] = response_stream

        jsonrpc_request = JSONRPCRequest(
            jsonrpc="2.0",
            id=request_id,
            **request.model_dump(by_alias=True, mode="json", exclude_none=True),
        )

        # TODO: Support progress callbacks

        await self._write_stream.send(JSONRPCMessage(jsonrpc_request))

        try:
            with anyio.fail_after(
                None
                if self._read_timeout_seconds is None
                else self._read_timeout_seconds.total_seconds()
            ):
                response_or_error = await response_stream_reader.receive()
        except TimeoutError:
            raise McpError(
                ErrorData(
                    code=httpx.codes.REQUEST_TIMEOUT,
                    message=(
                        f"Timed out while waiting for response to "
                        f"{request.__class__.__name__}. Waited "
                        f"{self._read_timeout_seconds} seconds."
                    ),
                )
            )

        if isinstance(response_or_error, JSONRPCError):
            raise McpError(response_or_error.error)
        else:
            return result_type.model_validate(response_or_error.result)

    async def send_notification(self, notification: SendNotificationT) -> None:
        """
        Emits a notification, which is a one-way message that does not expect
        a response.
        """
        jsonrpc_notification = JSONRPCNotification(
            jsonrpc="2.0",
            **notification.model_dump(by_alias=True, mode="json", exclude_none=True),
        )

        await self._write_stream.send(JSONRPCMessage(jsonrpc_notification))

    async def _send_response(
        self, request_id: RequestId, response: SendResultT | ErrorData
    ) -> None:
        if isinstance(response, ErrorData):
            jsonrpc_error = JSONRPCError(jsonrpc="2.0", id=request_id, error=response)
            await self._write_stream.send(JSONRPCMessage(jsonrpc_error))
        else:
            jsonrpc_response = JSONRPCResponse(
                jsonrpc="2.0",
                id=request_id,
                result=response.model_dump(
                    by_alias=True, mode="json", exclude_none=True
                ),
            )
            await self._write_stream.send(JSONRPCMessage(jsonrpc_response))

    async def _receive_loop(self) -> None:
        async with (
            self._read_stream,
            self._write_stream,
            self._incoming_message_stream_writer,
        ):
            async for message in self._read_stream:
                if isinstance(message, Exception):
                    await self._incoming_message_stream_writer.send(message)
                elif isinstance(message.root, JSONRPCRequest):
                    validated_request = self._receive_request_type.model_validate(
                        message.root.model_dump(
                            by_alias=True, mode="json", exclude_none=True
                        )
                    )
                    responder = RequestResponder(
                        request_id=message.root.id,
                        request_meta=validated_request.root.params._meta
                        if validated_request.root.params
                        else None,
                        request=validated_request,
                        session=self,
                    )

                    await self._received_request(responder)
                    if not responder._responded:
                        await self._incoming_message_stream_writer.send(responder)
                elif isinstance(message.root, JSONRPCNotification):
                    notification = self._receive_notification_type.model_validate(
                        message.root.model_dump(
                            by_alias=True, mode="json", exclude_none=True
                        )
                    )

                    await self._received_notification(notification)
                    await self._incoming_message_stream_writer.send(notification)
                else:  # Response or error
                    stream = self._response_streams.pop(message.root.id, None)
                    if stream:
                        await stream.send(message.root)
                    else:
                        await self._incoming_message_stream_writer.send(
                            RuntimeError(
                                "Received response with an unknown "
                                f"request ID: {message}"
                            )
                        )

    async def _received_request(
        self, responder: RequestResponder[ReceiveRequestT, SendResultT]
    ) -> None:
        """
        Can be overridden by subclasses to handle a request without needing to
        listen on the message stream.

        If the request is responded to within this method, it will not be
        forwarded on to the message stream.
        """

    async def _received_notification(self, notification: ReceiveNotificationT) -> None:
        """
        Can be overridden by subclasses to handle a notification without needing
        to listen on the message stream.
        """

    async def send_progress_notification(
        self, progress_token: str | int, progress: float, total: float | None = None
    ) -> None:
        """
        Sends a progress notification for a request that is currently being
        processed.
        """

    @property
    def incoming_messages(
        self,
    ) -> MemoryObjectReceiveStream[
        RequestResponder[ReceiveRequestT, SendResultT]
        | ReceiveNotificationT
        | Exception
    ]:
        return self._incoming_message_stream_reader
