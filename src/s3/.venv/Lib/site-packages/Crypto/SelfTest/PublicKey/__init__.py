# -*- coding: utf-8 -*-
#
#  SelfTest/PublicKey/__init__.py: Self-test for public key crypto
#
# Written in 2008 by Dwayne C. Litzenberger <dlitz@dlitz.net>
#
# ===================================================================
# The contents of this file are dedicated to the public domain.  To
# the extent that dedication to the public domain is not available,
# everyone is granted a worldwide, perpetual, royalty-free,
# non-exclusive license to exercise all rights associated with the
# contents of this file for any purpose whatsoever.
# No rights are reserved.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
# EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
# MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
# NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS
# BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
# ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
# CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
# ===================================================================

"""Self-test for public-key crypto"""

import unittest
from Crypto.SelfTest.PublicKey import (test_DSA, test_RSA,
                                       test_ECC_NIST,
                                       test_ECC_Ed25519,
                                       test_ECC_Curve25519,
                                       test_ECC_Ed448,
                                       test_ECC_Curve448,
                                       test_import_DSA, test_import_RSA,
                                       test_import_ECC, test_ElGamal,
                                       test_import_Curve25519,
                                       test_import_Curve448)


def get_tests(config={}):
    tests = []
    tests += test_DSA.get_tests(config=config)
    tests += test_RSA.get_tests(config=config)
    tests += test_ECC_NIST.get_tests(config=config)
    tests += test_ECC_Ed25519.get_tests(config=config)
    tests += test_ECC_Curve25519.get_tests(config=config)
    tests += test_ECC_Ed448.get_tests(config=config)
    tests += test_ECC_Curve448.get_tests(config=config)

    tests += test_import_DSA.get_tests(config=config)
    tests += test_import_RSA.get_tests(config=config)
    tests += test_import_ECC.get_tests(config=config)
    tests += test_import_Curve25519.get_tests(config=config)
    tests += test_import_Curve448.get_tests(config=config)

    tests += test_ElGamal.get_tests(config=config)
    return tests


if __name__ == '__main__':
    def suite():
        return unittest.TestSuite(get_tests())
    unittest.main(defaultTest='suite')
