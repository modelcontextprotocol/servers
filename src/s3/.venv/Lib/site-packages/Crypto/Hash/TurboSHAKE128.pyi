from typing import Union, Optional
from typing_extensions import TypedDict, Unpack, NotRequired

Buffer = Union[bytes, bytearray, memoryview]

class TurboSHAKE(object):

    def __init__(self, capacity: int, domain_separation: int, data: Union[Buffer, None]) -> None: ...
    def update(self, data: Buffer) -> TurboSHAKE : ...
    def read(self, length: int) -> bytes: ...
    def new(self, data: Optional[Buffer]=None) -> TurboSHAKE: ...

class Args(TypedDict):
    domain: NotRequired[int]
    data: NotRequired[Buffer]

def new(**kwargs: Unpack[Args]) -> TurboSHAKE: ...
