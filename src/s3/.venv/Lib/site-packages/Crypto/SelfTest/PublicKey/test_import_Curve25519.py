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

import os
import errno
import warnings
import unittest
from binascii import unhexlify
from unittest import SkipTest

from Crypto.SelfTest.st_common import list_test_cases
from Crypto.Util.py3compat import tostr, FileNotFoundError
from Crypto.Util.asn1 import DerSequence, DerBitString
from Crypto.Hash import SHAKE128

from Crypto.PublicKey import ECC

try:
    import pycryptodome_test_vectors  # type: ignore
    test_vectors_available = True
except ImportError:
    test_vectors_available = False


def load_file(file_name, mode="rb"):
    results = None

    try:
        if not test_vectors_available:
            raise FileNotFoundError(errno.ENOENT,
                                    os.strerror(errno.ENOENT),
                                    file_name)

        dir_comps = ("PublicKey", "ECC")
        init_dir = os.path.dirname(pycryptodome_test_vectors.__file__)
        full_file_name = os.path.join(os.path.join(init_dir, *dir_comps), file_name)
        with open(full_file_name, mode) as file_in:
            results = file_in.read()

    except FileNotFoundError:
        warnings.warn("Warning: skipping extended tests for ECC",
                      UserWarning,
                      stacklevel=2)

    if results is None:
        raise SkipTest("Missing %s" % file_name)

    return results


def compact(lines):
    ext = b"".join(lines)
    return unhexlify(tostr(ext).replace(" ", "").replace(":", ""))


def create_ref_keys_x25519():
    key_lines = load_file("ecc_x25519.txt").splitlines()
    seed = compact(key_lines[5:8])
    key = ECC.construct(curve="Curve25519", seed=seed)
    return (key, key.public_key())


def get_fixed_prng():
    return SHAKE128.new().update(b"SEED").read


def extract_bitstring_from_spki(data):
    seq = DerSequence()
    seq.decode(data)
    bs = DerBitString()
    bs.decode(seq[1])
    return bs.value


class TestImport(unittest.TestCase):

    def test_empty(self):
        self.assertRaises(ValueError, ECC.import_key, b"")

    def test_mismatch(self):
        # Private key with X448 Object ID but X25519 key
        mismatch_hex = "302e020100300506032b656f042204207009906b64ec727d5cb5c23007bf0425b3fd79014c6cd62ca3dddfcf0f278f79"
        mismatch = unhexlify(mismatch_hex)
        self.assertRaises(ValueError, ECC.import_key, mismatch)


class TestImport_Curve25519(unittest.TestCase):

    def __init__(self, *args, **kwargs):
        super(TestImport_Curve25519, self).__init__(*args, **kwargs)
        self.ref_private, self.ref_public = create_ref_keys_x25519()

    def test_import_public_der(self):
        key_file = load_file("ecc_x25519_public.der")

        key = ECC._import_subjectPublicKeyInfo(key_file)
        self.assertEqual(self.ref_public, key)

        key = ECC._import_der(key_file, None)
        self.assertEqual(self.ref_public, key)

        key = ECC.import_key(key_file)
        self.assertEqual(self.ref_public, key)

    def test_import_pkcs8_der(self):
        key_file = load_file("ecc_x25519_private.der")

        key = ECC._import_der(key_file, None)
        self.assertEqual(self.ref_private, key)

        key = ECC.import_key(key_file)
        self.assertEqual(self.ref_private, key)

    def test_import_private_pkcs8_encrypted_1(self):
        key_file = load_file("ecc_x25519_private_p8.der")

        key = ECC._import_der(key_file, "secret")
        self.assertEqual(self.ref_private, key)

        key = ECC.import_key(key_file, "secret")
        self.assertEqual(self.ref_private, key)

    def test_import_private_pkcs8_encrypted_2(self):
        key_file = load_file("ecc_x25519_private_p8.pem")

        key = ECC.import_key(key_file, "secret")
        self.assertEqual(self.ref_private, key)

    def test_import_private_pkcs8_encrypted_3(self):
        key_file = load_file("ecc_x25519_private_p8_2.der")

        key = ECC._import_der(key_file, "secret")
        self.assertEqual(self.ref_private, key)

        key = ECC.import_key(key_file, "secret")
        self.assertEqual(self.ref_private, key)

    def test_import_x509_der(self):
        key_file = load_file("ecc_x25519_x509.der")

        key = ECC._import_der(key_file, None)
        self.assertEqual(self.ref_public, key)

        key = ECC.import_key(key_file)
        self.assertEqual(self.ref_public, key)

    def test_import_public_pem(self):
        key_file = load_file("ecc_x25519_public.pem")

        key = ECC.import_key(key_file)
        self.assertEqual(self.ref_public, key)

    def test_import_private_pem(self):
        key_file = load_file("ecc_x25519_private.pem")

        key = ECC.import_key(key_file)
        self.assertEqual(self.ref_private, key)

    def test_import_private_pem_encrypted(self):
        for algo in "des3", "aes128", "aes192", "aes256":
            key_file = load_file("ecc_x25519_private_enc_%s.pem" % algo)

            key = ECC.import_key(key_file, "secret")
            self.assertEqual(self.ref_private, key)

            key = ECC.import_key(tostr(key_file), b"secret")
            self.assertEqual(self.ref_private, key)

    def test_import_x509_pem(self):
        key_file = load_file("ecc_x25519_x509.pem")

        key = ECC.import_key(key_file)
        self.assertEqual(self.ref_public, key)


