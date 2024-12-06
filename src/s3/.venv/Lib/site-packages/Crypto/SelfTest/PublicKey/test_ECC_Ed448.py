# ===================================================================
#
# Copyright (c) 2022, Legrandin <helderijs@gmail.com>
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
from Crypto.SelfTest.loader import load_test_vectors

from Crypto.PublicKey import ECC
from Crypto.PublicKey.ECC import EccPoint, _curves, EccKey

from Crypto.Math.Numbers import Integer

from Crypto.Hash import SHAKE128


class TestEccPoint_Ed448(unittest.TestCase):

    Gxy = {"x": 0x4f1970c66bed0ded221d15a622bf36da9e146570470f1767ea6de324a3d3a46412ae1af72ab66511433b80e18b00938e2626a82bc70cc05e,
           "y": 0x693f46716eb6bc248876203756c9c7624bea73736ca3984087789c1e05a0c2d73ad3ff1ce67c39c4fdbd132c4ed7c8ad9808795bf230fa14}

    G2xy = {"x": 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa955555555555555555555555555555555555555555555555555555555,
            "y": 0xae05e9634ad7048db359d6205086c2b0036ed7a035884dd7b7e36d728ad8c4b80d6565833a2a3098bbbcb2bed1cda06bdaeafbcdea9386ed}

    G3xy = {"x": 0x865886b9108af6455bd64316cb6943332241b8b8cda82c7e2ba077a4a3fcfe8daa9cbf7f6271fd6e862b769465da8575728173286ff2f8f,
            "y": 0xe005a8dbd5125cf706cbda7ad43aa6449a4a8d952356c3b9fce43c82ec4e1d58bb3a331bdb6767f0bffa9a68fed02dafb822ac13588ed6fc}

    pointG = EccPoint(Gxy['x'], Gxy['y'], curve="ed448")
    pointG2 = EccPoint(G2xy['x'], G2xy['y'], curve="ed448")
    pointG3 = EccPoint(G3xy['x'], G3xy['y'], curve="ed448")

    def test_curve_attribute(self):
        self.assertEqual(self.pointG.curve, "Ed448")

    def test_init_xy(self):
        EccPoint(self.Gxy['x'], self.Gxy['y'], curve="Ed448")

        # Neutral point
        pai = EccPoint(0, 1, curve="Ed448")
        self.assertEqual(pai.x, 0)
        self.assertEqual(pai.y, 1)
        self.assertEqual(pai.xy, (0, 1))

        # G
        bp = self.pointG.copy()
        self.assertEqual(bp.x, 0x4f1970c66bed0ded221d15a622bf36da9e146570470f1767ea6de324a3d3a46412ae1af72ab66511433b80e18b00938e2626a82bc70cc05e)
        self.assertEqual(bp.y, 0x693f46716eb6bc248876203756c9c7624bea73736ca3984087789c1e05a0c2d73ad3ff1ce67c39c4fdbd132c4ed7c8ad9808795bf230fa14)
        self.assertEqual(bp.xy, (bp.x, bp.y))

        # 2G
        bp2 = self.pointG2.copy()
        self.assertEqual(bp2.x, 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa955555555555555555555555555555555555555555555555555555555)
        self.assertEqual(bp2.y, 0xae05e9634ad7048db359d6205086c2b0036ed7a035884dd7b7e36d728ad8c4b80d6565833a2a3098bbbcb2bed1cda06bdaeafbcdea9386ed)
        self.assertEqual(bp2.xy, (bp2.x, bp2.y))

        # 5G
        EccPoint(x=0x7a9f9335a48dcb0e2ba7601eedb50def80cbcf728562ada756d761e8958812808bc0d57a920c3c96f07b2d8cefc6f950d0a99d1092030034,
                 y=0xadfd751a2517edd3b9109ce4fd580ade260ca1823ab18fced86551f7b698017127d7a4ee59d2b33c58405512881f225443b4731472f435eb,
                 curve="Ed448")

        # Catch if point is not on the curve
        self.assertRaises(ValueError, EccPoint, 34, 35, curve="Ed448")

    def test_set(self):
        pointW = EccPoint(0, 1, curve="Ed448")
        pointW.set(self.pointG)
        self.assertEqual(pointW.x, self.pointG.x)
        self.assertEqual(pointW.y, self.pointG.y)

    def test_copy(self):
        pointW = self.pointG.copy()
        self.assertEqual(pointW.x, self.pointG.x)
        self.assertEqual(pointW.y, self.pointG.y)

    def test_equal(self):
        pointH = self.pointG.copy()
        pointI = self.pointG2.copy()
        self.assertEqual(self.pointG, pointH)
        self.assertNotEqual(self.pointG, pointI)

    def test_pai(self):
        pai = EccPoint(0, 1, curve="Ed448")
        self.assertTrue(pai.is_point_at_infinity())
        self.assertEqual(pai, pai.point_at_infinity())

    def test_negate(self):
        negG = -self.pointG
        sum = self.pointG + negG
        self.assertTrue(sum.is_point_at_infinity())

    def test_addition(self):
        self.assertEqual(self.pointG + self.pointG2, self.pointG3)
        self.assertEqual(self.pointG2 + self.pointG, self.pointG3)
        self.assertEqual(self.pointG2 + self.pointG.point_at_infinity(), self.pointG2)
        self.assertEqual(self.pointG.point_at_infinity() + self.pointG2, self.pointG2)

        G5 = self.pointG2 + self.pointG3
        self.assertEqual(G5.x, 0x7a9f9335a48dcb0e2ba7601eedb50def80cbcf728562ada756d761e8958812808bc0d57a920c3c96f07b2d8cefc6f950d0a99d1092030034)
        self.assertEqual(G5.y, 0xadfd751a2517edd3b9109ce4fd580ade260ca1823ab18fced86551f7b698017127d7a4ee59d2b33c58405512881f225443b4731472f435eb)

    def test_inplace_addition(self):
        pointH = self.pointG.copy()
        pointH += self.pointG
        self.assertEqual(pointH, self.pointG2)
        pointH += self.pointG
        self.assertEqual(pointH, self.pointG3)
        pointH += self.pointG.point_at_infinity()
        self.assertEqual(pointH, self.pointG3)

    def test_doubling(self):
        pointH = self.pointG.copy()
        pointH.double()
        self.assertEqual(pointH.x, self.pointG2.x)
        self.assertEqual(pointH.y, self.pointG2.y)

        # 2*0
        pai = self.pointG.point_at_infinity()
        pointR = pai.copy()
        pointR.double()
        self.assertEqual(pointR, pai)

    def test_scalar_multiply(self):
        d = 0
        pointH = d * self.pointG
        self.assertEqual(pointH.x, 0)
        self.assertEqual(pointH.y, 1)

        d = 1
        pointH = d * self.pointG
        self.assertEqual(pointH.x, self.pointG.x)
        self.assertEqual(pointH.y, self.pointG.y)

        d = 2
        pointH = d * self.pointG
        self.assertEqual(pointH.x, self.pointG2.x)
        self.assertEqual(pointH.y, self.pointG2.y)

        d = 3
        pointH = d * self.pointG
        self.assertEqual(pointH.x, self.pointG3.x)
        self.assertEqual(pointH.y, self.pointG3.y)

        d = 4
        pointH = d * self.pointG
        self.assertEqual(pointH.x, 0x49dcbc5c6c0cce2c1419a17226f929ea255a09cf4e0891c693fda4be70c74cc301b7bdf1515dd8ba21aee1798949e120e2ce42ac48ba7f30)
        self.assertEqual(pointH.y, 0xd49077e4accde527164b33a5de021b979cb7c02f0457d845c90dc3227b8a5bc1c0d8f97ea1ca9472b5d444285d0d4f5b32e236f86de51839)

        d = 5
        pointH = d * self.pointG
        self.assertEqual(pointH.x, 0x7a9f9335a48dcb0e2ba7601eedb50def80cbcf728562ada756d761e8958812808bc0d57a920c3c96f07b2d8cefc6f950d0a99d1092030034)
        self.assertEqual(pointH.y, 0xadfd751a2517edd3b9109ce4fd580ade260ca1823ab18fced86551f7b698017127d7a4ee59d2b33c58405512881f225443b4731472f435eb)

        d = 10
        pointH = d * self.pointG
        self.assertEqual(pointH.x, 0x77486f9d19f6411cdd35d30d1c3235f71936452c787e5c034134d3e8172278aca61622bc805761ce3dab65118a0122d73b403165d0ed303d)
        self.assertEqual(pointH.y, 0x4d2fea0b026be11024f1f0fe7e94e618e8ac17381ada1d1bf7ee293a68ff5d0bf93c1997dc1aabdc0c7e6381428d85b6b1954a89e4cddf67)

        d = 20
        pointH = d * self.pointG
        self.assertEqual(pointH.x, 0x3c236422354600fe6763defcc1503737e4ed89e262d0de3ec1e552020f2a56fe3b9e1e012d021072598c3c2821e18268bb8fb8339c0d1216)
        self.assertEqual(pointH.y, 0xb555b9721f630ccb05fc466de4c74d3d2781e69eca88e1b040844f04cab39fd946f91c688fa42402bb38fb9c3e61231017020b219b4396e1)

        d = 255
        pointH = d * self.pointG
        self.assertEqual(pointH.x, 0xbeb7f8388b05cd9c1aa2e3c0dcf31e2b563659361826225390e7748654f627d5c36cbe627e9019936b56d15d4dad7c337c09bac64ff4197f)
        self.assertEqual(pointH.y, 0x1e37312b2dd4e9440c43c6e7725fc4fa3d11e582d4863f1d018e28f50c0efdb1f53f9b01ada7c87fa162b1f0d72401015d57613d25f1ad53)

        d = 256
        pointH = d * self.pointG
        self.assertEqual(pointH.x, 0xf19c34feb56730e3e2be761ac0a2a2b24853b281dda019fc35a5ab58e3696beb39609ae756b0d20fb7ccf0d79aaf5f3bca2e4fdb25bfac1c)
        self.assertEqual(pointH.y, 0x3beb69cc9111bffcaddc61d363ce6fe5dd44da4aadce78f52e92e985d5442344ced72c4611ed0daac9f4f5661eab73d7a12d25ce8a30241e)

    def test_sizes(self):
        self.assertEqual(self.pointG.size_in_bits(), 448)
        self.assertEqual(self.pointG.size_in_bytes(), 56)


