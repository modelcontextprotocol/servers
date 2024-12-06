import re
import base64
import unittest
from binascii import hexlify, unhexlify

from Crypto.Util.py3compat import bord

from Crypto.Hash import SHA256
from Crypto.PublicKey import ECC
from Crypto.SelfTest.st_common import list_test_cases
from Crypto.SelfTest.loader import load_test_vectors, load_test_vectors_wycheproof

from Crypto.Protocol import DH
from Crypto.Protocol.DH import (key_agreement,
                                import_x25519_public_key,
                                import_x25519_private_key)


class FIPS_ECDH_Tests_KAT(unittest.TestCase):
    pass


test_vectors_verify = load_test_vectors(("Protocol", ),
                                        "KAS_ECC_CDH_PrimitiveTest.txt",
                                        "ECC CDH Primitive (SP800-56A Section 5.7.1.2)",
                                        {
                                        'qcavsx': lambda x: int(x, 16),
                                        'qcavsy': lambda x: int(x, 16),
                                        'diut': lambda x: int(x, 16),
                                        'qiutx': lambda x: int(x, 16),
                                        'qiuty': lambda x: int(x, 16),
                                        }) or []

for idx, tv in enumerate(test_vectors_verify):

    # Stand-alone header with curve name
    if isinstance(tv, str):
        res = re.match(r"\[([A-Za-z0-9-]+)\]", tv)
        assert res
        curve_name = res.group(1)
        continue

    public_key = ECC.construct(curve=curve_name,
                               point_x=tv.qcavsx,
                               point_y=tv.qcavsy)

    private_key = ECC.construct(curve=curve_name,
                                d=tv.diut)

    exp_response = tv.ziut

    def ecdh_test(self,
                  public_key=public_key,
                  private_key=private_key,
                  exp_response=exp_response):
        z = key_agreement(
                static_pub=public_key,
                static_priv=private_key,
                kdf=lambda x: x)
        self.assertEqual(z, exp_response)

    def ecdh_test_rev(self,
                      public_key=public_key,
                      private_key=private_key,
                      exp_response=exp_response):
        z = key_agreement(
                static_pub=public_key,
                static_priv=private_key,
                kdf=lambda x: x)
        self.assertEqual(z, exp_response)

    setattr(FIPS_ECDH_Tests_KAT, "test_verify_positive_%d" % idx, ecdh_test)
    if idx == 1:
        setattr(FIPS_ECDH_Tests_KAT, "test_verify_positive_rev_%d" % idx, ecdh_test_rev)


class TestVectorsECDHWycheproof(unittest.TestCase):

    desc = "Wycheproof ECDH tests"

    def add_tests(self, filename):

        def curve(g):
            return g['curve']

        def private(u):
            return int(u['private'], 16)

        result = load_test_vectors_wycheproof(("Protocol", "wycheproof"),
                                              filename,
                                              "Wycheproof ECDH (%s)"
                                              % filename,
                                              group_tag={'curve': curve},
                                              unit_tag={'private': private},
                                              )
        self.tv += result

    def setUp(self):
        self.tv = []
        self.desc = None

        self.add_tests("ecdh_secp224r1_ecpoint_test.json")
        self.add_tests("ecdh_secp256r1_ecpoint_test.json")
        self.add_tests("ecdh_secp384r1_ecpoint_test.json")
        self.add_tests("ecdh_secp521r1_ecpoint_test.json")

        self.add_tests("ecdh_secp224r1_test.json")
        self.add_tests("ecdh_secp256r1_test.json")
        self.add_tests("ecdh_secp384r1_test.json")
        self.add_tests("ecdh_secp521r1_test.json")

    def shortDescription(self):
        return self.desc

    def test_verify(self, tv):

        if len(tv.public) == 0:
            return

        try:
            if bord(tv.public[0]) == 4:     # SEC1
                public_key = ECC.import_key(tv.public, curve_name=tv.curve)
            else:
                public_key = ECC.import_key(tv.public)
        except ValueError:
            assert tv.warning or not tv.valid
            return

        private_key = ECC.construct(curve=tv.curve, d=tv.private)

        try:
            z = key_agreement(static_pub=public_key,
                              static_priv=private_key,
                              kdf=lambda x: x)
        except ValueError:
            assert not tv.valid
        except TypeError as e:
            assert not tv.valid
            assert "incompatible curve" in str(e)
        else:
            self.assertEqual(z, tv.shared)
            assert tv.valid

    def runTest(self):
        for tv in self.tv:
            self.desc = "Wycheproof ECDH Verify Test #%d (%s, %s)" % (tv.id, tv.comment, tv.filename)
            self.test_verify(tv)