class TestExport_Curve25519(unittest.TestCase):

    def __init__(self, *args, **kwargs):
        super(TestExport_Curve25519, self).__init__(*args, **kwargs)
        self.ref_private, self.ref_public = create_ref_keys_x25519()

    def test_export_public_der(self):
        key_file = load_file("ecc_x25519_public.der")

        encoded = self.ref_public._export_subjectPublicKeyInfo(True)
        self.assertEqual(key_file, encoded)

        encoded = self.ref_public.export_key(format="DER")
        self.assertEqual(key_file, encoded)

        encoded = self.ref_public.export_key(format="DER", compress=False)
        self.assertEqual(key_file, encoded)

    def test_export_private_pkcs8_clear(self):
        key_file = load_file("ecc_x25519_private.der")

        encoded = self.ref_private._export_pkcs8()
        self.assertEqual(key_file, encoded)

        # ---

        encoded = self.ref_private.export_key(format="DER")
        self.assertEqual(key_file, encoded)

        self.assertRaises(ValueError, self.ref_private.export_key,
                          format="DER", use_pkcs8=False)

    def test_export_private_pkcs8_encrypted(self):
        encoded = self.ref_private._export_pkcs8(passphrase="secret",
                                                 protection="PBKDF2WithHMAC-SHA1AndAES128-CBC")

        # This should prove that the output is password-protected
        self.assertRaises(ValueError, ECC._import_pkcs8, encoded, None)

        decoded = ECC._import_pkcs8(encoded, "secret")
        self.assertEqual(self.ref_private, decoded)

        # ---

        encoded = self.ref_private.export_key(format="DER",
                                              passphrase="secret",
                                              protection="PBKDF2WithHMAC-SHA1AndAES128-CBC")
        decoded = ECC.import_key(encoded, "secret")
        self.assertEqual(self.ref_private, decoded)

        # ---

        encoded = self.ref_private.export_key(format="DER",
                                              passphrase="secret",
                                              protection="PBKDF2WithHMAC-SHA256AndAES128-CBC",
                                              prot_params={'iteration_count': 123})
        decoded = ECC.import_key(encoded, "secret")
        self.assertEqual(self.ref_private, decoded)

    def test_export_public_pem(self):
        key_file_ref = load_file("ecc_x25519_public.pem", "rt").strip()
        key_file = self.ref_public.export_key(format="PEM").strip()
        self.assertEqual(key_file_ref, key_file)

    def test_export_private_pem_clear(self):
        key_file = load_file("ecc_x25519_private.pem", "rt").strip()
        encoded = self.ref_private.export_key(format="PEM").strip()
        self.assertEqual(key_file, encoded)

    def test_export_private_pem_encrypted(self):
        encoded = self.ref_private.export_key(format="PEM",
                                              passphrase=b"secret",
                                              protection="PBKDF2WithHMAC-SHA1AndAES128-CBC")

        # This should prove that the output is password-protected
        self.assertRaises(ValueError, ECC.import_key, encoded)

        assert "ENCRYPTED PRIVATE KEY" in encoded

        decoded = ECC.import_key(encoded, "secret")
        self.assertEqual(self.ref_private, decoded)

    def test_export_raw(self):
        encoded = self.ref_public.export_key(format='raw')
        self.assertEqual(len(encoded), 32)
        self.assertEqual(encoded, unhexlify(b'ff7561ef60c9c8a757f6d6372ec14142c9be208d0e719136d8d3c715dfcf7e15'))

    def test_prng(self):
        # Test that password-protected containers use the provided PRNG
        encoded1 = self.ref_private.export_key(format="PEM",
                                               passphrase="secret",
                                               protection="PBKDF2WithHMAC-SHA1AndAES128-CBC",
                                               randfunc=get_fixed_prng())
        encoded2 = self.ref_private.export_key(format="PEM",
                                               passphrase="secret",
                                               protection="PBKDF2WithHMAC-SHA1AndAES128-CBC",
                                               randfunc=get_fixed_prng())
        self.assertEqual(encoded1, encoded2)

    def test_byte_or_string_passphrase(self):
        encoded1 = self.ref_private.export_key(format="PEM",
                                               passphrase="secret",
                                               protection="PBKDF2WithHMAC-SHA1AndAES128-CBC",
                                               randfunc=get_fixed_prng())
        encoded2 = self.ref_private.export_key(format="PEM",
                                               passphrase=b"secret",
                                               protection="PBKDF2WithHMAC-SHA1AndAES128-CBC",
                                               randfunc=get_fixed_prng())
        self.assertEqual(encoded1, encoded2)

    def test_error_params1(self):
        # Unknown format
        self.assertRaises(ValueError, self.ref_private.export_key, format="XXX")

        # Missing 'protection' parameter when PKCS#8 is used
        self.assertRaises(ValueError,
                          self.ref_private.export_key,
                          format="PEM",
                          passphrase="secret")

        # Empty password
        self.assertRaises(ValueError,
                          self.ref_private.export_key,
                          format="PEM",
                          passphrase="",
                          use_pkcs8=False)
        self.assertRaises(ValueError,
                          self.ref_private.export_key,
                          format="PEM",
                          passphrase="",
                          protection="PBKDF2WithHMAC-SHA1AndAES128-CBC")

        # No private keys with OpenSSH
        self.assertRaises(ValueError,
                          self.ref_private.export_key,
                          format="OpenSSH",
                          passphrase="secret")


