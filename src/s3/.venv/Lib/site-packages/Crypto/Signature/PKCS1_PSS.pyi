from typing import Union, Callable, Optional
from typing_extensions import Protocol

from Crypto.PublicKey.RSA import RsaKey


class Hash(Protocol):
    def digest(self) -> bytes: ...
    def update(self, bytes) -> None: ...


class HashModule(Protocol):
    @staticmethod
    def new(data: Optional[bytes]) -> Hash: ...


MaskFunction = Callable[[bytes, int, Union[Hash, HashModule]], bytes]
RndFunction = Callable[[int], bytes]

class PSS_SigScheme:
    def __init__(self, key: RsaKey, mgfunc: MaskFunction, saltLen: int, randfunc: RndFunction) -> None: ...
    def can_sign(self) -> bool: ...
    def sign(self, msg_hash: Hash) -> bytes: ...
    def verify(self, msg_hash: Hash, signature: bytes) -> bool: ...



def new(rsa_key: RsaKey, mgfunc: Optional[MaskFunction]=None, saltLen: Optional[int]=None, randfunc: Optional[RndFunction]=None) -> PSS_SigScheme: ...
