#
#  PublicKey/_PBES.py : Password-Based Encryption functions
#
# ===================================================================
#
# Copyright (c) 2014, Legrandin <helderijs@gmail.com>
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

import re

from Crypto import Hash
from Crypto import Random
from Crypto.Util.asn1 import (
            DerSequence, DerOctetString,
            DerObjectId, DerInteger,
            )

from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
from Crypto.Protocol.KDF import PBKDF1, PBKDF2, scrypt

_OID_PBE_WITH_MD5_AND_DES_CBC = "1.2.840.113549.1.5.3"
_OID_PBE_WITH_MD5_AND_RC2_CBC = "1.2.840.113549.1.5.6"
_OID_PBE_WITH_SHA1_AND_DES_CBC = "1.2.840.113549.1.5.10"
_OID_PBE_WITH_SHA1_AND_RC2_CBC = "1.2.840.113549.1.5.11"

_OID_PBES2 = "1.2.840.113549.1.5.13"

_OID_PBKDF2 = "1.2.840.113549.1.5.12"
_OID_SCRYPT = "1.3.6.1.4.1.11591.4.11"

_OID_HMAC_SHA1 = "1.2.840.113549.2.7"

_OID_DES_EDE3_CBC = "1.2.840.113549.3.7"
_OID_AES128_CBC = "2.16.840.1.101.3.4.1.2"
_OID_AES192_CBC = "2.16.840.1.101.3.4.1.22"
_OID_AES256_CBC = "2.16.840.1.101.3.4.1.42"
_OID_AES128_GCM = "2.16.840.1.101.3.4.1.6"
_OID_AES192_GCM = "2.16.840.1.101.3.4.1.26"
_OID_AES256_GCM = "2.16.840.1.101.3.4.1.46"

class PbesError(ValueError):
    pass

# These are the ASN.1 definitions used by the PBES1/2 logic:
#
# EncryptedPrivateKeyInfo ::= SEQUENCE {
#   encryptionAlgorithm  EncryptionAlgorithmIdentifier,
#   encryptedData        EncryptedData
# }
#
# EncryptionAlgorithmIdentifier ::= AlgorithmIdentifier
#
# EncryptedData ::= OCTET STRING
#
# AlgorithmIdentifier  ::=  SEQUENCE  {
#       algorithm   OBJECT IDENTIFIER,
#       parameters  ANY DEFINED BY algorithm OPTIONAL
# }
#
# PBEParameter ::= SEQUENCE {
#       salt OCTET STRING (SIZE(8)),
#       iterationCount INTEGER
# }
#
# PBES2-params ::= SEQUENCE {
#       keyDerivationFunc AlgorithmIdentifier {{PBES2-KDFs}},
#       encryptionScheme AlgorithmIdentifier {{PBES2-Encs}}
# }
#
# PBKDF2-params ::= SEQUENCE {
#   salt CHOICE {
#       specified OCTET STRING,
#       otherSource AlgorithmIdentifier {{PBKDF2-SaltSources}}
#       },
#   iterationCount INTEGER (1..MAX),
#   keyLength INTEGER (1..MAX) OPTIONAL,
#   prf AlgorithmIdentifier {{PBKDF2-PRFs}} DEFAULT algid-hmacWithSHA1
#   }
#
#   PBKDF2-PRFs ALGORITHM-IDENTIFIER ::= {
#        {NULL IDENTIFIED BY id-hmacWithSHA1},
#        {NULL IDENTIFIED BY id-hmacWithSHA224},
#        {NULL IDENTIFIED BY id-hmacWithSHA256},
#        {NULL IDENTIFIED BY id-hmacWithSHA384},
#        {NULL IDENTIFIED BY id-hmacWithSHA512},
#        {NULL IDENTIFIED BY id-hmacWithSHA512-224},
#        {NULL IDENTIFIED BY id-hmacWithSHA512-256},
#        ...
# }
# scrypt-params ::= SEQUENCE {
#       salt OCTET STRING,
#       costParameter INTEGER (1..MAX),
#       blockSize INTEGER (1..MAX),
#       parallelizationParameter INTEGER (1..MAX),
#       keyLength INTEGER (1..MAX) OPTIONAL
#   }


