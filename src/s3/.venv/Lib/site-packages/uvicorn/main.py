from __future__ import annotations

import asyncio
import logging
import os
import platform
import ssl
import sys
from configparser import RawConfigParser
from typing import IO, Any, Callable

import click

import uvicorn
from uvicorn._types import ASGIApplication
from uvicorn.config import (
    HTTP_PROTOCOLS,
    INTERFACES,
    LIFESPAN,
    LOG_LEVELS,
    LOGGING_CONFIG,
    LOOP_SETUPS,
    SSL_PROTOCOL_VERSION,
    WS_PROTOCOLS,
    Config,
    HTTPProtocolType,
    InterfaceType,
    LifespanType,
    LoopSetupType,
    WSProtocolType,
)
from uvicorn.server import Server, ServerState  # noqa: F401  # Used to be defined here.
from uvicorn.supervisors import ChangeReload, Multiprocess

LEVEL_CHOICES = click.Choice(list(LOG_LEVELS.keys()))
HTTP_CHOICES = click.Choice(list(HTTP_PROTOCOLS.keys()))
WS_CHOICES = click.Choice(list(WS_PROTOCOLS.keys()))
LIFESPAN_CHOICES = click.Choice(list(LIFESPAN.keys()))
LOOP_CHOICES = click.Choice([key for key in LOOP_SETUPS.keys() if key != "none"])
INTERFACE_CHOICES = click.Choice(INTERFACES)

STARTUP_FAILURE = 3

logger = logging.getLogger("uvicorn.error")


def print_version(ctx: click.Context, param: click.Parameter, value: bool) -> None:
    if not value or ctx.resilient_parsing:
        return
    click.echo(
        "Running uvicorn {version} with {py_implementation} {py_version} on {system}".format(  # noqa: UP032
            version=uvicorn.__version__,
            py_implementation=platform.python_implementation(),
            py_version=platform.python_version(),
            system=platform.system(),
        )
    )
    ctx.exit()


