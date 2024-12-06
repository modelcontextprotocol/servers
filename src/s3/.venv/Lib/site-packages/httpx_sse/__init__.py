from ._api import EventSource, aconnect_sse, connect_sse
from ._exceptions import SSEError
from ._models import ServerSentEvent

__version__ = "0.4.0"

__all__ = [
    "__version__",
    "EventSource",
    "connect_sse",
    "aconnect_sse",
    "ServerSentEvent",
    "SSEError",
]
