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

from Crypto.Math.Numbers import Integer

from Crypto.Hash import SHA512, SHAKE256
from Crypto.Util.py3compat import bchr, is_bytes
from Crypto.PublicKey.ECC import (EccKey,
                                  construct,
                                  _import_ed25519_public_key,
                                  _import_ed448_public_key)


def import_public_key(encoded):
    """Create a new Ed25519 or Ed448 public key object,
    starting from the key encoded as raw ``bytes``,
    in the format described in RFC8032.

    Args:
      encoded (bytes):
        The EdDSA public key to import.
        It must be 32 bytes for Ed25519, and 57 bytes for Ed448.

    Returns:
      :class:`Crypto.PublicKey.EccKey` : a new ECC key object.

    Raises:
      ValueError: when the given key cannot be parsed.
    """

    if len(encoded) == 32:
        x, y = _import_ed25519_public_key(encoded)
        curve_name = "Ed25519"
    elif len(encoded) == 57:
        x, y = _import_ed448_public_key(encoded)
        curve_name = "Ed448"
    else:
        raise ValueError("Not an EdDSA key (%d bytes)" % len(encoded))
    return construct(curve=curve_name, point_x=x, point_y=y)


def import_private_key(encoded):
    """Create a new Ed25519 or Ed448 private key object,
    starting from the key encoded as raw ``bytes``,
    in the format described in RFC8032.

    Args:
      encoded (bytes):
        The EdDSA private key to import.
        It must be 32 bytes for Ed25519, and 57 bytes for Ed448.

    Returns:
      :class:`Crypto.PublicKey.EccKey` : a new ECC key object.

    Raises:
      ValueError: when the given key cannot be parsed.
    """

    if len(encoded) == 32:
        curve_name = "ed25519"
    elif len(encoded) == 57:
        curve_name = "ed448"
    else:
        raise ValueError("Incorrect length. Only EdDSA private keys are supported.")

    # Note that the private key is truly a sequence of random bytes,
    # so we cannot check its correctness in any way.

    return construct(seed=encoded, curve=curve_name)


