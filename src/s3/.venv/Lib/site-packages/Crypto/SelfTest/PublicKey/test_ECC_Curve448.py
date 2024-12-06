# This file is licensed under the BSD 2-Clause License.
# See https://opensource.org/licenses/BSD-2-Clause for details.

import unittest
from binascii import unhexlify

from Crypto.SelfTest.st_common import list_test_cases
from Crypto.Math.Numbers import Integer
from Crypto.Hash import SHAKE128

from Crypto.PublicKey import ECC
from Crypto.PublicKey.ECC import EccKey, EccXPoint, _curves

CURVE448_P = 2**448 - 2**224 - 1
CURVE448_ORDER = 2**446 - 0x8335dc163bb124b65129c96fde933d8d723a70aadc873d6d54a7bb0d

# Test vectors for scalar multiplication using point with X=5 as base
# Each tuple is (exponent, X-coordinate)
scalar_base5_test = [
    (1, 5),
    (2, 0x6391322257cae3d49aef4665d8bd5cccac9abefb511e83d75f3c766616266fc1bf3747f1da00ed7125e8f0255a1208087d32a4bc1c743cb6),
    (3, 0x1fbe4b3584cab86170c14b9325840b8a2429b61fb93c42492c002a2807a4e7ea63138ea59bf95652ce9a7d13d0321c7511e3314d0553f34c),
    (4, 0x93b44a7b78726ba8d0b048bd7144074f8bdad24ef9d0a6c8264f6c00b135ffcea11545e80d18364acc8ebfbcc45358e0da5fd5e5146e2b1),
    (6, 0x693d165f453bd62871e5e53845f33e9e5b18b24d79c1f9102608aa7ba6f18ac24864012171d64c90b698f5ce5631cd02cee4e4336b1ad88c),
    (9, 0xb970d576e7d9aa427dbf7cb9b7dd65170721d04ee060c9ea8d499dc361d4cfde1ceb19068eae853bac8f5d92827bdbf3d94c22de2fb42dae),
    (129, 0x9fbdb50a1450438fe656aa32aa1bb2548d077d5c3a5d327689093a2996a4f94eacd1fb4f90315edb2afe41908a759f0d6db83fa791df80db),
    (255, 0x31bc3e9385dfd12e1238927061eb0c911466da394e459bf058ba3b08260a258a3c392b0f85ddbd23828657137b88577a85b83774139fab9e),
    (256, 0x735c7f30e6872e5e4215c0147c8a112d697f668c9bd0f92f5f1e4e6badc128a0b654e697cd4bae2144d54e726b54c1fa63a09b00dd3c17f),
    (257, 0x95c1b0ce01286dc047aeb5922a5e62b3effb5b9296273a5004eb456f592728dd494a6fb5996a2ea7011ae6423874a48c2927bfa62d8ce8b0),
    (0x10101, 0x113bb172c9dc52ab45bd665dd9751ed44e33b8596f943c6cb2f8dd329160ece802960b3eb0d2c21ef3a3ac12c20fccbc2a271fc2f061c1b2),
    (0xAA55CC, 0xcf42585d2e0b1e45c0bfd601c91af4b137d7faf139fc761178c7ded432417c307ee1759af2deec6a14dbaf6b868eb13a6039fbdde4b61898),
    (0x1B29A0E579E0A000567, 0x7bd9ec9775a664f4d860d82d6be60895113a7c36f92db25583dbba5dc17f09c136ec27e14857bfd6a705311327030aa657dd036325fad330),
    (CURVE448_ORDER + 1, 5),
]


