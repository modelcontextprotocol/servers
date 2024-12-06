"""
MCP Server Module

This module provides a framework for creating an MCP (Model Context Protocol) server.
It allows you to easily define and handle various types of requests and notifications
in an asynchronous manner.

Usage:
1. Create a Server instance:
   server = Server("your_server_name")

2. Define request handlers using decorators:
   @server.list_prompts()
   async def handle_list_prompts() -> list[types.Prompt]:
       # Implementation

   @server.get_prompt()
   async def handle_get_prompt(
       name: str, arguments: dict[str, str] | None
   ) -> types.GetPromptResult:
       # Implementation

   @server.list_tools()
   async def handle_list_tools() -> list[types.Tool]:
       # Implementation

   @server.call_tool()
   async def handle_call_tool(
       name: str, arguments: dict | None
   ) -> list[types.TextContent | types.ImageContent | types.EmbeddedResource]:
       # Implementation

   @server.list_resource_templates()
   async def handle_list_resource_templates() -> list[types.ResourceTemplate]:
       # Implementation

3. Define notification handlers if needed:
   @server.progress_notification()
   async def handle_progress(
       progress_token: str | int, progress: float, total: float | None
   ) -> None:
       # Implementation

4. Run the server:
   async def main():
       async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
           await server.run(
               read_stream,
               write_stream,
               InitializationOptions(
                   server_name="your_server_name",
                   server_version="your_version",
                   capabilities=server.get_capabilities(
                       notification_options=NotificationOptions(),
                       experimental_capabilities={},
                   ),
               ),
           )

   asyncio.run(main())

The Server class provides methods to register handlers for various MCP requests and
notifications. It automatically manages the request context and handles incoming
messages from the client.
"""

import contextvars
import logging
import warnings
from collections.abc import Awaitable, Callable
from typing import Any, Sequence

from anyio.streams.memory import MemoryObjectReceiveStream, MemoryObjectSendStream
from pydantic import AnyUrl

import mcp.types as types
from mcp.server.models import InitializationOptions
from mcp.server.session import ServerSession
from mcp.server.stdio import stdio_server as stdio_server
from mcp.shared.context import RequestContext
from mcp.shared.exceptions import McpError
from mcp.shared.session import RequestResponder

logger = logging.getLogger(__name__)

request_ctx: contextvars.ContextVar[RequestContext[ServerSession]] = (
    contextvars.ContextVar("request_ctx")
)


class NotificationOptions:
    def __init__(
        self,
        prompts_changed: bool = False,
        resources_changed: bool = False,
        tools_changed: bool = False,
    ):
        self.prompts_changed = prompts_changed
        self.resources_changed = resources_changed
        self.tools_changed = tools_changed