class PBES1(object):
    """Deprecated encryption scheme with password-based key derivation
    (originally defined in PKCS#5 v1.5, but still present in `v2.0`__).

    .. __: http://www.ietf.org/rfc/rfc2898.txt
    """

    @staticmethod
    def decrypt(data, passphrase):
        """Decrypt a piece of data using a passphrase and *PBES1*.

        The algorithm to use is automatically detected.

        :Parameters:
          data : byte string
            The piece of data to decrypt.
          passphrase : byte string
            The passphrase to use for decrypting the data.
        :Returns:
          The decrypted data, as a binary string.
        """

        enc_private_key_info = DerSequence().decode(data)
        encrypted_algorithm = DerSequence().decode(enc_private_key_info[0])
        encrypted_data = DerOctetString().decode(enc_private_key_info[1]).payload

        pbe_oid = DerObjectId().decode(encrypted_algorithm[0]).value
        cipher_params = {}
        if pbe_oid == _OID_PBE_WITH_MD5_AND_DES_CBC:
            # PBE_MD5_DES_CBC
            from Crypto.Hash import MD5
            from Crypto.Cipher import DES
            hashmod = MD5
            module = DES
        elif pbe_oid == _OID_PBE_WITH_MD5_AND_RC2_CBC:
            # PBE_MD5_RC2_CBC
            from Crypto.Hash import MD5
            from Crypto.Cipher import ARC2
            hashmod = MD5
            module = ARC2
            cipher_params['effective_keylen'] = 64
        elif pbe_oid == _OID_PBE_WITH_SHA1_AND_DES_CBC:
            # PBE_SHA1_DES_CBC
            from Crypto.Hash import SHA1
            from Crypto.Cipher import DES
            hashmod = SHA1
            module = DES
        elif pbe_oid == _OID_PBE_WITH_SHA1_AND_RC2_CBC:
            # PBE_SHA1_RC2_CBC
            from Crypto.Hash import SHA1
            from Crypto.Cipher import ARC2
            hashmod = SHA1
            module = ARC2
            cipher_params['effective_keylen'] = 64
        else:
            raise PbesError("Unknown OID for PBES1")

        pbe_params = DerSequence().decode(encrypted_algorithm[1], nr_elements=2)
        salt = DerOctetString().decode(pbe_params[0]).payload
        iterations = pbe_params[1]

        key_iv = PBKDF1(passphrase, salt, 16, iterations, hashmod)
        key, iv = key_iv[:8], key_iv[8:]

        cipher = module.new(key, module.MODE_CBC, iv, **cipher_params)
        pt = cipher.decrypt(encrypted_data)
        return unpad(pt, cipher.block_size)