class TestEccPoint_Curve448(unittest.TestCase):

    v1 = 0x09fa78b39b00a72930bcd8039be789a0997830bb99f79aeeb93493715390b4e8
    v2 = 0x15210f12786811d3f4b7959d0538ae2c31dbe7106fc03c3efc4cd549c715a493

    def test_init(self):
        EccXPoint(5, "curve448")
        EccXPoint(CURVE448_P - 5, "curve448")

    def test_curve_attribute(self):
        point = EccXPoint(5, "curve448")
        self.assertEqual(point.curve, "Curve448")

    def test_init_fail(self):
        self.assertRaises(ValueError, EccXPoint, 3*CURVE448_P, "curve448")
        self.assertRaises(ValueError, EccXPoint, 3, "curve449")

    def test_equal_set(self):
        point1 = EccXPoint(self.v1, "curve448")
        point2 = EccXPoint(self.v2, "curve448")

        self.assertEqual(point1, point1)
        self.assertNotEqual(point1, point2)

        point2.set(point1)
        self.assertEqual(point1.x, point2.x)

    def test_copy(self):
        point1 = EccXPoint(self.v1, "curve448")
        point2 = point1.copy()
        self.assertEqual(point1.x, point2.x)

    def test_pai(self):
        point1 = EccXPoint(self.v1, "curve448")
        pai = point1.point_at_infinity()
        self.assertTrue(pai.point_at_infinity())

        point2 = EccXPoint(None, "curve448")
        self.assertTrue(point2.point_at_infinity())

    def test_scalar_multiply(self):
        base = EccXPoint(5, "curve448")

        pointH = 0 * base
        self.assertTrue(pointH.point_at_infinity())

        pointH = CURVE448_ORDER * base
        self.assertTrue(pointH.point_at_infinity())

        pointH = base * 1
        self.assertEqual(pointH.x, 5)

        for d, result in scalar_base5_test:
            pointH = d * base
            self.assertEqual(pointH.x, result)

    def test_sizes(self):
        point = EccXPoint(5, "curve448")
        self.assertEqual(point.size_in_bits(), 448)
        self.assertEqual(point.size_in_bytes(), 56)


class TestEccKey_Curve448(unittest.TestCase):

    def test_private_key(self):
        # RFC7748 Section 6.2 - Alice
        alice_priv = unhexlify("9a8f4925d1519f5775cf46b04b5800d4ee9ee8bae8bc5565d498c28dd9c9baf574a9419744897391006382a6f127ab1d9ac2d8c0a598726b")
        alice_pub = unhexlify("9b08f7cc31b7e3e67d22d5aea121074a273bd2b83de09c63faa73d2c22c5d9bbc836647241d953d40c5b12da88120d53177f80e532c41fa0")
        alice_pub_x = Integer.from_bytes(alice_pub, byteorder='little')

        key = EccKey(curve="Curve448", seed=alice_priv)
        self.assertEqual(key.seed, alice_priv)
        self.assertTrue(key.has_private())
        self.assertEqual(key.pointQ.x, alice_pub_x)

        # RFC7748 Section 6.2 - Bob
        bob_priv = unhexlify("1c306a7ac2a0e2e0990b294470cba339e6453772b075811d8fad0d1d6927c120bb5ee8972b0d3e21374c9c921b09d1b0366f10b65173992d")
        bob_pub = unhexlify("3eb7a829b0cd20f5bcfc0b599b6feccf6da4627107bdb0d4f345b43027d8b972fc3e34fb4232a13ca706dcb57aec3dae07bdc1c67bf33609")
        bob_pub_x = Integer.from_bytes(bob_pub, byteorder='little')

        key = EccKey(curve="Curve448", seed=bob_priv)
        self.assertEqual(key.seed, bob_priv)
        self.assertTrue(key.has_private())
        self.assertEqual(key.pointQ.x, bob_pub_x)

        # Other names
        key = EccKey(curve="curve448", seed=alice_priv)

        # Must not accept d parameter
        self.assertRaises(ValueError, EccKey, curve="curve448", d=1)

    def test_public_key(self):
        point = EccXPoint(_curves['curve448'].Gx,
                          curve='curve448')
        key = EccKey(curve="curve448", point=point)
        self.assertFalse(key.has_private())
        self.assertEqual(key.pointQ, point)

    def test_public_key_derived(self):
        priv_key = EccKey(curve="curve448", seed=b'H'*56)
        pub_key = priv_key.public_key()
        self.assertFalse(pub_key.has_private())
        self.assertEqual(priv_key.pointQ, pub_key.pointQ)

    def test_invalid_seed(self):
        self.assertRaises(ValueError, lambda: EccKey(curve="curve448",
                                                     seed=b'H' * 55))

    def test_equality(self):
        private_key = ECC.construct(seed=b'H'*56, curve="Curve448")
        private_key2 = ECC.construct(seed=b'H'*56, curve="curve448")
        private_key3 = ECC.construct(seed=b'C'*56, curve="Curve448")

        public_key = private_key.public_key()
        public_key2 = private_key2.public_key()
        public_key3 = private_key3.public_key()

        self.assertEqual(private_key, private_key2)
        self.assertNotEqual(private_key, private_key3)

        self.assertEqual(public_key, public_key2)
        self.assertNotEqual(public_key, public_key3)

        self.assertNotEqual(public_key, private_key)

    def test_name_consistency(self):
        key = ECC.generate(curve='curve448')
        self.assertIn("curve='Curve448'", repr(key))
        self.assertEqual(key.curve, 'Curve448')
        self.assertEqual(key.public_key().curve, 'Curve448')