@click.command(context_settings={"auto_envvar_prefix": "UVICORN"})
@click.argument("app", envvar="UVICORN_APP")
@click.option(
    "--host",
    type=str,
    default="127.0.0.1",
    help="Bind socket to this host.",
    show_default=True,
)
@click.option(
    "--port",
    type=int,
    default=8000,
    help="Bind socket to this port. If 0, an available port will be picked.",
    show_default=True,
)
@click.option("--uds", type=str, default=None, help="Bind to a UNIX domain socket.")
@click.option("--fd", type=int, default=None, help="Bind to socket from this file descriptor.")
@click.option("--reload", is_flag=True, default=False, help="Enable auto-reload.")
@click.option(
    "--reload-dir",
    "reload_dirs",
    multiple=True,
    help="Set reload directories explicitly, instead of using the current working" " directory.",
    type=click.Path(exists=True),
)
@click.option(
    "--reload-include",
    "reload_includes",
    multiple=True,
    help="Set glob patterns to include while watching for files. Includes '*.py' "
    "by default; these defaults can be overridden with `--reload-exclude`. "
    "This option has no effect unless watchfiles is installed.",
)
@click.option(
    "--reload-exclude",
    "reload_excludes",
    multiple=True,
    help="Set glob patterns to exclude while watching for files. Includes "
    "'.*, .py[cod], .sw.*, ~*' by default; these defaults can be overridden "
    "with `--reload-include`. This option has no effect unless watchfiles is "
    "installed.",
)
@click.option(
    "--reload-delay",
    type=float,
    default=0.25,
    show_default=True,
    help="Delay between previous and next check if application needs to be." " Defaults to 0.25s.",
)
@click.option(
    "--workers",
    default=None,
    type=int,
    help="Number of worker processes. Defaults to the $WEB_CONCURRENCY environment"
    " variable if available, or 1. Not valid with --reload.",
)
@click.option(
    "--loop",
    type=LOOP_CHOICES,
    default="auto",
    help="Event loop implementation.",
    show_default=True,
)
@click.option(
    "--http",
    type=HTTP_CHOICES,
    default="auto",
    help="HTTP protocol implementation.",
    show_default=True,
)
@click.option(
    "--ws",
    type=WS_CHOICES,
    default="auto",
    help="WebSocket protocol implementation.",
    show_default=True,
)
@click.option(
    "--ws-max-size",
    type=int,
    default=16777216,
    help="WebSocket max size message in bytes",
    show_default=True,
)
@click.option(
    "--ws-max-queue",
    type=int,
    default=32,
    help="The maximum length of the WebSocket message queue.",
    show_default=True,
)
@click.option(
    "--ws-ping-interval",
    type=float,
    default=20.0,
    help="WebSocket ping interval in seconds.",
    show_default=True,
)
@click.option(
    "--ws-ping-timeout",
    type=float,
    default=20.0,
    help="WebSocket ping timeout in seconds.",
    show_default=True,
)
@click.option(
    "--ws-per-message-deflate",
    type=bool,
    default=True,
    help="WebSocket per-message-deflate compression",
    show_default=True,
)
@click.option(
    "--lifespan",
    type=LIFESPAN_CHOICES,
    default="auto",
    help="Lifespan implementation.",
    show_default=True,
)
@click.option(
    "--interface",
    type=INTERFACE_CHOICES,
    default="auto",
    help="Select ASGI3, ASGI2, or WSGI as the application interface.",
    show_default=True,
)
@click.option(
    "--env-file",
    type=click.Path(exists=True),
    default=None,
    help="Environment configuration file.",
    show_default=True,
)
@click.option(
    "--log-config",
    type=click.Path(exists=True),
    default=None,
    help="Logging configuration file. Supported formats: .ini, .json, .yaml.",
    show_default=True,
)
@click.option(
    "--log-level",
    type=LEVEL_CHOICES,
    default=None,
    help="Log level. [default: info]",
    show_default=True,
)
@click.option(
    "--access-log/--no-access-log",
    is_flag=True,
    default=True,
    help="Enable/Disable access log.",
)
@click.option(
    "--use-colors/--no-use-colors",
    is_flag=True,
    default=None,
    help="Enable/Disable colorized logging.",
)
@click.option(
    "--proxy-headers/--no-proxy-headers",
    is_flag=True,
    default=True,
    help="Enable/Disable X-Forwarded-Proto, X-Forwarded-For, X-Forwarded-Port to " "populate remote address info.",
)
@click.option(
    "--server-header/--no-server-header",
    is_flag=True,
    default=True,
    help="Enable/Disable default Server header.",
)
@click.option(
    "--date-header/--no-date-header",
    is_flag=True,
    default=True,
    help="Enable/Disable default Date header.",
)
@click.option(
    "--forwarded-allow-ips",
    type=str,
    default=None,
    help="Comma separated list of IP Addresses, IP Networks, or literals "
    "(e.g. UNIX Socket path) to trust with proxy headers. Defaults to the "
    "$FORWARDED_ALLOW_IPS environment variable if available, or '127.0.0.1'. "
    "The literal '*' means trust everything.",
)
@click.option(
    "--root-path",
    type=str,
    default="",
    help="Set the ASGI 'root_path' for applications submounted below a given URL path.",
)
@click.option(
    "--limit-concurrency",
    type=int,
    default=None,
    help="Maximum number of concurrent connections or tasks to allow, before issuing" " HTTP 503 responses.",
)
@click.option(
    "--backlog",
    type=int,
    default=2048,
    help="Maximum number of connections to hold in backlog",
)
@click.option(
    "--limit-max-requests",
    type=int,
    default=None,
    help="Maximum number of requests to service before terminating the process.",
)
@click.option(
    "--timeout-keep-alive",
    type=int,
    default=5,
    help="Close Keep-Alive connections if no new data is received within this timeout.",
    show_default=True,
)
@click.option(
    "--timeout-graceful-shutdown",
    type=int,
    default=None,
    help="Maximum number of seconds to wait for graceful shutdown.",
)
@click.option("--ssl-keyfile", type=str, default=None, help="SSL key file", show_default=True)
@click.option(
    "--ssl-certfile",
    type=str,
    default=None,
    help="SSL certificate file",
    show_default=True,
)
@click.option(
    "--ssl-keyfile-password",
    type=str,
    default=None,
    help="SSL keyfile password",
    show_default=True,
)
@click.option(
    "--ssl-version",
    type=int,
    default=int(SSL_PROTOCOL_VERSION),
    help="SSL version to use (see stdlib ssl module's)",
    show_default=True,
)
@click.option(
    "--ssl-cert-reqs",
    type=int,
    default=int(ssl.CERT_NONE),
    help="Whether client certificate is required (see stdlib ssl module's)",
    show_default=True,
)
@click.option(
    "--ssl-ca-certs",
    type=str,
    default=None,
    help="CA certificates file",
    show_default=True,
)
@click.option(
    "--ssl-ciphers",
    type=str,
    default="TLSv1",
    help="Ciphers to use (see stdlib ssl module's)",
    show_default=True,
)
@click.option(
    "--header",
    "headers",
    multiple=True,
    help="Specify custom default HTTP response headers as a Name:Value pair",
)
@click.option(
    "--version",
    is_flag=True,
    callback=print_version,
    expose_value=False,
    is_eager=True,
    help="Display the uvicorn version and exit.",
)
@click.option(
    "--app-dir",
    default="",
    show_default=True,
    help="Look for APP in the specified directory, by adding this to the PYTHONPATH."
    " Defaults to the current working directory.",
)
@click.option(
    "--h11-max-incomplete-event-size",
    "h11_max_incomplete_event_size",
    type=int,
    default=None,
    help="For h11, the maximum number of bytes to buffer of an incomplete event.",
)
@click.option(
    "--factory",
    is_flag=True,
    default=False,
    help="Treat APP as an application factory, i.e. a () -> <ASGI app> callable.",
    show_default=True,
)
def main(
    app: str,
    host: str,
    port: int,
    uds: str,
    fd: int,
    loop: LoopSetupType,
    http: HTTPProtocolType,
    ws: WSProtocolType,
    ws_max_size: int,
    ws_max_queue: int,
    ws_ping_interval: float,
    ws_ping_timeout: float,
    ws_per_message_deflate: bool,
    lifespan: LifespanType,
    interface: InterfaceType,
    reload: bool,
    reload_dirs: list[str],
    reload_includes: list[str],
    reload_excludes: list[str],
    reload_delay: float,
    workers: int,
    env_file: str,
    log_config: str,
    log_level: str,
    access_log: bool,
    proxy_headers: bool,
    server_header: bool,
    date_header: bool,
    forwarded_allow_ips: str,
    root_path: str,
    limit_concurrency: int,
    backlog: int,
    limit_max_requests: int,
    timeout_keep_alive: int,
    timeout_graceful_shutdown: int | None,
    ssl_keyfile: str,
    ssl_certfile: str,
    ssl_keyfile_password: str,
    ssl_version: int,
    ssl_cert_reqs: int,
    ssl_ca_certs: str,
    ssl_ciphers: str,
    headers: list[str],
    use_colors: bool,
    app_dir: str,
    h11_max_incomplete_event_size: int | None,
    factory: bool,
) -> None:
    run(
        app,
        host=host,
        port=port,
        uds=uds,
        fd=fd,
        loop=loop,
        http=http,
        ws=ws,
        ws_max_size=ws_max_size,
        ws_max_queue=ws_max_queue,
        ws_ping_interval=ws_ping_interval,
        ws_ping_timeout=ws_ping_timeout,
        ws_per_message_deflate=ws_per_message_deflate,
        lifespan=lifespan,
        env_file=env_file,
        log_config=LOGGING_CONFIG if log_config is None else log_config,
        log_level=log_level,
        access_log=access_log,
        interface=interface,
        reload=reload,
        reload_dirs=reload_dirs or None,
        reload_includes=reload_includes or None,
        reload_excludes=reload_excludes or None,
        reload_delay=reload_delay,
        workers=workers,
        proxy_headers=proxy_headers,
        server_header=server_header,
        date_header=date_header,
        forwarded_allow_ips=forwarded_allow_ips,
        root_path=root_path,
        limit_concurrency=limit_concurrency,
        backlog=backlog,
        limit_max_requests=limit_max_requests,
        timeout_keep_alive=timeout_keep_alive,
        timeout_graceful_shutdown=timeout_graceful_shutdown,
        ssl_keyfile=ssl_keyfile,
        ssl_certfile=ssl_certfile,
        ssl_keyfile_password=ssl_keyfile_password,
        ssl_version=ssl_version,
        ssl_cert_reqs=ssl_cert_reqs,
        ssl_ca_certs=ssl_ca_certs,
        ssl_ciphers=ssl_ciphers,
        headers=[header.split(":", 1) for header in headers],  # type: ignore[misc]
        use_colors=use_colors,
        factory=factory,
        app_dir=app_dir,
        h11_max_incomplete_event_size=h11_max_incomplete_event_size,
    )


