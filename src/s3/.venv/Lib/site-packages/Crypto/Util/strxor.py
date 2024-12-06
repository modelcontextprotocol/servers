# ===================================================================
#
# Copyright (c) 2014, Legrandin <helderijs@gmail.com>
# All rights reserved.
#
# Redistribution and use in source and binary forms, with or without
# modification, are permitted provided that the following conditions
# are met:
#
# 1. Redistributions of source code must retain the above copyright
#    notice, this list of conditions and the following disclaimer.
# 2. Redistributions in binary form must reproduce the above copyright
#    notice, this list of conditions and the following disclaimer in
#    the documentation and/or other materials provided with the
#    distribution.
#
# THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
# "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
# LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS
# FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
# COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
# INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
# BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
# LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
# CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
# LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN
# ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
# POSSIBILITY OF SUCH DAMAGE.
# ===================================================================

from Crypto.Util._raw_api import (load_pycryptodome_raw_lib, c_size_t,
                                  create_string_buffer, get_raw_buffer,
                                  c_uint8_ptr, is_writeable_buffer)

_raw_strxor = load_pycryptodome_raw_lib(
                    "Crypto.Util._strxor",
                    """
                    void strxor(const uint8_t *in1,
                                const uint8_t *in2,
                                uint8_t *out, size_t len);
                    void strxor_c(const uint8_t *in,
                                  uint8_t c,
                                  uint8_t *out,
                                  size_t len);
                    """)


def strxor(term1, term2, output=None):
    """From two byte strings of equal length,
    create a third one which is the byte-by-byte XOR of the two.

    Args:
      term1 (bytes/bytearray/memoryview):
        The first byte string to XOR.
      term2 (bytes/bytearray/memoryview):
        The second byte string to XOR.
      output (bytearray/memoryview):
        The location where the result will be written to.
        It must have the same length as ``term1`` and ``term2``.
        If ``None``, the result is returned.
    :Return:
        If ``output`` is ``None``, a new byte string with the result.
        Otherwise ``None``.

    .. note::
        ``term1`` and ``term2`` must have the same length.
    """

    if len(term1) != len(term2):
        raise ValueError("Only byte strings of equal length can be xored")

    if output is None:
        result = create_string_buffer(len(term1))
    else:
        # Note: output may overlap with either input
        result = output

        if not is_writeable_buffer(output):
            raise TypeError("output must be a bytearray or a writeable memoryview")

        if len(term1) != len(output):
            raise ValueError("output must have the same length as the input"
                             "  (%d bytes)" % len(term1))

    _raw_strxor.strxor(c_uint8_ptr(term1),
                       c_uint8_ptr(term2),
                       c_uint8_ptr(result),
                       c_size_t(len(term1)))

    if output is None:
        return get_raw_buffer(result)
    else:
        return None


def strxor_c(term, c, output=None):
    """From a byte string, create a second one of equal length
    where each byte is XOR-red with the same value.

    Args:
      term(bytes/bytearray/memoryview):
        The byte string to XOR.
      c (int):
        Every byte in the string will be XOR-ed with this value.
        It must be between 0 and 255 (included).
      output (None or bytearray/memoryview):
        The location where the result will be written to.
        It must have the same length as ``term``.
        If ``None``, the result is returned.

    Return:
        If ``output`` is ``None``, a new ``bytes`` string with the result.
        Otherwise ``None``.
    """

    if not 0 <= c < 256:
        raise ValueError("c must be in range(256)")

    if output is None:
        result = create_string_buffer(len(term))
    else:
        # Note: output may overlap with either input
        result = output

        if not is_writeable_buffer(output):
            raise TypeError("output must be a bytearray or a writeable memoryview")

        if len(term) != len(output):
            raise ValueError("output must have the same length as the input"
                             "  (%d bytes)" % len(term))

    _raw_strxor.strxor_c(c_uint8_ptr(term),
                         c,
                         c_uint8_ptr(result),
                         c_size_t(len(term))
                         )

    if output is None:
        return get_raw_buffer(result)
    else:
        return None


def _strxor_direct(term1, term2, result):
    """Very fast XOR - check conditions!"""
    _raw_strxor.strxor(term1, term2, result, c_size_t(len(term1)))
