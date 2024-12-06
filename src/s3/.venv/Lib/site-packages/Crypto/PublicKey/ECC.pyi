from __future__ import annotations

from typing import Union, Callable, Optional, Tuple, Dict, NamedTuple, Any, overload, Literal
from typing_extensions import TypedDict, Unpack, NotRequired

from Crypto.Math.Numbers import Integer
from Crypto.IO._PBES import ProtParams

from ._point import EccPoint as EccPoint
from ._point import EccXPoint as EccXPoint

RNG = Callable[[int], bytes]


class UnsupportedEccFeature(ValueError):
    ...

class ExportParams(TypedDict):
    passphrase: NotRequired[Union[bytes, str]]
    use_pkcs8: NotRequired[bool]
    protection: NotRequired[str]
    compress: NotRequired[bool]
    prot_params: NotRequired[ProtParams]


class EccKey(object):
    curve: str
    def __init__(self, *, curve: str = ..., d: int = ..., point: EccPoint = ...) -> None: ...
    def __eq__(self, other: object) -> bool: ...
    def __repr__(self) -> str: ...
    def has_private(self) -> bool: ...
    @property
    def d(self) -> int: ...
    @property
    def pointQ(self) -> EccPoint: ...
    def public_key(self) -> EccKey: ...

    @overload
    def export_key(self,
                   *,
                   format: Literal['PEM', 'OpenSSH'],
                   **kwargs: Unpack[ExportParams]) -> str: ...

    @overload
    def export_key(self,
                   *,
                   format: Literal['DER', 'SEC1', 'raw'],
                   **kwargs: Unpack[ExportParams]) -> bytes: ...


_Curve = NamedTuple("_Curve", [('p', Integer),
                               ('order', Integer),
                               ('b', Integer),
                               ('Gx', Integer),
                               ('Gy', Integer),
                               ('G', EccPoint),
                               ('modulus_bits', int),
                               ('oid', str),
                               ('context', Any),
                               ('desc', str),
                               ('openssh', Union[str, None]),
                               ])

_curves: Dict[str, _Curve]

def _import_rfc5915_der(encoded: bytes,
                        passphrase: Optional[str] = None,
                        curve_oid: Optional[str] = None) -> EccKey: ...

def generate(**kwargs: Union[str, RNG]) -> EccKey: ...
def construct(**kwargs: Union[str, int]) -> EccKey: ...


def import_key(encoded: Union[bytes, str],
               passphrase: Optional[str] = None,
               curve_name: Optional[str] = None) -> EccKey: ...


def _import_ed25519_public_key(encoded: bytes) -> EccKey: ...
def _import_ed448_public_key(encoded: bytes) -> EccKey: ...