def run(
    app: ASGIApplication | Callable[..., Any] | str,
    *,
    host: str = "127.0.0.1",
    port: int = 8000,
    uds: str | None = None,
    fd: int | None = None,
    loop: LoopSetupType = "auto",
    http: type[asyncio.Protocol] | HTTPProtocolType = "auto",
    ws: type[asyncio.Protocol] | WSProtocolType = "auto",
    ws_max_size: int = 16777216,
    ws_max_queue: int = 32,
    ws_ping_interval: float | None = 20.0,
    ws_ping_timeout: float | None = 20.0,
    ws_per_message_deflate: bool = True,
    lifespan: LifespanType = "auto",
    interface: InterfaceType = "auto",
    reload: bool = False,
    reload_dirs: list[str] | str | None = None,
    reload_includes: list[str] | str | None = None,
    reload_excludes: list[str] | str | None = None,
    reload_delay: float = 0.25,
    workers: int | None = None,
    env_file: str | os.PathLike[str] | None = None,
    log_config: dict[str, Any] | str | RawConfigParser | IO[Any] | None = LOGGING_CONFIG,
    log_level: str | int | None = None,
    access_log: bool = True,
    proxy_headers: bool = True,
    server_header: bool = True,
    date_header: bool = True,
    forwarded_allow_ips: list[str] | str | None = None,
    root_path: str = "",
    limit_concurrency: int | None = None,
    backlog: int = 2048,
    limit_max_requests: int | None = None,
    timeout_keep_alive: int = 5,
    timeout_graceful_shutdown: int | None = None,
    ssl_keyfile: str | os.PathLike[str] | None = None,
    ssl_certfile: str | os.PathLike[str] | None = None,
    ssl_keyfile_password: str | None = None,
    ssl_version: int = SSL_PROTOCOL_VERSION,
    ssl_cert_reqs: int = ssl.CERT_NONE,
    ssl_ca_certs: str | None = None,
    ssl_ciphers: str = "TLSv1",
    headers: list[tuple[str, str]] | None = None,
    use_colors: bool | None = None,
    app_dir: str | None = None,
    factory: bool = False,
    h11_max_incomplete_event_size: int | None = None,
) -> None:
    if app_dir is not None:
        sys.path.insert(0, app_dir)

    config = Config(
        app,
        host=host,
        port=port,
        uds=uds,
        fd=fd,
        loop=loop,
        http=http,
        ws=ws,
        ws_max_size=ws_max_size,
        ws_max_queue=ws_max_queue,
        ws_ping_interval=ws_ping_interval,
        ws_ping_timeout=ws_ping_timeout,
        ws_per_message_deflate=ws_per_message_deflate,
        lifespan=lifespan,
        interface=interface,
        reload=reload,
        reload_dirs=reload_dirs,
        reload_includes=reload_includes,
        reload_excludes=reload_excludes,
        reload_delay=reload_delay,
        workers=workers,
        env_file=env_file,
        log_config=log_config,
        log_level=log_level,
        access_log=access_log,
        proxy_headers=proxy_headers,
        server_header=server_header,
        date_header=date_header,
        forwarded_allow_ips=forwarded_allow_ips,
        root_path=root_path,
        limit_concurrency=limit_concurrency,
        backlog=backlog,
        limit_max_requests=limit_max_requests,
        timeout_keep_alive=timeout_keep_alive,
        timeout_graceful_shutdown=timeout_graceful_shutdown,
        ssl_keyfile=ssl_keyfile,
        ssl_certfile=ssl_certfile,
        ssl_keyfile_password=ssl_keyfile_password,
        ssl_version=ssl_version,
        ssl_cert_reqs=ssl_cert_reqs,
        ssl_ca_certs=ssl_ca_certs,
        ssl_ciphers=ssl_ciphers,
        headers=headers,
        use_colors=use_colors,
        factory=factory,
        h11_max_incomplete_event_size=h11_max_incomplete_event_size,
    )
    server = Server(config=config)

    if (config.reload or config.workers > 1) and not isinstance(app, str):
        logger = logging.getLogger("uvicorn.error")
        logger.warning("You must pass the application as an import string to enable 'reload' or " "'workers'.")
        sys.exit(1)

    try:
        if config.should_reload:
            sock = config.bind_socket()
            ChangeReload(config, target=server.run, sockets=[sock]).run()
        elif config.workers > 1:
            sock = config.bind_socket()
            Multiprocess(config, target=server.run, sockets=[sock]).run()
        else:
            server.run()
    except KeyboardInterrupt:
        pass  # pragma: full coverage
    finally:
        if config.uds and os.path.exists(config.uds):
            os.remove(config.uds)  # pragma: py-win32

    if not server.started and not config.should_reload and config.workers == 1:
        sys.exit(STARTUP_FAILURE)


if __name__ == "__main__":
    main()  # pragma: no cover
