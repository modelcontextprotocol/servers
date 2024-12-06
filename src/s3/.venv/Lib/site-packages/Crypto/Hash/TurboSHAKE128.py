from Crypto.Util._raw_api import (VoidPointer, SmartPointer,
                                  create_string_buffer,
                                  get_raw_buffer, c_size_t,
                                  c_uint8_ptr, c_ubyte)

from Crypto.Util.number import long_to_bytes
from Crypto.Util.py3compat import bchr

from .keccak import _raw_keccak_lib


class TurboSHAKE(object):
    """A TurboSHAKE hash object.
    Do not instantiate directly.
    Use the :func:`new` function.
    """

    def __init__(self, capacity, domain_separation, data):

        state = VoidPointer()
        result = _raw_keccak_lib.keccak_init(state.address_of(),
                                             c_size_t(capacity),
                                             c_ubyte(12))   # Reduced number of rounds
        if result:
            raise ValueError("Error %d while instantiating TurboSHAKE"
                             % result)
        self._state = SmartPointer(state.get(), _raw_keccak_lib.keccak_destroy)

        self._is_squeezing = False
        self._capacity = capacity
        self._domain = domain_separation

        if data:
            self.update(data)


    def update(self, data):
        """Continue hashing of a message by consuming the next chunk of data.

        Args:
            data (byte string/byte array/memoryview): The next chunk of the message being hashed.
        """

        if self._is_squeezing:
            raise TypeError("You cannot call 'update' after the first 'read'")

        result = _raw_keccak_lib.keccak_absorb(self._state.get(),
                                               c_uint8_ptr(data),
                                               c_size_t(len(data)))
        if result:
            raise ValueError("Error %d while updating TurboSHAKE state"
                             % result)
        return self

    def read(self, length):
        """
        Compute the next piece of XOF output.

        .. note::
            You cannot use :meth:`update` anymore after the first call to
            :meth:`read`.

        Args:
            length (integer): the amount of bytes this method must return

        :return: the next piece of XOF output (of the given length)
        :rtype: byte string
        """

        self._is_squeezing = True
        bfr = create_string_buffer(length)
        result = _raw_keccak_lib.keccak_squeeze(self._state.get(),
                                                bfr,
                                                c_size_t(length),
                                                c_ubyte(self._domain))
        if result:
            raise ValueError("Error %d while extracting from TurboSHAKE"
                             % result)

        return get_raw_buffer(bfr)

    def new(self, data=None):
        return type(self)(self._capacity, self._domain, data)

    def _reset(self):
        result = _raw_keccak_lib.keccak_reset(self._state.get())
        if result:
            raise ValueError("Error %d while resetting TurboSHAKE state"
                             % result)
        self._is_squeezing = False


def new(**kwargs):
    """Create a new TurboSHAKE128 object.

    Args:
       domain (integer):
         Optional - A domain separation byte, between 0x01 and 0x7F.
         The default value is 0x1F.
       data (bytes/bytearray/memoryview):
        Optional - The very first chunk of the message to hash.
        It is equivalent to an early call to :meth:`update`.

    :Return: A :class:`TurboSHAKE` object
    """

    domain_separation = kwargs.get('domain', 0x1F)
    if not (0x01 <= domain_separation <= 0x7F):
        raise ValueError("Incorrect domain separation value (%d)" %
                         domain_separation)
    data = kwargs.get('data')
    return TurboSHAKE(32, domain_separation, data=data)