class EdDSASigScheme(object):
    """An EdDSA signature object.
    Do not instantiate directly.
    Use :func:`Crypto.Signature.eddsa.new`.
    """

    def __init__(self, key, context):
        """Create a new EdDSA object.

        Do not instantiate this object directly,
        use `Crypto.Signature.DSS.new` instead.
        """

        self._key = key
        self._context = context
        self._A = key._export_eddsa_public()
        self._order = key._curve.order

    def can_sign(self):
        """Return ``True`` if this signature object can be used
        for signing messages."""

        return self._key.has_private()

    def sign(self, msg_or_hash):
        """Compute the EdDSA signature of a message.

        Args:
          msg_or_hash (bytes or a hash object):
            The message to sign (``bytes``, in case of *PureEdDSA*) or
            the hash that was carried out over the message (hash object, for *HashEdDSA*).

            The hash object must be :class:`Crypto.Hash.SHA512` for Ed25519,
            and :class:`Crypto.Hash.SHAKE256` object for Ed448.

        :return: The signature as ``bytes``. It is always 64 bytes for Ed25519, and 114 bytes for Ed448.
        :raise TypeError: if the EdDSA key has no private half
        """

        if not self._key.has_private():
            raise TypeError("Private key is needed to sign")

        if self._key.curve == "Ed25519":
            ph = isinstance(msg_or_hash, SHA512.SHA512Hash)
            if not (ph or is_bytes(msg_or_hash)):
                raise TypeError("'msg_or_hash' must be bytes of a SHA-512 hash")
            eddsa_sign_method = self._sign_ed25519

        elif self._key.curve == "Ed448":
            ph = isinstance(msg_or_hash, SHAKE256.SHAKE256_XOF)
            if not (ph or is_bytes(msg_or_hash)):
                raise TypeError("'msg_or_hash' must be bytes of a SHAKE256 hash")
            eddsa_sign_method = self._sign_ed448

        else:
            raise ValueError("Incorrect curve for EdDSA")

        return eddsa_sign_method(msg_or_hash, ph)

    def _sign_ed25519(self, msg_or_hash, ph):

        if self._context or ph:
            flag = int(ph)
            # dom2(flag, self._context)
            dom2 = b'SigEd25519 no Ed25519 collisions' + bchr(flag) + \
                   bchr(len(self._context)) + self._context
        else:
            dom2 = b''

        PHM = msg_or_hash.digest() if ph else msg_or_hash

        # See RFC 8032, section 5.1.6

        # Step 2
        r_hash = SHA512.new(dom2 + self._key._prefix + PHM).digest()
        r = Integer.from_bytes(r_hash, 'little') % self._order
        # Step 3
        R_pk = EccKey(point=r * self._key._curve.G)._export_eddsa_public()
        # Step 4
        k_hash = SHA512.new(dom2 + R_pk + self._A + PHM).digest()
        k = Integer.from_bytes(k_hash, 'little') % self._order
        # Step 5
        s = (r + k * self._key.d) % self._order

        return R_pk + s.to_bytes(32, 'little')

    def _sign_ed448(self, msg_or_hash, ph):

        flag = int(ph)
        # dom4(flag, self._context)
        dom4 = b'SigEd448' + bchr(flag) + \
               bchr(len(self._context)) + self._context

        PHM = msg_or_hash.read(64) if ph else msg_or_hash

        # See RFC 8032, section 5.2.6

        # Step 2
        r_hash = SHAKE256.new(dom4 + self._key._prefix + PHM).read(114)
        r = Integer.from_bytes(r_hash, 'little') % self._order
        # Step 3
        R_pk = EccKey(point=r * self._key._curve.G)._export_eddsa_public()
        # Step 4
        k_hash = SHAKE256.new(dom4 + R_pk + self._A + PHM).read(114)
        k = Integer.from_bytes(k_hash, 'little') % self._order
        # Step 5
        s = (r + k * self._key.d) % self._order

        return R_pk + s.to_bytes(57, 'little')

    def verify(self, msg_or_hash, signature):
        """Check if an EdDSA signature is authentic.

        Args:
          msg_or_hash (bytes or a hash object):
            The message to verify (``bytes``, in case of *PureEdDSA*) or
            the hash that was carried out over the message (hash object, for *HashEdDSA*).

            The hash object must be :class:`Crypto.Hash.SHA512` object for Ed25519,
            and :class:`Crypto.Hash.SHAKE256` for Ed448.

          signature (``bytes``):
            The signature that needs to be validated.
            It must be 64 bytes for Ed25519, and 114 bytes for Ed448.

        :raise ValueError: if the signature is not authentic
        """

        if self._key.curve == "Ed25519":
            ph = isinstance(msg_or_hash, SHA512.SHA512Hash)
            if not (ph or is_bytes(msg_or_hash)):
                raise TypeError("'msg_or_hash' must be bytes of a SHA-512 hash")
            eddsa_verify_method = self._verify_ed25519

        elif self._key.curve == "Ed448":
            ph = isinstance(msg_or_hash, SHAKE256.SHAKE256_XOF)
            if not (ph or is_bytes(msg_or_hash)):
                raise TypeError("'msg_or_hash' must be bytes of a SHAKE256 hash")
            eddsa_verify_method = self._verify_ed448

        else:
            raise ValueError("Incorrect curve for EdDSA")

        return eddsa_verify_method(msg_or_hash, signature, ph)

    def _verify_ed25519(self, msg_or_hash, signature, ph):

        if len(signature) != 64:
            raise ValueError("The signature is not authentic (length)")

        if self._context or ph:
            flag = int(ph)
            dom2 = b'SigEd25519 no Ed25519 collisions' + bchr(flag) + \
                   bchr(len(self._context)) + self._context
        else:
            dom2 = b''

        PHM = msg_or_hash.digest() if ph else msg_or_hash

        # Section 5.1.7

        # Step 1
        try:
            R = import_public_key(signature[:32]).pointQ
        except ValueError:
            raise ValueError("The signature is not authentic (R)")
        s = Integer.from_bytes(signature[32:], 'little')
        if s > self._order:
            raise ValueError("The signature is not authentic (S)")
        # Step 2
        k_hash = SHA512.new(dom2 + signature[:32] + self._A + PHM).digest()
        k = Integer.from_bytes(k_hash, 'little') % self._order
        # Step 3
        point1 = s * 8 * self._key._curve.G
        # OPTIMIZE: with double-scalar multiplication, with no SCA
        # countermeasures because it is public values
        point2 = 8 * R + k * 8 * self._key.pointQ
        if point1 != point2:
            raise ValueError("The signature is not authentic")

    def _verify_ed448(self, msg_or_hash, signature, ph):

        if len(signature) != 114:
            raise ValueError("The signature is not authentic (length)")

        flag = int(ph)
        # dom4(flag, self._context)
        dom4 = b'SigEd448' + bchr(flag) + \
               bchr(len(self._context)) + self._context

        PHM = msg_or_hash.read(64) if ph else msg_or_hash

        # Section 5.2.7

        # Step 1
        try:
            R = import_public_key(signature[:57]).pointQ
        except ValueError:
            raise ValueError("The signature is not authentic (R)")
        s = Integer.from_bytes(signature[57:], 'little')
        if s > self._order:
            raise ValueError("The signature is not authentic (S)")
        # Step 2
        k_hash = SHAKE256.new(dom4 + signature[:57] + self._A + PHM).read(114)
        k = Integer.from_bytes(k_hash, 'little') % self._order
        # Step 3
        point1 = s * 8 * self._key._curve.G
        # OPTIMIZE: with double-scalar multiplication, with no SCA
        # countermeasures because it is public values
        point2 = 8 * R + k * 8 * self._key.pointQ
        if point1 != point2:
            raise ValueError("The signature is not authentic")


def new(key, mode, context=None):
    """Create a signature object :class:`EdDSASigScheme` that
    can perform or verify an EdDSA signature.

    Args:
        key (:class:`Crypto.PublicKey.ECC` object):
            The key to use for computing the signature (*private* keys only)
            or for verifying one.
            The key must be on the curve ``Ed25519`` or ``Ed448``.

        mode (string):
            This parameter must be ``'rfc8032'``.

        context (bytes):
            Up to 255 bytes of `context <https://datatracker.ietf.org/doc/html/rfc8032#page-41>`_,
            which is a constant byte string to segregate different protocols or
            different applications of the same key.
    """

    if not isinstance(key, EccKey) or key.curve not in ("Ed25519", "Ed448"):
        raise ValueError("EdDSA can only be used with EdDSA keys")

    if mode != 'rfc8032':
        raise ValueError("Mode must be 'rfc8032'")

    if context is None:
        context = b''
    elif len(context) > 255:
        raise ValueError("Context for EdDSA must not be longer than 255 bytes")

    return EdDSASigScheme(key, context)
