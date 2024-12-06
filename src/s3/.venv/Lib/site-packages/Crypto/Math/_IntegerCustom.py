# ===================================================================
#
# Copyright (c) 2018, Helder Eijs <helderijs@gmail.com>
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

from ._IntegerNative import IntegerNative

from Crypto.Util.number import long_to_bytes, bytes_to_long

from Crypto.Util._raw_api import (load_pycryptodome_raw_lib,
                                  create_string_buffer,
                                  get_raw_buffer, backend,
                                  c_size_t, c_ulonglong)


from Crypto.Random.random import getrandbits

c_defs = """
int monty_pow(uint8_t       *out,
              const uint8_t *base,
              const uint8_t *exp,
              const uint8_t *modulus,
              size_t        len,
              uint64_t      seed);

int monty_multiply(uint8_t       *out,
                   const uint8_t *term1,
                   const uint8_t *term2,
                   const uint8_t *modulus,
                   size_t        len);
"""


_raw_montgomery = load_pycryptodome_raw_lib("Crypto.Math._modexp", c_defs)
implementation = {"library": "custom", "api": backend}


class IntegerCustom(IntegerNative):

    @staticmethod
    def from_bytes(byte_string, byteorder='big'):
        if byteorder == 'big':
            pass
        elif byteorder == 'little':
            byte_string = bytearray(byte_string)
            byte_string.reverse()
        else:
            raise ValueError("Incorrect byteorder")
        return IntegerCustom(bytes_to_long(byte_string))

    def inplace_pow(self, exponent, modulus=None):
        exp_value = int(exponent)
        if exp_value < 0:
            raise ValueError("Exponent must not be negative")

        # No modular reduction
        if modulus is None:
            self._value = pow(self._value, exp_value)
            return self

        # With modular reduction
        mod_value = int(modulus)
        if mod_value < 0:
            raise ValueError("Modulus must be positive")
        if mod_value == 0:
            raise ZeroDivisionError("Modulus cannot be zero")

        # C extension only works with odd moduli
        if (mod_value & 1) == 0:
            self._value = pow(self._value, exp_value, mod_value)
            return self

        # C extension only works with bases smaller than modulus
        if self._value >= mod_value:
            self._value %= mod_value

        max_len = len(long_to_bytes(max(self._value, exp_value, mod_value)))

        base_b = long_to_bytes(self._value, max_len)
        exp_b = long_to_bytes(exp_value, max_len)
        modulus_b = long_to_bytes(mod_value, max_len)

        out = create_string_buffer(max_len)

        error = _raw_montgomery.monty_pow(
                    out,
                    base_b,
                    exp_b,
                    modulus_b,
                    c_size_t(max_len),
                    c_ulonglong(getrandbits(64))
                    )

        if error:
            raise ValueError("monty_pow failed with error: %d" % error)

        result = bytes_to_long(get_raw_buffer(out))
        self._value = result
        return self

    @staticmethod
    def _mult_modulo_bytes(term1, term2, modulus):

        # With modular reduction
        mod_value = int(modulus)
        if mod_value < 0:
            raise ValueError("Modulus must be positive")
        if mod_value == 0:
            raise ZeroDivisionError("Modulus cannot be zero")

        # C extension only works with odd moduli
        if (mod_value & 1) == 0:
            raise ValueError("Odd modulus is required")

        # C extension only works with non-negative terms smaller than modulus
        if term1 >= mod_value or term1 < 0:
            term1 %= mod_value
        if term2 >= mod_value or term2 < 0:
            term2 %= mod_value

        modulus_b = long_to_bytes(mod_value)
        numbers_len = len(modulus_b)
        term1_b = long_to_bytes(term1, numbers_len)
        term2_b = long_to_bytes(term2, numbers_len)
        out = create_string_buffer(numbers_len)

        error = _raw_montgomery.monty_multiply(
                    out,
                    term1_b,
                    term2_b,
                    modulus_b,
                    c_size_t(numbers_len)
                    )
        if error:
            raise ValueError("monty_multiply failed with error: %d" % error)

        return get_raw_buffer(out)