class TestEccModule_Curve448(unittest.TestCase):

    def test_generate(self):
        key = ECC.generate(curve="Curve448")
        self.assertTrue(key.has_private())
        point = EccXPoint(_curves['Curve448'].Gx, curve="Curve448") * key.d
        self.assertEqual(key.pointQ, point)

        # Always random
        key2 = ECC.generate(curve="Curve448")
        self.assertNotEqual(key, key2)

        # Other names
        ECC.generate(curve="curve448")

        # Random source
        key1 = ECC.generate(curve="Curve448", randfunc=SHAKE128.new().read)
        key2 = ECC.generate(curve="Curve448", randfunc=SHAKE128.new().read)
        self.assertEqual(key1, key2)

    def test_construct(self):
        seed = unhexlify("9a8f4925d1519f5775cf46b04b5800d4ee9ee8bae8bc5565d498c28dd9c9baf574a9419744897391006382a6f127ab1d9ac2d8c0a598726b")
        point_hex = unhexlify("9b08f7cc31b7e3e67d22d5aea121074a273bd2b83de09c63faa73d2c22c5d9bbc836647241d953d40c5b12da88120d53177f80e532c41fa0")
        Px = Integer.from_bytes(point_hex, byteorder='little')
        point = EccXPoint(Px, curve="Curve448")

        # Private key only
        key = ECC.construct(curve="Curve448", seed=seed)
        self.assertEqual(key.pointQ, point)
        self.assertTrue(key.has_private())

        # Public key only
        key = ECC.construct(curve="Curve448", point_x=Px)
        self.assertEqual(key.pointQ, point)
        self.assertFalse(key.has_private())

        # Private and public key
        key = ECC.construct(curve="Curve448", seed=seed, point_x=Px)
        self.assertEqual(key.pointQ, point)
        self.assertTrue(key.has_private())

        # Other names
        key = ECC.construct(curve="curve448", seed=seed)

    def test_negative_construct(self):
        coordG = dict(point_x=_curves['curve448'].Gx)

        self.assertRaises(ValueError, ECC.construct, curve="Curve448",
                          d=2, **coordG)
        self.assertRaises(ValueError, ECC.construct, curve="Curve448",
                          seed=b'H'*55)

        # Verify you cannot construct weak keys (small-order points)
        self.assertRaises(ValueError, ECC.construct, curve="Curve448",
                          point_x=0)
        self.assertRaises(ValueError, ECC.construct, curve="Curve448",
                          point_x=1)
        p = 2**448 - 2**224 - 1
        self.assertRaises(ValueError, ECC.construct, curve="Curve448",
                          point_x=p-1)
        self.assertRaises(ValueError, ECC.construct, curve="Curve448",
                          point_x=p)
        self.assertRaises(ValueError, ECC.construct, curve="Curve448",
                          point_x=p+1)


def get_tests(config={}):
    tests = []
    tests += list_test_cases(TestEccPoint_Curve448)
    tests += list_test_cases(TestEccKey_Curve448)
    tests += list_test_cases(TestEccModule_Curve448)
    return tests


if __name__ == '__main__':
    def suite():
        return unittest.TestSuite(get_tests())
    unittest.main(defaultTest='suite')
