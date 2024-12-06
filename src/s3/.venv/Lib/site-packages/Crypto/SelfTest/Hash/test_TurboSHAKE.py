"""Self-test suite for Crypto.Hash.TurboSHAKE128 and TurboSHAKE256"""

import unittest
from binascii import unhexlify

from Crypto.SelfTest.st_common import list_test_cases

from Crypto.Hash import TurboSHAKE128, TurboSHAKE256
from Crypto.Util.py3compat import bchr


class TurboSHAKETest(unittest.TestCase):

    def test_new_positive(self):

        xof1 = self.TurboSHAKE.new()
        xof1.update(b'90')

        xof2 = self.TurboSHAKE.new(domain=0x1F)
        xof2.update(b'90')

        xof3 = self.TurboSHAKE.new(data=b'90')

        out1 = xof1.read(128)
        out2 = xof2.read(128)
        out3 = xof3.read(128)

        self.assertEqual(out1, out2)
        self.assertEqual(out1, out3)

    def test_new_domain(self):
        xof1 = self.TurboSHAKE.new(domain=0x1D)
        xof2 = self.TurboSHAKE.new(domain=0x20)
        self.assertNotEqual(xof1.read(128), xof2.read(128))

    def test_update(self):
        pieces = [bchr(10) * 200, bchr(20) * 300]

        xof1 = self.TurboSHAKE.new()
        xof1.update(pieces[0]).update(pieces[1])
        digest1 = xof1.read(10)

        xof2 = self.TurboSHAKE.new()
        xof2.update(pieces[0] + pieces[1])
        digest2 = xof2.read(10)

        self.assertEqual(digest1, digest2)

    def test_update_negative(self):
        xof1 = self.TurboSHAKE.new()
        self.assertRaises(TypeError, xof1.update, u"string")

    def test_read(self):
        xof1 = self.TurboSHAKE.new()
        digest = xof1.read(90)

        # read returns a byte string of the right length
        self.assertTrue(isinstance(digest, bytes))
        self.assertEqual(len(digest), 90)

    def test_update_after_read(self):
        xof1 = self.TurboSHAKE.new()
        xof1.update(b"rrrr")
        xof1.read(90)
        self.assertRaises(TypeError, xof1.update, b"ttt")

    def test_new(self):
        xof1 = self.TurboSHAKE.new(domain=0x07)
        xof1.update(b'90')
        digest1 = xof1.read(100)

        xof2 = xof1.new()
        xof2.update(b'90')
        digest2 = xof2.read(100)

        self.assertEqual(digest1, digest2)

        self.assertRaises(TypeError, xof1.new, domain=0x07)


class TurboSHAKE128Test(TurboSHAKETest):
    TurboSHAKE = TurboSHAKE128


class TurboSHAKE256Test(TurboSHAKETest):
    TurboSHAKE = TurboSHAKE256


def txt2bin(txt):
    clean = txt.replace(" ", "").replace("\n", "").replace("\r", "")
    return unhexlify(clean)


