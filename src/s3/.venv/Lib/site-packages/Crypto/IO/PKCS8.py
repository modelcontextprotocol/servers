#
#  PublicKey/PKCS8.py : PKCS#8 functions
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


from Crypto.Util.py3compat import *

from Crypto.Util.asn1 import (
            DerNull,
            DerSequence,
            DerObjectId,
            DerOctetString,
            )

from Crypto.IO._PBES import PBES1, PBES2, PbesError


__all__ = ['wrap', 'unwrap']


def wrap(private_key, key_oid, passphrase=None, protection=None,
         prot_params=None, key_params=DerNull(), randfunc=None):
    """Wrap a private key into a PKCS#8 blob (clear or encrypted).

    Args:

      private_key (bytes):
        The private key encoded in binary form. The actual encoding is
        algorithm specific. In most cases, it is DER.

      key_oid (string):
        The object identifier (OID) of the private key to wrap.
        It is a dotted string, like ``'1.2.840.113549.1.1.1'`` (for RSA keys)
        or ``'1.2.840.10045.2.1'`` (for ECC keys).

    Keyword Args:

      passphrase (bytes or string):
        The secret passphrase from which the wrapping key is derived.
        Set it only if encryption is required.

      protection (string):
        The identifier of the algorithm to use for securely wrapping the key.
        Refer to :ref:`the encryption parameters<enc_params>` .
        The default value is ``'PBKDF2WithHMAC-SHA1AndDES-EDE3-CBC'``.

      prot_params (dictionary):
        Parameters for the key derivation function (KDF).
        Refer to :ref:`the encryption parameters<enc_params>` .

      key_params (DER object or None):
        The ``parameters`` field to use in the ``AlgorithmIdentifier``
        SEQUENCE. If ``None``, no ``parameters`` field will be added.
        By default, the ASN.1 type ``NULL`` is used.

      randfunc (callable):
        Random number generation function; it should accept a single integer
        N and return a string of random data, N bytes long.
        If not specified, a new RNG will be instantiated
        from :mod:`Crypto.Random`.

    Returns:
      bytes: The PKCS#8-wrapped private key (possibly encrypted).
    """

    #
    #   PrivateKeyInfo ::= SEQUENCE {
    #       version                 Version,
    #       privateKeyAlgorithm     PrivateKeyAlgorithmIdentifier,
    #       privateKey              PrivateKey,
    #       attributes              [0]  IMPLICIT Attributes OPTIONAL
    #   }
    #
    if key_params is None:
        algorithm = DerSequence([DerObjectId(key_oid)])
    else:
        algorithm = DerSequence([DerObjectId(key_oid), key_params])

    pk_info = DerSequence([
                0,
                algorithm,
                DerOctetString(private_key)
            ])
    pk_info_der = pk_info.encode()

    if passphrase is None:
        return pk_info_der

    if not passphrase:
        raise ValueError("Empty passphrase")

    # Encryption with PBES2
    passphrase = tobytes(passphrase)
    if protection is None:
        protection = 'PBKDF2WithHMAC-SHA1AndDES-EDE3-CBC'
    return PBES2.encrypt(pk_info_der, passphrase,
                         protection, prot_params, randfunc)


def unwrap(p8_private_key, passphrase=None):
    """Unwrap a private key from a PKCS#8 blob (clear or encrypted).

    Args:
      p8_private_key (bytes):
        The private key wrapped into a PKCS#8 container, DER encoded.

    Keyword Args:
      passphrase (byte string or string):
        The passphrase to use to decrypt the blob (if it is encrypted).

    Return:
      A tuple containing

       #. the algorithm identifier of the wrapped key (OID, dotted string)
       #. the private key (bytes, DER encoded)
       #. the associated parameters (bytes, DER encoded) or ``None``

    Raises:
      ValueError : if decoding fails
    """

    if passphrase is not None:
        passphrase = tobytes(passphrase)

        found = False
        try:
            p8_private_key = PBES1.decrypt(p8_private_key, passphrase)
            found = True
        except PbesError as e:
            error_str = "PBES1[%s]" % str(e)
        except ValueError:
            error_str = "PBES1[Invalid]"

        if not found:
            try:
                p8_private_key = PBES2.decrypt(p8_private_key, passphrase)
                found = True
            except PbesError as e:
                error_str += ",PBES2[%s]" % str(e)
            except ValueError:
                error_str += ",PBES2[Invalid]"

        if not found:
            raise ValueError("Error decoding PKCS#8 (%s)" % error_str)

    pk_info = DerSequence().decode(p8_private_key, nr_elements=(2, 3, 4, 5))
    if len(pk_info) == 2 and not passphrase:
        raise ValueError("Not a valid clear PKCS#8 structure "
                         "(maybe it is encrypted?)")

    # RFC5208, PKCS#8, version is v1(0)
    #
    #   PrivateKeyInfo ::= SEQUENCE {
    #       version                 Version,
    #       privateKeyAlgorithm     PrivateKeyAlgorithmIdentifier,
    #       privateKey              PrivateKey,
    #       attributes              [0]  IMPLICIT Attributes OPTIONAL
    #   }
    #
    # RFC5915, Asymmetric Key Package, version is v2(1)
    #
    #   OneAsymmetricKey ::= SEQUENCE {
    #       version                   Version,
    #       privateKeyAlgorithm       PrivateKeyAlgorithmIdentifier,
    #       privateKey                PrivateKey,
    #       attributes            [0] Attributes OPTIONAL,
    #       ...,
    #       [[2: publicKey        [1] PublicKey OPTIONAL ]],
    #       ...
    #   }

    if pk_info[0] == 0:
        if len(pk_info) not in (3, 4):
            raise ValueError("Not a valid PrivateKeyInfo SEQUENCE")
    elif pk_info[0] == 1:
        if len(pk_info) not in (3, 4, 5):
            raise ValueError("Not a valid PrivateKeyInfo SEQUENCE")
    else:
        raise ValueError("Not a valid PrivateKeyInfo SEQUENCE")

    algo = DerSequence().decode(pk_info[1], nr_elements=(1, 2))
    algo_oid = DerObjectId().decode(algo[0]).value
    if len(algo) == 1:
        algo_params = None
    else:
        try:
            DerNull().decode(algo[1])
            algo_params = None
        except:
            algo_params = algo[1]

    # PrivateKey ::= OCTET STRING
    private_key = DerOctetString().decode(pk_info[2]).payload

    # We ignore attributes and (for v2 only) publickey

    return (algo_oid, private_key, algo_params)
