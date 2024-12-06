#
#  SelfTest/Math/test_modmult.py: Self-test for custom modular multiplication
#
# ===================================================================
#
# Copyright (c) 2023, Helder Eijs <helderijs@gmail.com>
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

"""Self-test for the custom modular multiplication"""

import unittest

from Crypto.SelfTest.st_common import list_test_cases

from Crypto.Util.number import long_to_bytes, bytes_to_long

from Crypto.Util._raw_api import (create_string_buffer,
                                  get_raw_buffer,
                                  c_size_t)

from Crypto.Math._IntegerCustom import _raw_montgomery


class ExceptionModulus(ValueError):
    pass


def monty_mult(term1, term2, modulus):

    if term1 >= modulus:
        term1 %= modulus
    if term2 >= modulus:
        term2 %= modulus

    modulus_b = long_to_bytes(modulus)
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

    if error == 17:
        raise ExceptionModulus()
    if error:
        raise ValueError("monty_multiply() failed with error: %d" % error)

    return get_raw_buffer(out)


modulus1 = 0xd66691b20071be4d66d4b71032b37fa007cfabf579fcb91e50bfc2753b3f0ce7be74e216aef7e26d4ae180bc20d7bd3ea88a6cbf6f87380e613c8979b5b043b200a8ff8856a3b12875e36e98a7569f3852d028e967551000b02c19e9fa52e83115b89309aabb1e1cf1e2cb6369d637d46775ce4523ea31f64ad2794cbc365dd8a35e007ed3b57695877fbf102dbeb8b3212491398e494314e93726926e1383f8abb5889bea954eb8c0ca1c62c8e9d83f41888095c5e645ed6d32515fe0c58c1368cad84694e18da43668c6f43e61d7c9bca633ddcda7aef5b79bc396d4a9f48e2a9abe0836cc455e435305357228e93d25aaed46b952defae0f57339bf26f5a9


class TestModMultiply(unittest.TestCase):

    def test_small(self):
        self.assertEqual(b"\x01", monty_mult(5, 6, 29))

    def test_large(self):
        numbers_len = (modulus1.bit_length() + 7) // 8

        t1 = modulus1 // 2
        t2 = modulus1 - 90
        expect = b'\x00' * (numbers_len - 1) + b'\x2d'
        self.assertEqual(expect, monty_mult(t1, t2, modulus1))

    def test_zero_term(self):
        numbers_len = (modulus1.bit_length() + 7) // 8
        expect = b'\x00' * numbers_len
        self.assertEqual(expect, monty_mult(0x100, 0, modulus1))
        self.assertEqual(expect, monty_mult(0, 0x100, modulus1))

    def test_larger_term(self):
        t1 = 2**2047
        expect_int = 0x8edf4071f78e3d7ba622cdbbbef74612e301d69186776ae6bf87ff38c320d9aebaa64889c2f67de2324e6bccd2b10ad89e91fd21ba4bb523904d033eff5e70e62f01a84f41fa90a4f248ef249b82e1d2729253fdfc2a3b5b740198123df8bfbf7057d03e15244ad5f26eb9a099763b5c5972121ec076b0bf899f59bd95f7cc129abddccf24217bce52ca0f3a44c9ccc504765dbb89734205f3ae6a8cc560494a60ea84b27d8e00fa24bdd5b4f1d4232edb61e47d3d984c1fa50a3820a2e580fbc3fc8bc11e99df53b9efadf5a40ac75d384e400905aa6f1d88950cd53b1c54dc2222115ad84a27260fa4d978155c1434c551de1ee7361a17a2f79d4388f78a5d
        res = bytes_to_long(monty_mult(t1, t1, modulus1))
        self.assertEqual(res, expect_int)


def get_tests(config={}):
    tests = []
    tests += list_test_cases(TestModMultiply)
    return tests


if __name__ == '__main__':
    def suite():
        return unittest.TestSuite(get_tests())
    unittest.main(defaultTest='suite')
