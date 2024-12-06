from typing import Union
from typing_extensions import TypedDict, Unpack, NotRequired

from .TurboSHAKE128 import TurboSHAKE

Buffer = Union[bytes, bytearray, memoryview]

class Args(TypedDict):
    domain: NotRequired[int]
    data: NotRequired[Buffer]

def new(**kwargs: Unpack[Args]) -> TurboSHAKE: ...
