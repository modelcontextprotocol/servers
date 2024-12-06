from typing import Tuple, Optional, Union, Callable
from typing_extensions import NotRequired

from Crypto.Util.asn1 import DerObject
from Crypto.IO._PBES import ProtParams


def wrap(private_key: bytes,
         key_oid: str,
         passphrase: Union[bytes, str] = ...,
         protection: str = ...,
         prot_params: Optional[ProtParams] = ...,
         key_params: Optional[DerObject] = ...,
         randfunc: Optional[Callable[[int], str]] = ...) -> bytes: ...


def unwrap(p8_private_key: bytes, passphrase: Optional[Union[bytes, str]] = ...) -> Tuple[str, bytes, Optional[bytes]]: ...