class TestEccKey_Ed448(unittest.TestCase):

    def test_private_key(self):
        seed = unhexlify("4adf5d37ac6785e83e99a924f92676d366a78690af59c92b6bdf14f9cdbcf26fdad478109607583d633b60078d61d51d81b7509c5433b0d4c9")
        Px = 0x72a01eea003a35f9ac44231dc4aae2a382f351d80bf32508175b0855edcf389aa2bbf308dd961ce361a6e7c2091bc78957f6ebcf3002a617
        Py = 0x9e0d08d84586e9aeefecacb41d049b831f1a3ee0c3eada63e34557b30702b50ab59fb372feff7c30b8cbb7dd51afbe88444ec56238722ec1

        key = EccKey(curve="Ed448", seed=seed)
        self.assertEqual(key.seed, seed)
        self.assertEqual(key.d, 0xb07cf179604f83433186e5178760c759c15125ee54ff6f8dcde46e872b709ac82ed0bd0a4e036d774034dcb18a9fb11894657a1485895f80)
        self.assertTrue(key.has_private())
        self.assertEqual(key.pointQ.x, Px)
        self.assertEqual(key.pointQ.y, Py)

        point = EccPoint(Px, Py, "ed448")
        key = EccKey(curve="Ed448", seed=seed, point=point)
        self.assertEqual(key.d, 0xb07cf179604f83433186e5178760c759c15125ee54ff6f8dcde46e872b709ac82ed0bd0a4e036d774034dcb18a9fb11894657a1485895f80)
        self.assertTrue(key.has_private())
        self.assertEqual(key.pointQ, point)

        # Other names
        key = EccKey(curve="ed448", seed=seed)

        # Must not accept d parameter
        self.assertRaises(ValueError, EccKey, curve="ed448", d=1)

    def test_public_key(self):
        point = EccPoint(_curves['ed448'].Gx, _curves['ed448'].Gy, curve='ed448')
        key = EccKey(curve="ed448", point=point)
        self.assertFalse(key.has_private())
        self.assertEqual(key.pointQ, point)

    def test_public_key_derived(self):
        priv_key = EccKey(curve="ed448", seed=b'H'*57)
        pub_key = priv_key.public_key()
        self.assertFalse(pub_key.has_private())
        self.assertEqual(priv_key.pointQ, pub_key.pointQ)

    def test_invalid_seed(self):
        self.assertRaises(ValueError, lambda: EccKey(curve="ed448", seed=b'H' * 56))

    def test_equality(self):
        private_key = ECC.construct(seed=b'H'*57, curve="Ed448")
        private_key2 = ECC.construct(seed=b'H'*57, curve="ed448")
        private_key3 = ECC.construct(seed=b'C'*57, curve="Ed448")

        public_key = private_key.public_key()
        public_key2 = private_key2.public_key()
        public_key3 = private_key3.public_key()

        self.assertEqual(private_key, private_key2)
        self.assertNotEqual(private_key, private_key3)

        self.assertEqual(public_key, public_key2)
        self.assertNotEqual(public_key, public_key3)

        self.assertNotEqual(public_key, private_key)

    def test_name_consistency(self):
        key = ECC.generate(curve='ed448')
        self.assertIn("curve='Ed448'", repr(key))
        self.assertEqual(key.curve, 'Ed448')
        self.assertEqual(key.public_key().curve, 'Ed448')


