from typing import Dict, Optional, Tuple, Union, overload
from typing_extensions import Literal

Buffer=bytes|bytearray|memoryview

from Crypto.Cipher._mode_ecb import EcbMode
from Crypto.Cipher._mode_cbc import CbcMode
from Crypto.Cipher._mode_cfb import CfbMode
from Crypto.Cipher._mode_ofb import OfbMode
from Crypto.Cipher._mode_ctr import CtrMode
from Crypto.Cipher._mode_openpgp import OpenPgpMode
from Crypto.Cipher._mode_ccm import CcmMode
from Crypto.Cipher._mode_eax import EaxMode
from Crypto.Cipher._mode_gcm import GcmMode
from Crypto.Cipher._mode_siv import SivMode
from Crypto.Cipher._mode_ocb import OcbMode

MODE_ECB: Literal[1]
MODE_CBC: Literal[2]
MODE_CFB: Literal[3]
MODE_OFB: Literal[5]
MODE_CTR: Literal[6]
MODE_OPENPGP: Literal[7]
MODE_CCM: Literal[8]
MODE_EAX: Literal[9]
MODE_SIV: Literal[10]
MODE_GCM: Literal[11]
MODE_OCB: Literal[12]

# MODE_ECB
@overload
def new(key: Buffer,
        mode: Literal[1],
        use_aesni : bool = ...) -> \
        EcbMode: ...

# MODE_CBC
@overload
def new(key: Buffer,
        mode: Literal[2],
        iv : Optional[Buffer] = ...,
        use_aesni : bool = ...) -> \
        CbcMode: ...

@overload
def new(key: Buffer,
        mode: Literal[2],
        IV : Optional[Buffer] = ...,
        use_aesni : bool = ...) -> \
        CbcMode: ...

# MODE_CFB
@overload
def new(key: Buffer,
        mode: Literal[3],
        iv : Optional[Buffer] = ...,
        segment_size : int = ...,
        use_aesni : bool = ...) -> \
        CfbMode: ...

@overload
def new(key: Buffer,
        mode: Literal[3],
        IV : Optional[Buffer] = ...,
        segment_size : int = ...,
        use_aesni : bool = ...) -> \
        CfbMode: ...

# MODE_OFB
@overload
def new(key: Buffer,
        mode: Literal[5],
        iv : Optional[Buffer] = ...,
        use_aesni : bool = ...) -> \
        OfbMode: ...

@overload
def new(key: Buffer,
        mode: Literal[5],
        IV : Optional[Buffer] = ...,
        use_aesni : bool = ...) -> \
        OfbMode: ...

# MODE_CTR
@overload
def new(key: Buffer,
        mode: Literal[6],
        nonce : Optional[Buffer] = ...,
        initial_value : Union[int, Buffer] = ...,
        counter : Dict = ...,
        use_aesni : bool = ...) -> \
        CtrMode: ...

# MODE_OPENPGP
@overload
def new(key: Buffer,
        mode: Literal[7],
        iv : Optional[Buffer] = ...,
        use_aesni : bool = ...) -> \
        OpenPgpMode: ...

@overload
def new(key: Buffer,
        mode: Literal[7],
        IV : Optional[Buffer] = ...,
        use_aesni : bool = ...) -> \
        OpenPgpMode: ...

# MODE_CCM
@overload
def new(key: Buffer,
        mode: Literal[8],
        nonce : Optional[Buffer] = ...,
        mac_len : int = ...,
        assoc_len : int = ...,
        use_aesni : bool = ...) -> \
        CcmMode: ...

# MODE_EAX
@overload
def new(key: Buffer,
        mode: Literal[9],
        nonce : Optional[Buffer] = ...,
        mac_len : int = ...,
        use_aesni : bool = ...) -> \
        EaxMode: ...

# MODE_GCM
@overload
def new(key: Buffer,
        mode: Literal[10],
        nonce : Optional[Buffer] = ...,
        use_aesni : bool = ...) -> \
        SivMode: ...

# MODE_SIV
@overload
def new(key: Buffer,
        mode: Literal[11],
        nonce : Optional[Buffer] = ...,
        mac_len : int = ...,
        use_aesni : bool = ...) -> \
        GcmMode: ...

# MODE_OCB
@overload
def new(key: Buffer,
        mode: Literal[12],
        nonce : Optional[Buffer] = ...,
        mac_len : int = ...,
        use_aesni : bool = ...) -> \
        OcbMode: ...


block_size: int
key_size: Tuple[int, int, int]