class TestImport_Curve25519_Weak(unittest.TestCase):

    def test_weak_pem(self):

        p = 2**255 - 19
        weak_x = (0,
                  1,
                  325606250916557431795983626356110631294008115727848805560023387167927233504,
                  39382357235489614581723060781553021112529911719440698176882885853963445705823,
                  p - 1,
                  p,
                  p + 1,
                  p + 325606250916557431795983626356110631294008115727848805560023387167927233504,
                  p + 39382357235489614581723060781553021112529911719440698176882885853963445705823,
                  p * 2 - 1,
                  p * 2,
                  p * 2 + 1)

        for x in weak_x:
            low_order_point = ECC.EccXPoint(x, "curve25519")
            weak_key = ECC.EccKey(point=low_order_point, curve="curve25519")
            encoded = weak_key.export_key(format="PEM")

            self.assertRaises(ValueError,
                              ECC.import_key,
                              encoded)


def get_tests(config={}):
    tests = []
    try:
        tests += list_test_cases(TestImport)
        tests += list_test_cases(TestImport_Curve25519)
        tests += list_test_cases(TestExport_Curve25519)
        tests += list_test_cases(TestImport_Curve25519_Weak)
    except SkipTest:
        pass
    return tests


if __name__ == '__main__':
    def suit():
        return unittest.TestSuite(get_tests())
    unittest.main(defaultTest='suite')