class ECDH_Tests(unittest.TestCase):

    static_priv = ECC.import_key('-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg9VHFVKh2a1aVFifH\n+BiyNaRa2kttEg3165Ye/dJxJ7KhRANCAARImIEXro5ZOcyWU2mq/+d79FEZXtTA\nbKkz1aICQXihQdCMzRNbeNtC9LFLzhu1slRKJ2xsDAlw9r6w6vwtkRzr\n-----END PRIVATE KEY-----')
    static_pub = ECC.import_key('-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgHhmv8zmZ+Nw8fsZd\ns8tlZflyfw2NE1CRS9DWr3Y3O46hRANCAAS3hZVUCbk+uk3w4S/YOraEVGG+WYpk\nNO/vrwzufUUks2GV2OnBQESe0EBk4Jq8gn4ij8Lvs3rZX2yT+XfeATYd\n-----END PRIVATE KEY-----').public_key()

    eph_priv = ECC.import_key('-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgGPdJmFFFKzLPspIr\nE1T2cEjeIf4ajS9CpneP0e2b3AyhRANCAAQBexAA5BYDcXHs2KOksTYUsst4HhPt\nkp0zkgI2virc3OGJFNGPaCCPfFCQJHwLRaEpiq3SoQlgoBwSc8ZPsl3y\n-----END PRIVATE KEY-----')

    eph_pub = ECC.import_key('-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQghaVZXElSEGEojFKF\nOU0JCpxWUWHvWQUR81gwWrOp76ShRANCAATi1Ib2K+YR3AckD8wxypWef7pw5PRw\ntBaB3RDPyE7IjHZC6yu1DbcXoCdtaw+F5DM+4zpl59n5ZaIy/Yl1BdIy\n-----END PRIVATE KEY-----')

    def test_1(self):
        # C(0, 2s)
        kdf = lambda x: SHA256.new(x).digest()
        z = key_agreement(
                kdf=kdf,
                static_pub=self.static_pub,
                static_priv=self.static_priv)
        self.assertEqual(hexlify(z),
                         b"3960a1101d1193cbaffef4cc7202ebff783c22c6d2e0d5d530ffc66dc197ea9c")

    def test_2(self):
        # C(2e, 2s)
        kdf = lambda x: SHA256.new(x).digest()
        z = key_agreement(
                kdf=kdf,
                static_pub=self.static_pub,
                static_priv=self.static_priv,
                eph_pub=self.eph_pub,
                eph_priv=self.eph_priv)
        self.assertEqual(hexlify(z),
                         b"7447b733d40c8fab2c633b3dc61e4a8c742f3a6af7e16fb0cc486f5bdb5d6ba2")

    def test_3(self):
        # C(1e, 2s)
        kdf = lambda x: SHA256.new(x).digest()
        z = key_agreement(
                kdf=kdf,
                static_pub=self.static_pub,
                static_priv=self.static_priv,
                eph_priv=self.eph_priv)
        self.assertEqual(hexlify(z),
                         b"9e977ae45f33bf67f285d064d83e6632bcafe3a7d33fe571233bab4794ace759")

    def test_4(self):
        # C(1e, 2s)
        kdf = lambda x: SHA256.new(x).digest()
        z = key_agreement(
                kdf=kdf,
                static_pub=self.static_pub,
                static_priv=self.static_priv,
                eph_pub=self.eph_pub)
        self.assertEqual(hexlify(z),
                         b"c9532df6aa7e9dbe5fe85da31ee25ff19c179c88691ec4b8328cc2036dcdadf2")

    def test_5(self):
        # C(2e, 1s) is not supported
        kdf = lambda x: SHA256.new(x).digest()
        self.assertRaises(ValueError,
                key_agreement,
                kdf=kdf,
                static_priv=self.static_priv,
                eph_pub=self.eph_pub,
                eph_priv=self.eph_priv)

    def test_6(self):
        # C(2e, 1s) is not supported
        kdf = lambda x: SHA256.new(x).digest()
        self.assertRaises(ValueError,
                key_agreement,
                kdf=kdf,
                static_pub=self.static_pub,
                eph_pub=self.eph_pub,
                eph_priv=self.eph_priv)

    def test_7(self):
        # C(2e, 0)
        kdf = lambda x: SHA256.new(x).digest()
        z = key_agreement(
                kdf=kdf,
                eph_pub=self.eph_pub,
                eph_priv=self.eph_priv)
        self.assertEqual(hexlify(z),
                         b"feb257ebe063078b1391aac07913283d7b642ad7df61b46dfc9cd6f420bb896a")

    def test_8(self):
        # C(1e, 1s)
        kdf = lambda x: SHA256.new(x).digest()
        z = key_agreement(
                kdf=kdf,
                static_priv=self.static_priv,
                eph_pub=self.eph_pub)
        self.assertEqual(hexlify(z),
                         b"ee4dc995117476ed57fd17ff0ed44e9f0466d46b929443bc0db9380317583b04")

    def test_9(self):
        # C(1e, 1s)
        kdf = lambda x: SHA256.new(x).digest()
        z = key_agreement(
                kdf=kdf,
                static_pub=self.static_pub,
                eph_priv=self.eph_priv)
        self.assertEqual(hexlify(z),
                         b"2351cc2014f7c40468fa072b5d30f706eeaeef7507311cd8e59bab3b43f03c51")

    def test_10(self):
        # No private (local) keys
        kdf = lambda x: SHA256.new(x).digest()
        self.assertRaises(ValueError,
                key_agreement,
                kdf=kdf,
                static_pub=self.static_pub,
                eph_pub=self.eph_pub)

    def test_11(self):
        # No public (peer) keys
        kdf = lambda x: SHA256.new(x).digest()
        self.assertRaises(ValueError,
                key_agreement,
                kdf=kdf,
                static_priv=self.static_priv,
                eph_priv=self.eph_priv)

    def test_12(self):
        # failure if kdf is missing
        self.assertRaises(ValueError,
                key_agreement,
                static_pub=self.static_pub,
                static_priv=self.static_priv)


