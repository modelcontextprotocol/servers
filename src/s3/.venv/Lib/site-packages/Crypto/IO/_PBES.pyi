from typing import Optional, Callable, TypedDict
from typing_extensions import NotRequired

class PbesError(ValueError):
    ...

class PBES1(object):
    @staticmethod
    def decrypt(data: bytes, passphrase: bytes) -> bytes: ...

class ProtParams(TypedDict):
    iteration_count: NotRequired[int]
    salt_size: NotRequired[int]
    block_size: NotRequired[int]
    parallelization: NotRequired[int]

class PBES2(object):
    @staticmethod
    def encrypt(data: bytes,
                passphrase: bytes,
                protection: str,
                prot_params: Optional[ProtParams] = ...,
                randfunc: Optional[Callable[[int],bytes]] = ...) -> bytes: ...

    @staticmethod
    def decrypt(data:bytes, passphrase: bytes) -> bytes: ...
