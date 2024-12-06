# ===================================================================
#
# Copyright (c) 2024, Helder Eijs <helderijs@gmail.com>
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

import unittest
from binascii import unhexlify

from Crypto.SelfTest.st_common import list_test_cases
from Crypto.Math.Numbers import Integer
from Crypto.Hash import SHAKE128

from Crypto.PublicKey import ECC
from Crypto.PublicKey.ECC import EccKey, EccXPoint, _curves

# Test vectors for scalar multiplication using point with X=9 as base
# generated with nickovs' Python-only code https://gist.github.com/nickovs/cc3c22d15f239a2640c185035c06f8a3
# The order is 0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed
# Each tuple is (exponent, X-coordinate)
scalar_base9_test = [
    (1, 9),
    (2, 0x20d342d51873f1b7d9750c687d1571148f3f5ced1e350b5c5cae469cdd684efb),
    (3, 0x1c12bc1a6d57abe645534d91c21bba64f8824e67621c0859c00a03affb713c12),
    (4, 0x79ce98b7e0689d7de7d1d074a15b315ffe1805dfcd5d2a230fee85e4550013ef),
    (6, 0x26954ccdc99ebf34f8f1dde5e6bb080685fec73640494c28f9fe0bfa8c794531),
    (9, 0x192b929197d07748db44600da41bab7499b1c2e6e2f87c6f0e337980668164ba),
    (129, 0x7332096a738900085e721103fce2cbf13aee50fef0788ea0d669008eb09ceab7),
    (255, 0x1534582fc2b1cea45e8cb776547e209da4fd54a9e473b50c5b8c6b0ae023a9b3),
    (256, 0x4300017536976a742ec8747f7505cd6bc80e610d669acab1a1eed36f680d98e8),
    (257, 0x6c410611cb484c9016adfb884d37a0e682e075daca1d46f45bb7a4afed10b125),
    (0x10101, 0xa679e9d7e043bf76c03362576e2c88abe9093c5d4f6b4a202c64a8397467cf),
    (0xAA55CC, 0x2cc02f84c067e3586f4278326689be163e606d69ccae505bb09488e11f295887),
    (0x1B29A0E579E0A000567, 0x50c38a72d7bfd7864c8b9083fa123e8d359068e6b491a019a885036e073f6604),
    (0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed + 1, 9),
]


class TestEccPoint_Curve25519(unittest.TestCase):

    v1 = 0x09fa78b39b00a72930bcd8039be789a0997830bb99f79aeeb93493715390b4e8
    v2 = 0x15210f12786811d3f4b7959d0538ae2c31dbe7106fc03c3efc4cd549c715a493

    def test_init(self):
        EccXPoint(9, "curve25519")
        EccXPoint(2**255 - 19 + 5, "curve25519")

    def test_curve_attribute(self):
        point = EccXPoint(9, "curve25519")
        self.assertEqual(point.curve, "Curve25519")

    def test_init_fail(self):
        self.assertRaises(ValueError, EccXPoint, 3*(2**255 - 19), "curve25519")
        self.assertRaises(ValueError, EccXPoint, 9, "curve25518")

    def test_equal_set(self):
        point1 = EccXPoint(self.v1, "curve25519")
        point2 = EccXPoint(self.v2, "curve25519")

        self.assertEqual(point1, point1)
        self.assertNotEqual(point1, point2)

        point2.set(point1)
        self.assertEqual(point1.x, point2.x)

    def test_copy(self):
        point1 = EccXPoint(self.v1, "curve25519")
        point2 = point1.copy()
        self.assertEqual(point1.x, point2.x)

    def test_pai(self):
        point1 = EccXPoint(self.v1, "curve25519")
        pai = point1.point_at_infinity()
        self.assertTrue(pai.point_at_infinity())

        point2 = EccXPoint(None, "curve25519")
        self.assertTrue(point2.point_at_infinity())

    def test_scalar_multiply(self):
        base = EccXPoint(9, "curve25519")

        pointH = 0 * base
        self.assertTrue(pointH.point_at_infinity())

        pointH = 0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed * base
        self.assertTrue(pointH.point_at_infinity())

        pointH = base * 1
        self.assertEqual(pointH.x, 9)

        for d, result in scalar_base9_test:
            pointH = d * base
            self.assertEqual(pointH.x, result)

    def test_sizes(self):
        point = EccXPoint(9, "curve25519")
        self.assertEqual(point.size_in_bits(), 255)
        self.assertEqual(point.size_in_bytes(), 32)


