# The fetch server's HTTP request timeout (#4448): its default, its bounds, and
# how a configured value is read. It applies to the page request a `fetch` tool
# call or prompt makes, and is set at three levels, the most specific winning:
# the tool's `timeout_ms` argument, the `--timeout-ms` flag, the
# `FETCH_TIMEOUT_MS` environment variable, and otherwise 30 s (the value the
# server always used). It is httpx's per-phase timeout, so it bounds the
# connect, each read and each write separately rather than the whole transfer.
# The same bounds hold at every level, so a server default always satisfies the
# tool argument's advertised minimum and maximum, and becomes its advertised
# default. robots.txt checks are not covered: they keep httpx's own default.
#
# The server-wide value has one source, the environment variable:
# `create_server` reads it, and `main()` copies `--timeout-ms` into it (the flag
# outranks a value the environment already had). So the setting reaches the
# server the same way whether it was given as a flag or as a variable, and
# `serve()`'s positional signature is unchanged for its existing callers.

import argparse
import os

DEFAULT_TIMEOUT_MS = 30_000
MIN_TIMEOUT_MS = 100
MAX_TIMEOUT_MS = 600_000
TIMEOUT_ENV = "FETCH_TIMEOUT_MS"


def parse_timeout_ms(value: str) -> int:
    """Parse a timeout in milliseconds, as the ``--timeout-ms`` argparse type.

    Raises ``argparse.ArgumentTypeError``, whose message argparse prints as is.
    """
    try:
        timeout_ms = int(value.strip())
    except ValueError:
        raise argparse.ArgumentTypeError(
            f"{value!r} is not a whole number of milliseconds"
        )
    if not MIN_TIMEOUT_MS <= timeout_ms <= MAX_TIMEOUT_MS:
        raise argparse.ArgumentTypeError(
            f"{timeout_ms} ms is outside {MIN_TIMEOUT_MS}..{MAX_TIMEOUT_MS} ms"
        )
    return timeout_ms


def timeout_ms_from_env() -> int:
    """The server-wide timeout: ``FETCH_TIMEOUT_MS`` when set, else 30 s.

    Raises ``ValueError`` for an unparseable or out-of-range value, so a bad
    setting stops the server at startup rather than failing every request.
    """
    value = os.environ.get(TIMEOUT_ENV, "").strip()
    if not value:
        return DEFAULT_TIMEOUT_MS
    try:
        return parse_timeout_ms(value)
    except argparse.ArgumentTypeError as e:
        raise ValueError(f"{TIMEOUT_ENV}: {e}") from None