class Server:
    def __init__(self, name: str):
        self.name = name
        self.request_handlers: dict[
            type, Callable[..., Awaitable[types.ServerResult]]
        ] = {
            types.PingRequest: _ping_handler,
        }
        self.notification_handlers: dict[type, Callable[..., Awaitable[None]]] = {}
        self.notification_options = NotificationOptions()
        logger.debug(f"Initializing server '{name}'")

    def create_initialization_options(
        self,
        notification_options: NotificationOptions | None = None,
        experimental_capabilities: dict[str, dict[str, Any]] | None = None,
    ) -> InitializationOptions:
        """Create initialization options from this server instance."""

        def pkg_version(package: str) -> str:
            try:
                from importlib.metadata import version

                v = version(package)
                if v is not None:
                    return v
            except Exception:
                pass

            return "unknown"

        return InitializationOptions(
            server_name=self.name,
            server_version=pkg_version("mcp"),
            capabilities=self.get_capabilities(
                notification_options or NotificationOptions(),
                experimental_capabilities or {},
            ),
        )

    def get_capabilities(
        self,
        notification_options: NotificationOptions,
        experimental_capabilities: dict[str, dict[str, Any]],
    ) -> types.ServerCapabilities:
        """Convert existing handlers to a ServerCapabilities object."""
        prompts_capability = None
        resources_capability = None
        tools_capability = None
        logging_capability = None

        # Set prompt capabilities if handler exists
        if types.ListPromptsRequest in self.request_handlers:
            prompts_capability = types.PromptsCapability(
                listChanged=notification_options.prompts_changed
            )

        # Set resource capabilities if handler exists
        if types.ListResourcesRequest in self.request_handlers:
            resources_capability = types.ResourcesCapability(
                subscribe=False, listChanged=notification_options.resources_changed
            )

        # Set tool capabilities if handler exists
        if types.ListToolsRequest in self.request_handlers:
            tools_capability = types.ToolsCapability(
                listChanged=notification_options.tools_changed
            )

        # Set logging capabilities if handler exists
        if types.SetLevelRequest in self.request_handlers:
            logging_capability = types.LoggingCapability()

        return types.ServerCapabilities(
            prompts=prompts_capability,
            resources=resources_capability,
            tools=tools_capability,
            logging=logging_capability,
            experimental=experimental_capabilities,
        )

    @property
    def request_context(self) -> RequestContext[ServerSession]:
        """If called outside of a request context, this will raise a LookupError."""
        return request_ctx.get()

    def list_prompts(self):
        def decorator(func: Callable[[], Awaitable[list[types.Prompt]]]):
            logger.debug("Registering handler for PromptListRequest")

            async def handler(_: Any):
                prompts = await func()
                return types.ServerResult(types.ListPromptsResult(prompts=prompts))

            self.request_handlers[types.ListPromptsRequest] = handler
            return func

        return decorator

    def get_prompt(self):
        def decorator(
            func: Callable[
                [str, dict[str, str] | None], Awaitable[types.GetPromptResult]
            ],
        ):
            logger.debug("Registering handler for GetPromptRequest")

            async def handler(req: types.GetPromptRequest):
                prompt_get = await func(req.params.name, req.params.arguments)
                return types.ServerResult(prompt_get)

            self.request_handlers[types.GetPromptRequest] = handler
            return func

        return decorator

    def list_resources(self):
        def decorator(func: Callable[[], Awaitable[list[types.Resource]]]):
            logger.debug("Registering handler for ListResourcesRequest")

            async def handler(_: Any):
                resources = await func()
                return types.ServerResult(
                    types.ListResourcesResult(resources=resources)
                )

            self.request_handlers[types.ListResourcesRequest] = handler
            return func

        return decorator

    def list_resource_templates(self):
        def decorator(func: Callable[[], Awaitable[list[types.ResourceTemplate]]]):
            logger.debug("Registering handler for ListResourceTemplatesRequest")

            async def handler(_: Any):
                templates = await func()
                return types.ServerResult(
                    types.ListResourceTemplatesResult(resourceTemplates=templates)
                )

            self.request_handlers[types.ListResourceTemplatesRequest] = handler
            return func

        return decorator

    def read_resource(self):
        def decorator(func: Callable[[AnyUrl], Awaitable[str | bytes]]):
            logger.debug("Registering handler for ReadResourceRequest")

            async def handler(req: types.ReadResourceRequest):
                result = await func(req.params.uri)
                match result:
                    case str(s):
                        content = types.TextResourceContents(
                            uri=req.params.uri,
                            text=s,
                            mimeType="text/plain",
                        )
                    case bytes(b):
                        import base64

                        content = types.BlobResourceContents(
                            uri=req.params.uri,
                            blob=base64.urlsafe_b64encode(b).decode(),
                            mimeType="application/octet-stream",
                        )

                return types.ServerResult(
                    types.ReadResourceResult(
                        contents=[content],
                    )
                )

            self.request_handlers[types.ReadResourceRequest] = handler
            return func

        return decorator

    def set_logging_level(self):
        def decorator(func: Callable[[types.LoggingLevel], Awaitable[None]]):
            logger.debug("Registering handler for SetLevelRequest")

            async def handler(req: types.SetLevelRequest):
                await func(req.params.level)
                return types.ServerResult(types.EmptyResult())

            self.request_handlers[types.SetLevelRequest] = handler
            return func

        return decorator

    def subscribe_resource(self):
        def decorator(func: Callable[[AnyUrl], Awaitable[None]]):
            logger.debug("Registering handler for SubscribeRequest")

            async def handler(req: types.SubscribeRequest):
                await func(req.params.uri)
                return types.ServerResult(types.EmptyResult())

            self.request_handlers[types.SubscribeRequest] = handler
            return func

        return decorator

    def unsubscribe_resource(self):
        def decorator(func: Callable[[AnyUrl], Awaitable[None]]):
            logger.debug("Registering handler for UnsubscribeRequest")

            async def handler(req: types.UnsubscribeRequest):
                await func(req.params.uri)
                return types.ServerResult(types.EmptyResult())

            self.request_handlers[types.UnsubscribeRequest] = handler
            return func

        return decorator

    def list_tools(self):
        def decorator(func: Callable[[], Awaitable[list[types.Tool]]]):
            logger.debug("Registering handler for ListToolsRequest")

            async def handler(_: Any):
                tools = await func()
                return types.ServerResult(types.ListToolsResult(tools=tools))

            self.request_handlers[types.ListToolsRequest] = handler
            return func

        return decorator

    def call_tool(self):
        def decorator(
            func: Callable[
                ...,
                Awaitable[
                    Sequence[
                        types.TextContent | types.ImageContent | types.EmbeddedResource
                    ]
                ],
            ],
        ):
            logger.debug("Registering handler for CallToolRequest")

            async def handler(req: types.CallToolRequest):
                try:
                    results = await func(req.params.name, (req.params.arguments or {}))
                    return types.ServerResult(
                        types.CallToolResult(content=list(results), isError=False)
                    )
                except Exception as e:
                    return types.ServerResult(
                        types.CallToolResult(
                            content=[types.TextContent(type="text", text=str(e))],
                            isError=True,
                        )
                    )

            self.request_handlers[types.CallToolRequest] = handler
            return func

        return decorator

    def progress_notification(self):
        def decorator(
            func: Callable[[str | int, float, float | None], Awaitable[None]],
        ):
            logger.debug("Registering handler for ProgressNotification")

            async def handler(req: types.ProgressNotification):
                await func(
                    req.params.progressToken, req.params.progress, req.params.total
                )

            self.notification_handlers[types.ProgressNotification] = handler
            return func

        return decorator

    def completion(self):
        """Provides completions for prompts and resource templates"""

        def decorator(
            func: Callable[
                [
                    types.PromptReference | types.ResourceReference,
                    types.CompletionArgument,
                ],
                Awaitable[types.Completion | None],
            ],
        ):
            logger.debug("Registering handler for CompleteRequest")

            async def handler(req: types.CompleteRequest):
                completion = await func(req.params.ref, req.params.argument)
                return types.ServerResult(
                    types.CompleteResult(
                        completion=completion
                        if completion is not None
                        else types.Completion(values=[], total=None, hasMore=None),
                    )
                )

            self.request_handlers[types.CompleteRequest] = handler
            return func

        return decorator

    async def run(
        self,
        read_stream: MemoryObjectReceiveStream[types.JSONRPCMessage | Exception],
        write_stream: MemoryObjectSendStream[types.JSONRPCMessage],
        initialization_options: InitializationOptions,
        # When False, exceptions are returned as messages to the client.
        # When True, exceptions are raised, which will cause the server to shut down
        # but also make tracing exceptions much easier during testing and when using
        # in-process servers.
        raise_exceptions: bool = False,
    ):
        with warnings.catch_warnings(record=True) as w:
            async with ServerSession(
                read_stream, write_stream, initialization_options
            ) as session:
                async for message in session.incoming_messages:
                    logger.debug(f"Received message: {message}")

                    match message:
                        case RequestResponder(request=types.ClientRequest(root=req)):
                            logger.info(
                                f"Processing request of type {type(req).__name__}"
                            )
                            if type(req) in self.request_handlers:
                                handler = self.request_handlers[type(req)]
                                logger.debug(
                                    f"Dispatching request of type {type(req).__name__}"
                                )

                                token = None
                                try:
                                    # Set our global state that can be retrieved via
                                    # app.get_request_context()
                                    token = request_ctx.set(
                                        RequestContext(
                                            message.request_id,
                                            message.request_meta,
                                            session,
                                        )
                                    )
                                    response = await handler(req)
                                except McpError as err:
                                    response = err.error
                                except Exception as err:
                                    if raise_exceptions:
                                        raise err
                                    response = types.ErrorData(
                                        code=0, message=str(err), data=None
                                    )
                                finally:
                                    # Reset the global state after we are done
                                    if token is not None:
                                        request_ctx.reset(token)

                                await message.respond(response)
                            else:
                                await message.respond(
                                    types.ErrorData(
                                        code=types.METHOD_NOT_FOUND,
                                        message="Method not found",
                                    )
                                )

                            logger.debug("Response sent")
                        case types.ClientNotification(root=notify):
                            if type(notify) in self.notification_handlers:
                                assert type(notify) in self.notification_handlers

                                handler = self.notification_handlers[type(notify)]
                                logger.debug(
                                    f"Dispatching notification of type "
                                    f"{type(notify).__name__}"
                                )

                                try:
                                    await handler(notify)
                                except Exception as err:
                                    logger.error(
                                        f"Uncaught exception in notification handler: "
                                        f"{err}"
                                    )

                    for warning in w:
                        logger.info(
                            f"Warning: {warning.category.__name__}: {warning.message}"
                        )


async def _ping_handler(request: types.PingRequest) -> types.ServerResult:
    return types.ServerResult(types.EmptyResult())