class TestEccKey_Curve25519(unittest.TestCase):

    def test_private_key(self):
        # RFC7748 Section 6.1 - Alice
        alice_priv = unhexlify("77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a")
        alice_pub = unhexlify("8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a")
        alice_pub_x = Integer.from_bytes(alice_pub, byteorder='little')

        key = EccKey(curve="Curve25519", seed=alice_priv)
        self.assertEqual(key.seed, alice_priv)
        self.assertTrue(key.has_private())
        self.assertEqual(key.pointQ.x, alice_pub_x)

        # RFC7748 Section 6.1 - Bob
        bob_priv = unhexlify("5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb")
        bob_pub = unhexlify("de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f")
        bob_pub_x = Integer.from_bytes(bob_pub, byteorder='little')

        key = EccKey(curve="Curve25519", seed=bob_priv)
        self.assertEqual(key.seed, bob_priv)
        self.assertTrue(key.has_private())
        self.assertEqual(key.pointQ.x, bob_pub_x)

        # Other names
        key = EccKey(curve="curve25519", seed=alice_priv)

        # Must not accept d parameter
        self.assertRaises(ValueError, EccKey, curve="curve25519", d=1)

    def test_public_key(self):
        point = EccXPoint(_curves['curve25519'].Gx,
                          curve='curve25519')
        key = EccKey(curve="curve25519", point=point)
        self.assertFalse(key.has_private())
        self.assertEqual(key.pointQ, point)

    def test_public_key_derived(self):
        priv_key = EccKey(curve="curve25519", seed=b'H'*32)
        pub_key = priv_key.public_key()
        self.assertFalse(pub_key.has_private())
        self.assertEqual(priv_key.pointQ, pub_key.pointQ)

    def test_invalid_seed(self):
        self.assertRaises(ValueError, lambda: EccKey(curve="curve25519", seed=b'H' * 31))

    def test_equality(self):
        private_key = ECC.construct(seed=b'H'*32, curve="Curve25519")
        private_key2 = ECC.construct(seed=b'H'*32, curve="curve25519")
        private_key3 = ECC.construct(seed=b'C'*32, curve="Curve25519")

        public_key = private_key.public_key()
        public_key2 = private_key2.public_key()
        public_key3 = private_key3.public_key()

        self.assertEqual(private_key, private_key2)
        self.assertNotEqual(private_key, private_key3)

        self.assertEqual(public_key, public_key2)
        self.assertNotEqual(public_key, public_key3)

        self.assertNotEqual(public_key, private_key)

    def test_name_consistency(self):
        key = ECC.generate(curve='curve25519')
        self.assertIn("curve='Curve25519'", repr(key))
        self.assertEqual(key.curve, 'Curve25519')
        self.assertEqual(key.public_key().curve, 'Curve25519')


class TestEccModule_Curve25519(unittest.TestCase):

    def test_generate(self):
        key = ECC.generate(curve="Curve25519")
        self.assertTrue(key.has_private())
        point = EccXPoint(_curves['Curve25519'].Gx, curve="Curve25519") * key.d
        self.assertEqual(key.pointQ, point)

        # Always random
        key2 = ECC.generate(curve="Curve25519")
        self.assertNotEqual(key, key2)

        # Other names
        ECC.generate(curve="curve25519")

        # Random source
        key1 = ECC.generate(curve="Curve25519", randfunc=SHAKE128.new().read)
        key2 = ECC.generate(curve="Curve25519", randfunc=SHAKE128.new().read)
        self.assertEqual(key1, key2)

    def test_construct(self):
        seed = unhexlify("77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a")
        point_hex = unhexlify("8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a")
        Px = Integer.from_bytes(point_hex, byteorder='little')
        point = EccXPoint(Px, curve="Curve25519")

        # Private key only
        key = ECC.construct(curve="Curve25519", seed=seed)
        self.assertEqual(key.pointQ, point)
        self.assertTrue(key.has_private())

        # Public key only
        key = ECC.construct(curve="Curve25519", point_x=Px)
        self.assertEqual(key.pointQ, point)
        self.assertFalse(key.has_private())

        # Private and public key
        key = ECC.construct(curve="Curve25519", seed=seed, point_x=Px)
        self.assertEqual(key.pointQ, point)
        self.assertTrue(key.has_private())

        # Other names
        key = ECC.construct(curve="curve25519", seed=seed)

    def test_negative_construct(self):
        coordG = dict(point_x=_curves['curve25519'].Gx)

        self.assertRaises(ValueError, ECC.construct, curve="Curve25519", d=2, **coordG)
        self.assertRaises(ValueError, ECC.construct, curve="Curve25519", seed=b'H'*31)

        # Verify you cannot construct weak keys (small-order points)
        self.assertRaises(ValueError, ECC.construct, curve="Curve25519",
                          point_x=0)
        self.assertRaises(ValueError, ECC.construct, curve="Curve25519",
                          point_x=1)
        self.assertRaises(ValueError, ECC.construct, curve="Curve25519",
                          point_x=325606250916557431795983626356110631294008115727848805560023387167927233504)
        self.assertRaises(ValueError, ECC.construct, curve="Curve25519",
                          point_x=39382357235489614581723060781553021112529911719440698176882885853963445705823)
        p = 2**255 - 19
        self.assertRaises(ValueError, ECC.construct, curve="Curve25519",
                          point_x=p-1)
        self.assertRaises(ValueError, ECC.construct, curve="Curve25519",
                          point_x=p)
        self.assertRaises(ValueError, ECC.construct, curve="Curve25519",
                          point_x=p+1)
        self.assertRaises(ValueError, ECC.construct, curve="Curve25519",
                          point_x=p+325606250916557431795983626356110631294008115727848805560023387167927233504)
        self.assertRaises(ValueError, ECC.construct, curve="Curve25519",
                          point_x=p+39382357235489614581723060781553021112529911719440698176882885853963445705823)
        self.assertRaises(ValueError, ECC.construct, curve="Curve25519",
                          point_x=p*2-1)
        self.assertRaises(ValueError, ECC.construct, curve="Curve25519",
                          point_x=p*2)
        self.assertRaises(ValueError, ECC.construct, curve="Curve25519",
                          point_x=p*2+1)


def get_tests(config={}):
    tests = []
    tests += list_test_cases(TestEccPoint_Curve25519)
    tests += list_test_cases(TestEccKey_Curve25519)
    tests += list_test_cases(TestEccModule_Curve25519)
    return tests


if __name__ == '__main__':
    def suite():
        return unittest.TestSuite(get_tests())
    unittest.main(defaultTest='suite')
