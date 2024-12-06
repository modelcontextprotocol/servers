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


class TestEccPoint_Ed25519(unittest.TestCase):

    Gxy = {"x": 15112221349535400772501151409588531511454012693041857206046113283949847762202,
           "y": 46316835694926478169428394003475163141307993866256225615783033603165251855960}

    G2xy = {"x": 24727413235106541002554574571675588834622768167397638456726423682521233608206,
            "y": 15549675580280190176352668710449542251549572066445060580507079593062643049417}

    G3xy = {"x": 46896733464454938657123544595386787789046198280132665686241321779790909858396,
            "y": 8324843778533443976490377120369201138301417226297555316741202210403726505172}

    pointG = EccPoint(Gxy['x'], Gxy['y'], curve="ed25519")
    pointG2 = EccPoint(G2xy['x'], G2xy['y'], curve="ed25519")
    pointG3 = EccPoint(G3xy['x'], G3xy['y'], curve="ed25519")

    def test_curve_attribute(self):
        self.assertEqual(self.pointG.curve, "Ed25519")

    def test_init_xy(self):
        EccPoint(self.Gxy['x'], self.Gxy['y'], curve="Ed25519")

        # Neutral point
        pai = EccPoint(0, 1, curve="Ed25519")
        self.assertEqual(pai.x, 0)
        self.assertEqual(pai.y, 1)
        self.assertEqual(pai.xy, (0, 1))

        # G
        bp = self.pointG.copy()
        self.assertEqual(bp.x, 15112221349535400772501151409588531511454012693041857206046113283949847762202)
        self.assertEqual(bp.y, 46316835694926478169428394003475163141307993866256225615783033603165251855960)
        self.assertEqual(bp.xy, (bp.x, bp.y))

        # 2G
        bp2 = self.pointG2.copy()
        self.assertEqual(bp2.x, 24727413235106541002554574571675588834622768167397638456726423682521233608206)
        self.assertEqual(bp2.y, 15549675580280190176352668710449542251549572066445060580507079593062643049417)
        self.assertEqual(bp2.xy, (bp2.x, bp2.y))

        # 5G
        EccPoint(x=33467004535436536005251147249499675200073690106659565782908757308821616914995,
                 y=43097193783671926753355113395909008640284023746042808659097434958891230611693,
                 curve="Ed25519")

        # Catch if point is not on the curve
        self.assertRaises(ValueError, EccPoint, 34, 35, curve="Ed25519")

    def test_set(self):
        pointW = EccPoint(0, 1, curve="Ed25519")
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
        pai = EccPoint(0, 1, curve="Ed25519")
        self.assertTrue(pai.is_point_at_infinity())
        self.assertEqual(pai, pai.point_at_infinity())

    def test_negate(self):
        negG = -self.pointG
        G100 = self.pointG * 100
        sum_zero = G100 + negG * 100
        self.assertTrue(sum_zero.is_point_at_infinity())

        sum_99 = G100 + negG
        expected = self.pointG * 99
        self.assertEqual(sum_99, expected)

    def test_addition(self):
        self.assertEqual(self.pointG + self.pointG2, self.pointG3)
        self.assertEqual(self.pointG2 + self.pointG, self.pointG3)
        self.assertEqual(self.pointG2 + self.pointG.point_at_infinity(), self.pointG2)
        self.assertEqual(self.pointG.point_at_infinity() + self.pointG2, self.pointG2)

        G5 = self.pointG2 + self.pointG3
        self.assertEqual(G5.x, 33467004535436536005251147249499675200073690106659565782908757308821616914995)
        self.assertEqual(G5.y, 43097193783671926753355113395909008640284023746042808659097434958891230611693)

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
        self.assertEqual(pointH.x, 14582954232372986451776170844943001818709880559417862259286374126315108956272)
        self.assertEqual(pointH.y, 32483318716863467900234833297694612235682047836132991208333042722294373421359)

        d = 5
        pointH = d * self.pointG
        self.assertEqual(pointH.x, 33467004535436536005251147249499675200073690106659565782908757308821616914995)
        self.assertEqual(pointH.y, 43097193783671926753355113395909008640284023746042808659097434958891230611693)

        d = 10
        pointH = d * self.pointG
        self.assertEqual(pointH.x, 43500613248243327786121022071801015118933854441360174117148262713429272820047)
        self.assertEqual(pointH.y, 45005105423099817237495816771148012388779685712352441364231470781391834741548)

        d = 20
        pointH = d * self.pointG
        self.assertEqual(pointH.x, 46694936775300686710656303283485882876784402425210400817529601134760286812591)
        self.assertEqual(pointH.y, 8786390172762935853260670851718824721296437982862763585171334833968259029560)

        d = 255
        pointH = d * self.pointG
        self.assertEqual(pointH.x, 36843863416400016952258312492144504209624961884991522125275155377549541182230)
        self.assertEqual(pointH.y, 22327030283879720808995671630924669697661065034121040761798775626517750047180)

        d = 256
        pointH = d * self.pointG
        self.assertEqual(pointH.x, 42740085206947573681423002599456489563927820004573071834350074001818321593686)
        self.assertEqual(pointH.y, 6935684722522267618220753829624209639984359598320562595061366101608187623111)

    def test_sizes(self):
        self.assertEqual(self.pointG.size_in_bits(), 255)
        self.assertEqual(self.pointG.size_in_bytes(), 32)