class TestEccModule_Ed448(unittest.TestCase):

    def test_generate(self):
        key = ECC.generate(curve="Ed448")
        self.assertTrue(key.has_private())
        point = EccPoint(_curves['Ed448'].Gx, _curves['Ed448'].Gy, curve="Ed448") * key.d
        self.assertEqual(key.pointQ, point)

        # Always random
        key2 = ECC.generate(curve="Ed448")
        self.assertNotEqual(key, key2)

        # Other names
        ECC.generate(curve="Ed448")

        # Random source
        key1 = ECC.generate(curve="Ed448", randfunc=SHAKE128.new().read)
        key2 = ECC.generate(curve="Ed448", randfunc=SHAKE128.new().read)
        self.assertEqual(key1, key2)

    def test_construct(self):
        seed = unhexlify("4adf5d37ac6785e83e99a924f92676d366a78690af59c92b6bdf14f9cdbcf26fdad478109607583d633b60078d61d51d81b7509c5433b0d4c9")
        Px = 0x72a01eea003a35f9ac44231dc4aae2a382f351d80bf32508175b0855edcf389aa2bbf308dd961ce361a6e7c2091bc78957f6ebcf3002a617
        Py = 0x9e0d08d84586e9aeefecacb41d049b831f1a3ee0c3eada63e34557b30702b50ab59fb372feff7c30b8cbb7dd51afbe88444ec56238722ec1
        d = 0xb07cf179604f83433186e5178760c759c15125ee54ff6f8dcde46e872b709ac82ed0bd0a4e036d774034dcb18a9fb11894657a1485895f80
        point = EccPoint(Px, Py, curve="Ed448")

        # Private key only
        key = ECC.construct(curve="Ed448", seed=seed)
        self.assertEqual(key.pointQ, point)
        self.assertTrue(key.has_private())

        # Public key only
        key = ECC.construct(curve="Ed448", point_x=Px, point_y=Py)
        self.assertEqual(key.pointQ, point)
        self.assertFalse(key.has_private())

        # Private and public key
        key = ECC.construct(curve="Ed448", seed=seed, point_x=Px, point_y=Py)
        self.assertEqual(key.pointQ, point)
        self.assertTrue(key.has_private())

        # Other names
        key = ECC.construct(curve="ed448", seed=seed)

    def test_negative_construct(self):
        coord = dict(point_x=10, point_y=4)
        coordG = dict(point_x=_curves['ed448'].Gx, point_y=_curves['ed448'].Gy)

        self.assertRaises(ValueError, ECC.construct, curve="Ed448", **coord)
        self.assertRaises(ValueError, ECC.construct, curve="Ed448", d=2, **coordG)
        self.assertRaises(ValueError, ECC.construct, curve="Ed448", seed=b'H'*58)


def get_tests(config={}):
    tests = []
    tests += list_test_cases(TestEccPoint_Ed448)
    tests += list_test_cases(TestEccKey_Ed448)
    tests += list_test_cases(TestEccModule_Ed448)
    return tests


if __name__ == '__main__':
    def suite():
        return unittest.TestSuite(get_tests())
    unittest.main(defaultTest='suite')