def ptn(n):
    res = bytearray(n)
    pattern = b"".join([bchr(x) for x in range(0, 0xFB)])
    for base in range(0, n - 0xFB, 0xFB):
        res[base:base + 0xFB] = pattern
    remain = n % 0xFB
    if remain:
        base = (n // 0xFB) * 0xFB
        res[base:] = pattern[:remain]
    assert len(res) == n
    return res


def chunked(source, size):
    for i in range(0, len(source), size):
        yield source[i:i+size]


class TurboSHAKE128TV(unittest.TestCase):

    def test_zero_1(self):
        tv = """1E 41 5F 1C 59 83 AF F2 16 92 17 27 7D 17 BB 53
        8C D9 45 A3 97 DD EC 54 1F 1C E4 1A F2 C1 B7 4C"""

        btv = txt2bin(tv)
        res = TurboSHAKE128.new().read(32)
        self.assertEqual(res, btv)

    def test_zero_2(self):
        tv = """1E 41 5F 1C 59 83 AF F2 16 92 17 27 7D 17 BB 53
        8C D9 45 A3 97 DD EC 54 1F 1C E4 1A F2 C1 B7 4C
        3E 8C CA E2 A4 DA E5 6C 84 A0 4C 23 85 C0 3C 15
        E8 19 3B DF 58 73 73 63 32 16 91 C0 54 62 C8 DF"""

        btv = txt2bin(tv)
        res = TurboSHAKE128.new().read(64)
        self.assertEqual(res, btv)

    def test_zero_3(self):
        tv = """A3 B9 B0 38 59 00 CE 76 1F 22 AE D5 48 E7 54 DA
        10 A5 24 2D 62 E8 C6 58 E3 F3 A9 23 A7 55 56 07"""

        btv = txt2bin(tv)
        res = TurboSHAKE128.new().read(10032)[-32:]
        self.assertEqual(res, btv)

    def test_ptn_1(self):
        tv = """55 CE DD 6F 60 AF 7B B2 9A 40 42 AE 83 2E F3 F5
        8D B7 29 9F 89 3E BB 92 47 24 7D 85 69 58 DA A9"""

        btv = txt2bin(tv)
        res = TurboSHAKE128.new(data=ptn(1)).read(32)
        self.assertEqual(res, btv)

    def test_ptn_17(self):
        tv = """9C 97 D0 36 A3 BA C8 19 DB 70 ED E0 CA 55 4E C6
        E4 C2 A1 A4 FF BF D9 EC 26 9C A6 A1 11 16 12 33"""

        btv = txt2bin(tv)
        res = TurboSHAKE128.new(data=ptn(17)).read(32)
        self.assertEqual(res, btv)

    def test_ptn_17_2(self):
        tv = """96 C7 7C 27 9E 01 26 F7 FC 07 C9 B0 7F 5C DA E1
        E0 BE 60 BD BE 10 62 00 40 E7 5D 72 23 A6 24 D2"""

        btv = txt2bin(tv)
        res = TurboSHAKE128.new(data=ptn(17**2)).read(32)
        self.assertEqual(res, btv)

    def test_ptn_17_3(self):
        tv = """D4 97 6E B5 6B CF 11 85 20 58 2B 70 9F 73 E1 D6
        85 3E 00 1F DA F8 0E 1B 13 E0 D0 59 9D 5F B3 72"""

        btv = txt2bin(tv)
        res = TurboSHAKE128.new(data=ptn(17**3)).read(32)
        self.assertEqual(res, btv)

    def test_ptn_17_4(self):
        tv = """DA 67 C7 03 9E 98 BF 53 0C F7 A3 78 30 C6 66 4E
        14 CB AB 7F 54 0F 58 40 3B 1B 82 95 13 18 EE 5C"""

        btv = txt2bin(tv)
        data = ptn(17**4)

        # All at once
        res = TurboSHAKE128.new(data=data).read(32)
        self.assertEqual(res, btv)

        # Byte by byte
        xof = TurboSHAKE128.new()
        for x in data:
            xof.update(bchr(x))
        res = xof.read(32)
        self.assertEqual(res, btv)

        # Chunks of various prime sizes
        for chunk_size in (13, 17, 19, 23, 31):
            xof = TurboSHAKE128.new()
            for x in chunked(data, chunk_size):
                xof.update(x)
            res = xof.read(32)
            self.assertEqual(res, btv)

    def test_ptn_17_5(self):
        tv = """B9 7A 90 6F BF 83 EF 7C 81 25 17 AB F3 B2 D0 AE
        A0 C4 F6 03 18 CE 11 CF 10 39 25 12 7F 59 EE CD"""

        btv = txt2bin(tv)
        data = ptn(17**5)

        # All at once
        res = TurboSHAKE128.new(data=data).read(32)
        self.assertEqual(res, btv)

        # Chunks
        xof = TurboSHAKE128.new()
        for chunk in chunked(data, 8192):
            xof.update(chunk)
        res = xof.read(32)
        self.assertEqual(res, btv)

    def test_ptn_17_6(self):
        tv = """35 CD 49 4A DE DE D2 F2 52 39 AF 09 A7 B8 EF 0C
        4D 1C A4 FE 2D 1A C3 70 FA 63 21 6F E7 B4 C2 B1"""

        btv = txt2bin(tv)
        data = ptn(17**6)

        res = TurboSHAKE128.new(data=data).read(32)
        self.assertEqual(res, btv)

    def test_ffffff_d01(self):
        tv = """BF 32 3F 94 04 94 E8 8E E1 C5 40 FE 66 0B E8 A0
        C9 3F 43 D1 5E C0 06 99 84 62 FA 99 4E ED 5D AB"""

        btv = txt2bin(tv)
        res = TurboSHAKE128.new(data=b"\xff\xff\xff", domain=0x01).read(32)
        self.assertEqual(res, btv)

    def test_ff_d06(self):
        tv = """8E C9 C6 64 65 ED 0D 4A 6C 35 D1 35 06 71 8D 68
        7A 25 CB 05 C7 4C CA 1E 42 50 1A BD 83 87 4A 67"""

        btv = txt2bin(tv)
        res = TurboSHAKE128.new(data=b'\xFF', domain=0x06).read(32)
        self.assertEqual(res, btv)

    def test_ffffff_d07(self):
        tv = """B6 58 57 60 01 CA D9 B1 E5 F3 99 A9 F7 77 23 BB
        A0 54 58 04 2D 68 20 6F 72 52 68 2D BA 36 63 ED"""

        btv = txt2bin(tv)
        res = TurboSHAKE128.new(data=b'\xFF' * 3, domain=0x07).read(32)
        self.assertEqual(res, btv)

    def test_ffffffffffff_d0b(self):
        tv = """8D EE AA 1A EC 47 CC EE 56 9F 65 9C 21 DF A8 E1
        12 DB 3C EE 37 B1 81 78 B2 AC D8 05 B7 99 CC 37"""

        btv = txt2bin(tv)
        res = TurboSHAKE128.new(data=b'\xFF' * 7, domain=0x0B).read(32)
        self.assertEqual(res, btv)

    def test_ff_d30(self):
        tv = """55 31 22 E2 13 5E 36 3C 32 92 BE D2 C6 42 1F A2
        32 BA B0 3D AA 07 C7 D6 63 66 03 28 65 06 32 5B"""

        btv = txt2bin(tv)
        res = TurboSHAKE128.new(data=b'\xFF', domain=0x30).read(32)
        self.assertEqual(res, btv)

    def test_ffffff_d7f(self):
        tv = """16 27 4C C6 56 D4 4C EF D4 22 39 5D 0F 90 53 BD
        A6 D2 8E 12 2A BA 15 C7 65 E5 AD 0E 6E AF 26 F9"""

        btv = txt2bin(tv)
        res = TurboSHAKE128.new(data=b'\xFF' * 3, domain=0x7F).read(32)
        self.assertEqual(res, btv)


class TurboSHAKE256TV(unittest.TestCase):

    def test_zero_1(self):
        tv = """36 7A 32 9D AF EA 87 1C 78 02 EC 67 F9 05 AE 13
        C5 76 95 DC 2C 66 63 C6 10 35 F5 9A 18 F8 E7 DB
        11 ED C0 E1 2E 91 EA 60 EB 6B 32 DF 06 DD 7F 00
        2F BA FA BB 6E 13 EC 1C C2 0D 99 55 47 60 0D B0"""

        btv = txt2bin(tv)
        res = TurboSHAKE256.new().read(64)
        self.assertEqual(res, btv)

    def test_zero_2(self):
        tv = """AB EF A1 16 30 C6 61 26 92 49 74 26 85 EC 08 2F
        20 72 65 DC CF 2F 43 53 4E 9C 61 BA 0C 9D 1D 75"""

        btv = txt2bin(tv)
        res = TurboSHAKE256.new().read(10032)[-32:]
        self.assertEqual(res, btv)

    def test_ptn_1(self):
        tv = """3E 17 12 F9 28 F8 EA F1 05 46 32 B2 AA 0A 24 6E
        D8 B0 C3 78 72 8F 60 BC 97 04 10 15 5C 28 82 0E
        90 CC 90 D8 A3 00 6A A2 37 2C 5C 5E A1 76 B0 68
        2B F2 2B AE 74 67 AC 94 F7 4D 43 D3 9B 04 82 E2"""

        btv = txt2bin(tv)
        res = TurboSHAKE256.new(data=ptn(1)).read(64)
        self.assertEqual(res, btv)

    def test_ptn_17(self):
        tv = """B3 BA B0 30 0E 6A 19 1F BE 61 37 93 98 35 92 35
        78 79 4E A5 48 43 F5 01 10 90 FA 2F 37 80 A9 E5
        CB 22 C5 9D 78 B4 0A 0F BF F9 E6 72 C0 FB E0 97
        0B D2 C8 45 09 1C 60 44 D6 87 05 4D A5 D8 E9 C7"""

        btv = txt2bin(tv)
        res = TurboSHAKE256.new(data=ptn(17)).read(64)
        self.assertEqual(res, btv)

    def test_ptn_17_2(self):
        tv = """66 B8 10 DB 8E 90 78 04 24 C0 84 73 72 FD C9 57
        10 88 2F DE 31 C6 DF 75 BE B9 D4 CD 93 05 CF CA
        E3 5E 7B 83 E8 B7 E6 EB 4B 78 60 58 80 11 63 16
        FE 2C 07 8A 09 B9 4A D7 B8 21 3C 0A 73 8B 65 C0"""

        btv = txt2bin(tv)
        res = TurboSHAKE256.new(data=ptn(17**2)).read(64)
        self.assertEqual(res, btv)

    def test_ptn_17_3(self):
        tv = """C7 4E BC 91 9A 5B 3B 0D D1 22 81 85 BA 02 D2 9E
        F4 42 D6 9D 3D 42 76 A9 3E FE 0B F9 A1 6A 7D C0
        CD 4E AB AD AB 8C D7 A5 ED D9 66 95 F5 D3 60 AB
        E0 9E 2C 65 11 A3 EC 39 7D A3 B7 6B 9E 16 74 FB"""

        btv = txt2bin(tv)
        res = TurboSHAKE256.new(data=ptn(17**3)).read(64)
        self.assertEqual(res, btv)

    def test_ptn_17_4(self):
        tv = """02 CC 3A 88 97 E6 F4 F6 CC B6 FD 46 63 1B 1F 52
        07 B6 6C 6D E9 C7 B5 5B 2D 1A 23 13 4A 17 0A FD
        AC 23 4E AB A9 A7 7C FF 88 C1 F0 20 B7 37 24 61
        8C 56 87 B3 62 C4 30 B2 48 CD 38 64 7F 84 8A 1D"""

        btv = txt2bin(tv)
        data = ptn(17**4)

        # All at once
        res = TurboSHAKE256.new(data=data).read(64)
        self.assertEqual(res, btv)

        # Byte by byte
        xof = TurboSHAKE256.new()
        for x in data:
            xof.update(bchr(x))
        res = xof.read(64)
        self.assertEqual(res, btv)

        # Chunks of various prime sizes
        for chunk_size in (13, 17, 19, 23, 31):
            xof = TurboSHAKE256.new()
            for x in chunked(data, chunk_size):
                xof.update(x)
            res = xof.read(64)
            self.assertEqual(res, btv)

    def test_ptn_17_5(self):
        tv = """AD D5 3B 06 54 3E 58 4B 58 23 F6 26 99 6A EE 50
        FE 45 ED 15 F2 02 43 A7 16 54 85 AC B4 AA 76 B4
        FF DA 75 CE DF 6D 8C DC 95 C3 32 BD 56 F4 B9 86
        B5 8B B1 7D 17 78 BF C1 B1 A9 75 45 CD F4 EC 9F"""

        btv = txt2bin(tv)
        data = ptn(17**5)

        # All at once
        res = TurboSHAKE256.new(data=data).read(64)
        self.assertEqual(res, btv)

        # Chunks
        xof = TurboSHAKE256.new()
        for chunk in chunked(data, 8192):
            xof.update(chunk)
        res = xof.read(64)
        self.assertEqual(res, btv)

    def test_ptn_17_6(self):
        tv = """9E 11 BC 59 C2 4E 73 99 3C 14 84 EC 66 35 8E F7
        1D B7 4A EF D8 4E 12 3F 78 00 BA 9C 48 53 E0 2C
        FE 70 1D 9E 6B B7 65 A3 04 F0 DC 34 A4 EE 3B A8
        2C 41 0F 0D A7 0E 86 BF BD 90 EA 87 7C 2D 61 04"""

        btv = txt2bin(tv)
        data = ptn(17**6)

        res = TurboSHAKE256.new(data=data).read(64)
        self.assertEqual(res, btv)

    def test_ffffff_d01(self):
        tv = """D2 1C 6F BB F5 87 FA 22 82 F2 9A EA 62 01 75 FB
        02 57 41 3A F7 8A 0B 1B 2A 87 41 9C E0 31 D9 33
        AE 7A 4D 38 33 27 A8 A1 76 41 A3 4F 8A 1D 10 03
        AD 7D A6 B7 2D BA 84 BB 62 FE F2 8F 62 F1 24 24"""

        btv = txt2bin(tv)
        res = TurboSHAKE256.new(data=b"\xff\xff\xff", domain=0x01).read(64)
        self.assertEqual(res, btv)

    def test_ff_d06(self):
        tv = """73 8D 7B 4E 37 D1 8B 7F 22 AD 1B 53 13 E3 57 E3
        DD 7D 07 05 6A 26 A3 03 C4 33 FA 35 33 45 52 80
        F4 F5 A7 D4 F7 00 EF B4 37 FE 6D 28 14 05 E0 7B
        E3 2A 0A 97 2E 22 E6 3A DC 1B 09 0D AE FE 00 4B"""

        btv = txt2bin(tv)
        res = TurboSHAKE256.new(data=b'\xFF', domain=0x06).read(64)
        self.assertEqual(res, btv)

    def test_ffffff_d07(self):
        tv = """18 B3 B5 B7 06 1C 2E 67 C1 75 3A 00 E6 AD 7E D7
        BA 1C 90 6C F9 3E FB 70 92 EA F2 7F BE EB B7 55
        AE 6E 29 24 93 C1 10 E4 8D 26 00 28 49 2B 8E 09
        B5 50 06 12 B8 F2 57 89 85 DE D5 35 7D 00 EC 67"""

        btv = txt2bin(tv)
        res = TurboSHAKE256.new(data=b'\xFF' * 3, domain=0x07).read(64)
        self.assertEqual(res, btv)

    def test_ffffffffffff_d0b(self):
        tv = """BB 36 76 49 51 EC 97 E9 D8 5F 7E E9 A6 7A 77 18
        FC 00 5C F4 25 56 BE 79 CE 12 C0 BD E5 0E 57 36
        D6 63 2B 0D 0D FB 20 2D 1B BB 8F FE 3D D7 4C B0
        08 34 FA 75 6C B0 34 71 BA B1 3A 1E 2C 16 B3 C0"""

        btv = txt2bin(tv)
        res = TurboSHAKE256.new(data=b'\xFF' * 7, domain=0x0B).read(64)
        self.assertEqual(res, btv)

    def test_ff_d30(self):
        tv = """F3 FE 12 87 3D 34 BC BB 2E 60 87 79 D6 B7 0E 7F
        86 BE C7 E9 0B F1 13 CB D4 FD D0 C4 E2 F4 62 5E
        14 8D D7 EE 1A 52 77 6C F7 7F 24 05 14 D9 CC FC
        3B 5D DA B8 EE 25 5E 39 EE 38 90 72 96 2C 11 1A"""

        btv = txt2bin(tv)
        res = TurboSHAKE256.new(data=b'\xFF', domain=0x30).read(64)
        self.assertEqual(res, btv)

    def test_ffffff_d7f(self):
        tv = """AB E5 69 C1 F7 7E C3 40 F0 27 05 E7 D3 7C 9A B7
        E1 55 51 6E 4A 6A 15 00 21 D7 0B 6F AC 0B B4 0C
        06 9F 9A 98 28 A0 D5 75 CD 99 F9 BA E4 35 AB 1A
        CF 7E D9 11 0B A9 7C E0 38 8D 07 4B AC 76 87 76"""

        btv = txt2bin(tv)
        res = TurboSHAKE256.new(data=b'\xFF' * 3, domain=0x7F).read(64)
        self.assertEqual(res, btv)


def get_tests(config={}):
    tests = []
    tests += list_test_cases(TurboSHAKE128Test)
    tests += list_test_cases(TurboSHAKE256Test)
    tests += list_test_cases(TurboSHAKE128TV)
    tests += list_test_cases(TurboSHAKE256TV)
    return tests


if __name__ == '__main__':
    def suite():
        return unittest.TestSuite(get_tests())
    unittest.main(defaultTest='suite')