class PBES2(object):
    """Encryption scheme with password-based key derivation
    (defined in `PKCS#5 v2.0`__).

    .. __: http://www.ietf.org/rfc/rfc2898.txt."""

    @staticmethod
    def encrypt(data, passphrase, protection, prot_params=None, randfunc=None):
        """Encrypt a piece of data using a passphrase and *PBES2*.

        :Parameters:
          data : byte string
            The piece of data to encrypt.
          passphrase : byte string
            The passphrase to use for encrypting the data.
          protection : string
            The identifier of the encryption algorithm to use.
            The default value is '``PBKDF2WithHMAC-SHA1AndDES-EDE3-CBC``'.
          prot_params : dictionary
            Parameters of the protection algorithm.

            +------------------+-----------------------------------------------+
            | Key              | Description                                   |
            +==================+===============================================+
            | iteration_count  | The KDF algorithm is repeated several times to|
            |                  | slow down brute force attacks on passwords    |
            |                  | (called *N* or CPU/memory cost in scrypt).    |
            |                  |                                               |
            |                  | The default value for PBKDF2 is 1 000.        |
            |                  | The default value for scrypt is 16 384.       |
            +------------------+-----------------------------------------------+
            | salt_size        | Salt is used to thwart dictionary and rainbow |
            |                  | attacks on passwords. The default value is 8  |
            |                  | bytes.                                        |
            +------------------+-----------------------------------------------+
            | block_size       | *(scrypt only)* Memory-cost (r). The default  |
            |                  | value is 8.                                   |
            +------------------+-----------------------------------------------+
            | parallelization  | *(scrypt only)* CPU-cost (p). The default     |
            |                  | value is 1.                                   |
            +------------------+-----------------------------------------------+


          randfunc : callable
            Random number generation function; it should accept
            a single integer N and return a string of random data,
            N bytes long. If not specified, a new RNG will be
            instantiated from ``Crypto.Random``.

        :Returns:
          The encrypted data, as a binary string.
        """

        if prot_params is None:
            prot_params = {}

        if randfunc is None:
            randfunc = Random.new().read

        pattern = re.compile(r'^(PBKDF2WithHMAC-([0-9A-Z-]+)|scrypt)And([0-9A-Z-]+)$')
        res = pattern.match(protection)
        if res is None:
            raise ValueError("Unknown protection %s" % protection)

        if protection.startswith("PBKDF"):
            pbkdf = "pbkdf2"
            pbkdf2_hmac_algo = res.group(2)
            enc_algo = res.group(3)
        else:
            pbkdf = "scrypt"
            enc_algo = res.group(3)

        aead = False
        if enc_algo == 'DES-EDE3-CBC':
            from Crypto.Cipher import DES3
            key_size = 24
            module = DES3
            cipher_mode = DES3.MODE_CBC
            enc_oid = _OID_DES_EDE3_CBC
            enc_param = {'iv': randfunc(8)}
        elif enc_algo == 'AES128-CBC':
            key_size = 16
            module = AES
            cipher_mode = AES.MODE_CBC
            enc_oid = _OID_AES128_CBC
            enc_param = {'iv': randfunc(16)}
        elif enc_algo == 'AES192-CBC':
            key_size = 24
            module = AES
            cipher_mode = AES.MODE_CBC
            enc_oid = _OID_AES192_CBC
            enc_param = {'iv': randfunc(16)}
        elif enc_algo == 'AES256-CBC':
            key_size = 32
            module = AES
            cipher_mode = AES.MODE_CBC
            enc_oid = _OID_AES256_CBC
            enc_param = {'iv': randfunc(16)}
        elif enc_algo == 'AES128-GCM':
            key_size = 16
            module = AES
            cipher_mode = AES.MODE_GCM
            enc_oid = _OID_AES128_GCM
            enc_param = {'nonce': randfunc(12)}
            aead = True
        elif enc_algo == 'AES192-GCM':
            key_size = 24
            module = AES
            cipher_mode = AES.MODE_GCM
            enc_oid = _OID_AES192_GCM
            enc_param = {'nonce': randfunc(12)}
            aead = True
        elif enc_algo == 'AES256-GCM':
            key_size = 32
            module = AES
            cipher_mode = AES.MODE_GCM
            enc_oid = _OID_AES256_GCM
            enc_param = {'nonce': randfunc(12)}
            aead = True
        else:
            raise ValueError("Unknown encryption mode '%s'" % enc_algo)

        iv_nonce = list(enc_param.values())[0]
        salt = randfunc(prot_params.get("salt_size", 8))

        # Derive key from password
        if pbkdf == 'pbkdf2':

            count = prot_params.get("iteration_count", 1000)
            digestmod = Hash.new(pbkdf2_hmac_algo)

            key = PBKDF2(passphrase,
                         salt,
                         key_size,
                         count,
                         hmac_hash_module=digestmod)

            pbkdf2_params = DerSequence([
                                DerOctetString(salt),
                                DerInteger(count)
                            ])

            if pbkdf2_hmac_algo != 'SHA1':
                try:
                    hmac_oid = Hash.HMAC.new(b'', digestmod=digestmod).oid
                except KeyError:
                    raise ValueError("No OID for HMAC hash algorithm")
                pbkdf2_params.append(DerSequence([DerObjectId(hmac_oid)]))

            kdf_info = DerSequence([
                    DerObjectId(_OID_PBKDF2),   # PBKDF2
                    pbkdf2_params
            ])

        elif pbkdf == 'scrypt':

            count = prot_params.get("iteration_count", 16384)
            scrypt_r = prot_params.get('block_size', 8)
            scrypt_p = prot_params.get('parallelization', 1)
            key = scrypt(passphrase, salt, key_size,
                         count, scrypt_r, scrypt_p)
            kdf_info = DerSequence([
                    DerObjectId(_OID_SCRYPT),  # scrypt
                    DerSequence([
                        DerOctetString(salt),
                        DerInteger(count),
                        DerInteger(scrypt_r),
                        DerInteger(scrypt_p)
                    ])
            ])

        else:
            raise ValueError("Unknown KDF " + res.group(1))

        # Create cipher and use it
        cipher = module.new(key, cipher_mode, **enc_param)
        if aead:
            ct, tag = cipher.encrypt_and_digest(data)
            encrypted_data = ct + tag
        else:
            encrypted_data = cipher.encrypt(pad(data, cipher.block_size))
        enc_info = DerSequence([
                DerObjectId(enc_oid),
                DerOctetString(iv_nonce)
        ])

        # Result
        enc_private_key_info = DerSequence([
            # encryptionAlgorithm
            DerSequence([
                DerObjectId(_OID_PBES2),
                DerSequence([
                    kdf_info,
                    enc_info
                ]),
            ]),
            DerOctetString(encrypted_data)
        ])
        return enc_private_key_info.encode()

    @staticmethod
    def decrypt(data, passphrase):
        """Decrypt a piece of data using a passphrase and *PBES2*.

        The algorithm to use is automatically detected.

        :Parameters:
          data : byte string
            The piece of data to decrypt.
          passphrase : byte string
            The passphrase to use for decrypting the data.
        :Returns:
          The decrypted data, as a binary string.
        """

        enc_private_key_info = DerSequence().decode(data, nr_elements=2)
        enc_algo = DerSequence().decode(enc_private_key_info[0])
        encrypted_data = DerOctetString().decode(enc_private_key_info[1]).payload

        pbe_oid = DerObjectId().decode(enc_algo[0]).value
        if pbe_oid != _OID_PBES2:
            raise PbesError("Not a PBES2 object")

        pbes2_params = DerSequence().decode(enc_algo[1], nr_elements=2)

        # Key Derivation Function selection
        kdf_info = DerSequence().decode(pbes2_params[0], nr_elements=2)
        kdf_oid = DerObjectId().decode(kdf_info[0]).value

        kdf_key_length = None

        # We only support PBKDF2 or scrypt
        if kdf_oid == _OID_PBKDF2:

            pbkdf2_params = DerSequence().decode(kdf_info[1], nr_elements=(2, 3, 4))
            salt = DerOctetString().decode(pbkdf2_params[0]).payload
            iteration_count = pbkdf2_params[1]

            left = len(pbkdf2_params) - 2
            idx = 2

            if left > 0:
                try:
                    # Check if it's an INTEGER
                    kdf_key_length = pbkdf2_params[idx] - 0
                    left -= 1
                    idx += 1
                except TypeError:
                    # keyLength is not present
                    pass

            # Default is HMAC-SHA1
            pbkdf2_prf_oid = _OID_HMAC_SHA1
            if left > 0:
                pbkdf2_prf_algo_id = DerSequence().decode(pbkdf2_params[idx])
                pbkdf2_prf_oid = DerObjectId().decode(pbkdf2_prf_algo_id[0]).value

        elif kdf_oid == _OID_SCRYPT:

            scrypt_params = DerSequence().decode(kdf_info[1], nr_elements=(4, 5))
            salt = DerOctetString().decode(scrypt_params[0]).payload
            iteration_count, scrypt_r, scrypt_p = [scrypt_params[x]
                                                   for x in (1, 2, 3)]
            if len(scrypt_params) > 4:
                kdf_key_length = scrypt_params[4]
            else:
                kdf_key_length = None
        else:
            raise PbesError("Unsupported PBES2 KDF")

        # Cipher selection
        enc_info = DerSequence().decode(pbes2_params[1])
        enc_oid = DerObjectId().decode(enc_info[0]).value

        aead = False
        if enc_oid == _OID_DES_EDE3_CBC:
            # DES_EDE3_CBC
            from Crypto.Cipher import DES3
            module = DES3
            cipher_mode = DES3.MODE_CBC
            key_size = 24
            cipher_param = 'iv'
        elif enc_oid == _OID_AES128_CBC:
            module = AES
            cipher_mode = AES.MODE_CBC
            key_size = 16
            cipher_param = 'iv'
        elif enc_oid == _OID_AES192_CBC:
            module = AES
            cipher_mode = AES.MODE_CBC
            key_size = 24
            cipher_param = 'iv'
        elif enc_oid == _OID_AES256_CBC:
            module = AES
            cipher_mode = AES.MODE_CBC
            key_size = 32
            cipher_param = 'iv'
        elif enc_oid == _OID_AES128_GCM:
            module = AES
            cipher_mode = AES.MODE_GCM
            key_size = 16
            cipher_param = 'nonce'
            aead = True
        elif enc_oid == _OID_AES192_GCM:
            module = AES
            cipher_mode = AES.MODE_GCM
            key_size = 24
            cipher_param = 'nonce'
            aead = True
        elif enc_oid == _OID_AES256_GCM:
            module = AES
            cipher_mode = AES.MODE_GCM
            key_size = 32
            cipher_param = 'nonce'
            aead = True
        else:
            raise PbesError("Unsupported PBES2 cipher " + enc_algo)

        if kdf_key_length and kdf_key_length != key_size:
            raise PbesError("Mismatch between PBES2 KDF parameters"
                            " and selected cipher")

        iv_nonce = DerOctetString().decode(enc_info[1]).payload

        # Create cipher
        if kdf_oid == _OID_PBKDF2:

            try:
                hmac_hash_module_oid = Hash.HMAC._hmac2hash_oid[pbkdf2_prf_oid]
            except KeyError:
                raise PbesError("Unsupported HMAC %s" % pbkdf2_prf_oid)
            hmac_hash_module = Hash.new(hmac_hash_module_oid)

            key = PBKDF2(passphrase, salt, key_size, iteration_count,
                         hmac_hash_module=hmac_hash_module)
        else:
            key = scrypt(passphrase, salt, key_size, iteration_count,
                         scrypt_r, scrypt_p)
        cipher = module.new(key, cipher_mode, **{cipher_param:iv_nonce})

        # Decrypt data
        if len(encrypted_data) < cipher.block_size:
            raise ValueError("Too little data to decrypt")

        if aead:
            tag_len = cipher.block_size
            pt = cipher.decrypt_and_verify(encrypted_data[:-tag_len],
                                           encrypted_data[-tag_len:])
        else:
            pt_padded = cipher.decrypt(encrypted_data)
            pt = unpad(pt_padded, cipher.block_size)

        return pt