class TestEccKey_Ed25519(unittest.TestCase):

    def test_private_key(self):
        seed = unhexlify("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60")
        Px = 38815646466658113194383306759739515082307681141926459231621296960732224964046
        Py = 11903303657706407974989296177215005343713679411332034699907763981919547054807

        key = EccKey(curve="Ed25519", seed=seed)
        self.assertEqual(key.seed, seed)
        self.assertEqual(key.d, 36144925721603087658594284515452164870581325872720374094707712194495455132720)
        self.assertTrue(key.has_private())
        self.assertEqual(key.pointQ.x, Px)
        self.assertEqual(key.pointQ.y, Py)

        point = EccPoint(Px, Py, "ed25519")
        key = EccKey(curve="Ed25519", seed=seed, point=point)
        self.assertEqual(key.d, 36144925721603087658594284515452164870581325872720374094707712194495455132720)
        self.assertTrue(key.has_private())
        self.assertEqual(key.pointQ, point)

        # Other names
        key = EccKey(curve="ed25519", seed=seed)

        # Must not accept d parameter
        self.assertRaises(ValueError, EccKey, curve="ed25519", d=1)

    def test_public_key(self):
        point = EccPoint(_curves['ed25519'].Gx, _curves['ed25519'].Gy, curve='ed25519')
        key = EccKey(curve="ed25519", point=point)
        self.assertFalse(key.has_private())
        self.assertEqual(key.pointQ, point)

    def test_public_key_derived(self):
        priv_key = EccKey(curve="ed25519", seed=b'H'*32)
        pub_key = priv_key.public_key()
        self.assertFalse(pub_key.has_private())
        self.assertEqual(priv_key.pointQ, pub_key.pointQ)

    def test_invalid_seed(self):
        self.assertRaises(ValueError, lambda: EccKey(curve="ed25519", seed=b'H' * 31))

    def test_equality(self):
        private_key = ECC.construct(seed=b'H'*32, curve="Ed25519")
        private_key2 = ECC.construct(seed=b'H'*32, curve="ed25519")
        private_key3 = ECC.construct(seed=b'C'*32, curve="Ed25519")

        public_key = private_key.public_key()
        public_key2 = private_key2.public_key()
        public_key3 = private_key3.public_key()

        self.assertEqual(private_key, private_key2)
        self.assertNotEqual(private_key, private_key3)

        self.assertEqual(public_key, public_key2)
        self.assertNotEqual(public_key, public_key3)

        self.assertNotEqual(public_key, private_key)

    def test_name_consistency(self):
        key = ECC.generate(curve='ed25519')
        self.assertIn("curve='Ed25519'", repr(key))
        self.assertEqual(key.curve, 'Ed25519')
        self.assertEqual(key.public_key().curve, 'Ed25519')


class TestEccModule_Ed25519(unittest.TestCase):

    def test_generate(self):
        key = ECC.generate(curve="Ed25519")
        self.assertTrue(key.has_private())
        point = EccPoint(_curves['Ed25519'].Gx, _curves['Ed25519'].Gy, curve="Ed25519") * key.d
        self.assertEqual(key.pointQ, point)

        # Always random
        key2 = ECC.generate(curve="Ed25519")
        self.assertNotEqual(key, key2)

        # Other names
        ECC.generate(curve="Ed25519")

        # Random source
        key1 = ECC.generate(curve="Ed25519", randfunc=SHAKE128.new().read)
        key2 = ECC.generate(curve="Ed25519", randfunc=SHAKE128.new().read)
        self.assertEqual(key1, key2)

    def test_construct(self):
        seed = unhexlify("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60")
        Px = 38815646466658113194383306759739515082307681141926459231621296960732224964046
        Py = 11903303657706407974989296177215005343713679411332034699907763981919547054807
        d = 36144925721603087658594284515452164870581325872720374094707712194495455132720
        point = EccPoint(Px, Py, curve="Ed25519")

        # Private key only
        key = ECC.construct(curve="Ed25519", seed=seed)
        self.assertEqual(key.pointQ, point)
        self.assertTrue(key.has_private())

        # Public key only
        key = ECC.construct(curve="Ed25519", point_x=Px, point_y=Py)
        self.assertEqual(key.pointQ, point)
        self.assertFalse(key.has_private())

        # Private and public key
        key = ECC.construct(curve="Ed25519", seed=seed, point_x=Px, point_y=Py)
        self.assertEqual(key.pointQ, point)
        self.assertTrue(key.has_private())

        # Other names
        key = ECC.construct(curve="ed25519", seed=seed)

    def test_negative_construct(self):
        coord = dict(point_x=10, point_y=4)
        coordG = dict(point_x=_curves['ed25519'].Gx, point_y=_curves['ed25519'].Gy)

        self.assertRaises(ValueError, ECC.construct, curve="Ed25519", **coord)
        self.assertRaises(ValueError, ECC.construct, curve="Ed25519", d=2, **coordG)
        self.assertRaises(ValueError, ECC.construct, curve="Ed25519", seed=b'H'*31)


def get_tests(config={}):
    tests = []
    tests += list_test_cases(TestEccPoint_Ed25519)
    tests += list_test_cases(TestEccKey_Ed25519)
    tests += list_test_cases(TestEccModule_Ed25519)
    return tests


if __name__ == '__main__':
    def suite():
        return unittest.TestSuite(get_tests())
    unittest.main(defaultTest='suite')