class X25519_Tests(unittest.TestCase):

    def test_rfc7748_1(self):
        tvs = (
                ("a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4",
                 "e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c",
                 "c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552"),
                ("4b66e9d4d1b4673c5ad22691957d6af5c11b6421e0ea01d42ca4169e7918ba0d",
                 "e5210f12786811d3f4b7959d0538ae2c31dbe7106fc03c3efc4cd549c715a493",
                 "95cbde9476e8907d7aade45cb4b873f88b595a68799fa152e6f8f7647aac7957"),
        )

        for tv1, tv2, tv3 in tvs:
            priv_key = DH.import_x25519_private_key(unhexlify(tv1))
            pub_key = DH.import_x25519_public_key(unhexlify(tv2))
            result = key_agreement(static_pub=pub_key,
                                   static_priv=priv_key,
                                   kdf=lambda x: x)
            self.assertEqual(result, unhexlify(tv3))

    def test_rfc7748_2(self):
        k = unhexlify("0900000000000000000000000000000000000000000000000000000000000000")

        priv_key = DH.import_x25519_private_key(k)
        pub_key = DH.import_x25519_public_key(k)
        result = key_agreement(static_pub=pub_key,
                               static_priv=priv_key,
                               kdf=lambda x: x)
        self.assertEqual(
            result,
            unhexlify("422c8e7a6227d7bca1350b3e2bb7279f7897b87bb6854b783c60e80311ae3079")
        )

        for _ in range(999):
            priv_key = DH.import_x25519_private_key(result)
            pub_key = DH.import_x25519_public_key(k)
            k = result
            result = key_agreement(static_pub=pub_key,
                                   static_priv=priv_key,
                                   kdf=lambda x: x)

        self.assertEqual(
            result,
            unhexlify("684cf59ba83309552800ef566f2f4d3c1c3887c49360e3875f2eb94d99532c51")
        )

    def test_rfc7748_3(self):
        tv1 = "77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a"
        tv2 = "8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a"
        tv3 = "5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb"
        tv4 = "de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f"
        tv5 = "4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742"

        alice_priv_key = DH.import_x25519_private_key(unhexlify(tv1))
        alice_pub_key = DH.import_x25519_public_key(unhexlify(tv2))
        bob_priv_key = DH.import_x25519_private_key(unhexlify(tv3))
        bob_pub_key = DH.import_x25519_public_key(unhexlify(tv4))
        secret = unhexlify(tv5)

        result1 = key_agreement(static_pub=alice_pub_key,
                                static_priv=bob_priv_key,
                                kdf=lambda x: x)
        result2 = key_agreement(static_pub=bob_pub_key,
                                static_priv=alice_priv_key,
                                kdf=lambda x: x)
        self.assertEqual(result1, secret)
        self.assertEqual(result2, secret)

    def test_weak(self):

        weak_keys = (
            "0000000000000000000000000000000000000000000000000000000000000000",
            "0100000000000000000000000000000000000000000000000000000000000000",
            "e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800",
            "5f9c95bca3508c24b1d0b1559c83ef5b04445cc4581c8e86d8224eddd09f1157",
            "ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
            "edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
            "eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
            # The implementation will accept these value, but only because
            # it will set the MSB to zero (as required by RFC7748, Section 5),
            # therefore leading to another public key (and to a point which is
            # not of low order anymore).
            # "cdeb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b880",
            # "4c9c95bca3508c24b1d0b1559c83ef5b04445cc4581c8e86d8224eddd09f11d7",
            # "d9ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
            # "daffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
            # "dbffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        )

        for x in weak_keys:
            self.assertRaises(ValueError,
                              DH.import_x25519_public_key,
                              unhexlify(x))


class X448_Tests(unittest.TestCase):

    def test_rfc7748_1(self):
        tvs = (
                ("3d262fddf9ec8e88495266fea19a34d28882acef045104d0d1aae121700a779c984c24f8cdd78fbff44943eba368f54b29259a4f1c600ad3",
                 "06fce640fa3487bfda5f6cf2d5263f8aad88334cbd07437f020f08f9814dc031ddbdc38c19c6da2583fa5429db94ada18aa7a7fb4ef8a086",
                 "ce3e4ff95a60dc6697da1db1d85e6afbdf79b50a2412d7546d5f239fe14fbaadeb445fc66a01b0779d98223961111e21766282f73dd96b6f"),
                ("203d494428b8399352665ddca42f9de8fef600908e0d461cb021f8c538345dd77c3e4806e25f46d3315c44e0a5b4371282dd2c8d5be3095f",
                 "0fbcc2f993cd56d3305b0b7d9e55d4c1a8fb5dbb52f8e9a1e9b6201b165d015894e56c4d3570bee52fe205e28a78b91cdfbde71ce8d157db",
                 "884a02576239ff7a2f2f63b2db6a9ff37047ac13568e1e30fe63c4a7ad1b3ee3a5700df34321d62077e63633c575c1c954514e99da7c179d"),
        )

        for tv1, tv2, tv3 in tvs:
            priv_key = DH.import_x448_private_key(unhexlify(tv1))
            pub_key = DH.import_x448_public_key(unhexlify(tv2))
            result = key_agreement(static_pub=pub_key,
                                   static_priv=priv_key,
                                   kdf=lambda x: x)
            self.assertEqual(result, unhexlify(tv3))

    def test_rfc7748_2(self):
        k = unhexlify("0500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000")

        priv_key = DH.import_x448_private_key(k)
        pub_key = DH.import_x448_public_key(k)
        result = key_agreement(static_pub=pub_key,
                               static_priv=priv_key,
                               kdf=lambda x: x)
        self.assertEqual(
            result,
            unhexlify("3f482c8a9f19b01e6c46ee9711d9dc14fd4bf67af30765c2ae2b846a4d23a8cd0db897086239492caf350b51f833868b9bc2b3bca9cf4113")
        )

        for _ in range(999):
            priv_key = DH.import_x448_private_key(result)
            pub_key = DH.import_x448_public_key(k)
            k = result
            result = key_agreement(static_pub=pub_key,
                                   static_priv=priv_key,
                                   kdf=lambda x: x)

        self.assertEqual(
            result,
            unhexlify("aa3b4749d55b9daf1e5b00288826c467274ce3ebbdd5c17b975e09d4af6c67cf10d087202db88286e2b79fceea3ec353ef54faa26e219f38")
        )

    def test_rfc7748_3(self):
        tv1 = "9a8f4925d1519f5775cf46b04b5800d4ee9ee8bae8bc5565d498c28dd9c9baf574a9419744897391006382a6f127ab1d9ac2d8c0a598726b"
        tv2 = "9b08f7cc31b7e3e67d22d5aea121074a273bd2b83de09c63faa73d2c22c5d9bbc836647241d953d40c5b12da88120d53177f80e532c41fa0"
        tv3 = "1c306a7ac2a0e2e0990b294470cba339e6453772b075811d8fad0d1d6927c120bb5ee8972b0d3e21374c9c921b09d1b0366f10b65173992d"
        tv4 = "3eb7a829b0cd20f5bcfc0b599b6feccf6da4627107bdb0d4f345b43027d8b972fc3e34fb4232a13ca706dcb57aec3dae07bdc1c67bf33609"
        tv5 = "07fff4181ac6cc95ec1c16a94a0f74d12da232ce40a77552281d282bb60c0b56fd2464c335543936521c24403085d59a449a5037514a879d"

        alice_priv_key = DH.import_x448_private_key(unhexlify(tv1))
        alice_pub_key = DH.import_x448_public_key(unhexlify(tv2))
        bob_priv_key = DH.import_x448_private_key(unhexlify(tv3))
        bob_pub_key = DH.import_x448_public_key(unhexlify(tv4))
        secret = unhexlify(tv5)

        result1 = key_agreement(static_pub=alice_pub_key,
                                static_priv=bob_priv_key,
                                kdf=lambda x: x)
        result2 = key_agreement(static_pub=bob_pub_key,
                                static_priv=alice_priv_key,
                                kdf=lambda x: x)
        self.assertEqual(result1, secret)
        self.assertEqual(result2, secret)

    def test_weak(self):

        weak_keys = (
            "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
            "0100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
            "fefffffffffffffffffffffffffffffffffffffffffffffffffffffffeffffffffffffffffffffffffffffffffffffffffffffffffffffff",
            "fffffffffffffffffffffffffffffffffffffffffffffffffffffffffeffffffffffffffffffffffffffffffffffffffffffffffffffffff",
            "00000000000000000000000000000000000000000000000000000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        )

        for x in weak_keys:
            self.assertRaises(ValueError,
                              DH.import_x448_public_key,
                              unhexlify(x))


class TestVectorsXECDHWycheproof(unittest.TestCase):

    desc = "Wycheproof XECDH tests"

    def add_tests_hex(self, filename):

        def encoding(g):
            return g['type']

        def private(u):
            return unhexlify(u['private'])

        result = load_test_vectors_wycheproof(("Protocol", "wycheproof"),
                                              filename,
                                              "Wycheproof ECDH (%s)"
                                              % filename,
                                              group_tag={'encoding': encoding},
                                              unit_tag={'private': private}
                                              )
        self.tv += result

    def add_tests_ascii(self, filename):

        def encoding(g):
            return g['type']

        def public(u):
            return u['public']

        def private(u):
            return u['private']

        result = load_test_vectors_wycheproof(("Protocol", "wycheproof"),
                                              filename,
                                              "Wycheproof ECDH (%s)"
                                              % filename,
                                              group_tag={'encoding': encoding},
                                              unit_tag={'public': public,
                                                        'private': private}
                                              )
        self.tv += result

    def setUp(self):
        self.tv = []
        self.desc = None

        self.add_tests_hex("x25519_test.json")
        self.add_tests_hex("x25519_asn_test.json")
        self.add_tests_ascii("x25519_pem_test.json")
        self.add_tests_ascii("x25519_jwk_test.json")

    def shortDescription(self):
        return self.desc

    def test_verify(self, tv):

        if tv.encoding == "XdhComp":
            try:
                public_key = import_x25519_public_key(tv.public)
            except ValueError as e:
                assert tv.valid
                assert tv.warning
                assert "LowOrderPublic" in tv.flags
                assert "Invalid Curve25519" in str(e)
                return
            private_key = import_x25519_private_key(tv.private)
        elif tv.encoding in ("XdhAsnComp", "XdhPemComp"):
            try:
                public_key = ECC.import_key(tv.public)
                private_key = ECC.import_key(tv.private)
            except ECC.UnsupportedEccFeature as e:
                assert not tv.valid
                assert "Unsupported ECC" in str(e)
                return
            except ValueError:
                assert tv.valid
                assert tv.warning
                assert "LowOrderPublic" in tv.flags
                return
        elif tv.encoding == "XdhJwkComp":

            if 'y' in tv.public:
                return
            if 'x' not in tv.public:
                return
            if 'x' not in tv.private:
                return
            if tv.public.get('kty') != 'OKP':
                return
            if tv.public.get('crv') != 'X25519':
                return
            if tv.private.get('crv') != 'X25519':
                return

            def base64url_decode(input_str):
                input_str = input_str.replace('-', '+').replace('_', '/')
                padding = 4 - (len(input_str) % 4)
                if padding != 4:
                    input_str += '=' * padding
                decoded_bytes = base64.b64decode(input_str)
                return decoded_bytes

            jwk_public = base64url_decode(tv.public['x'])
            jwk_private = base64url_decode(tv.private['d'])

            try:
                public_key = import_x25519_public_key(jwk_public)
                private_key = import_x25519_private_key(jwk_private)
            except ValueError as e:
                if tv.valid:
                    assert tv.warning
                    assert "LowOrderPublic" in tv.flags
                    assert "Invalid Curve25519" in str(e)
                    return
                else:
                    assert "Incorrect length" in str(e)
                    return
            except ValueError:
                assert tv.valid
        else:
            raise ValueError("Unknown encoding", tv.encoding)

        try:
            z = key_agreement(static_pub=public_key,
                              static_priv=private_key,
                              kdf=lambda x: x)
        except ValueError:
            assert not tv.valid
        except TypeError as e:
            assert not tv.valid
            assert "incompatible curve" in str(e)
        else:
            self.assertEqual(z, tv.shared)
            assert tv.valid

    def runTest(self):
        for tv in self.tv:
            self.desc = "Wycheproof XECDH Verify Test #%d (%s, %s)" % (tv.id, tv.comment, tv.filename)
            self.test_verify(tv)


def get_tests(config={}):

    tests = []
    tests += list_test_cases(FIPS_ECDH_Tests_KAT)
    tests += [TestVectorsECDHWycheproof()]
    tests += list_test_cases(ECDH_Tests)
    tests += list_test_cases(X25519_Tests)
    tests += list_test_cases(X448_Tests)
    tests += [TestVectorsXECDHWycheproof()]

    slow_tests = config.get('slow_tests')
    if slow_tests:
        pass

    return tests


if __name__ == '__main__':
    def suite():
        return unittest.TestSuite(get_tests())
    unittest.main(defaultTest='suite')
