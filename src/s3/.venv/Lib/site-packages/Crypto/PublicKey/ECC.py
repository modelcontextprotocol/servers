# ===================================================================
#
# Copyright (c) 2015, Legrandin <helderijs@gmail.com>
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

from __future__ import print_function

import re
import struct
import binascii

from Crypto.Util.py3compat import bord, tobytes, tostr, bchr, is_string

from Crypto.Math.Numbers import Integer
from Crypto.Util.asn1 import (DerObjectId, DerOctetString, DerSequence,
                              DerBitString)

from Crypto.PublicKey import (_expand_subject_public_key_info,
                              _create_subject_public_key_info,
                              _extract_subject_public_key_info)

from Crypto.Hash import SHA512, SHAKE256

from Crypto.Random import get_random_bytes

from ._point import EccPoint, EccXPoint, _curves
from ._point import CurveID as _CurveID


class UnsupportedEccFeature(ValueError):
    pass


class EccKey(object):
    r"""Class defining an ECC key.
    Do not instantiate directly.
    Use :func:`generate`, :func:`construct` or :func:`import_key` instead.

    :ivar curve: The **canonical** name of the curve as defined in the `ECC table`_.
    :vartype curve: string

    :ivar pointQ: an ECC point representating the public component.
    :vartype pointQ: :class:`EccPoint` or :class:`EccXPoint`

    :ivar d: A scalar that represents the private component
             in NIST P curves. It is smaller than the
             order of the generator point.
    :vartype d: integer

    :ivar seed: A seed that representats the private component
                in Ed22519 (32 bytes), Curve25519 (32 bytes),
                Curve448 (56 bytes), Ed448 (57 bytes).
    :vartype seed: bytes
    """

    def __init__(self, **kwargs):
        """Create a new ECC key

        Keywords:
          curve : string
            The name of the curve.
          d : integer
            Mandatory for a private key one NIST P curves.
            It must be in the range ``[1..order-1]``.
          seed : bytes
            Mandatory for a private key on Ed25519 (32 bytes),
            Curve25519 (32 bytes), Curve448 (56 bytes) or Ed448 (57 bytes).
          point : EccPoint or EccXPoint
            Mandatory for a public key. If provided for a private key,
            the implementation will NOT check whether it matches ``d``.

        Only one parameter among ``d``, ``seed`` or ``point`` may be used.
        """

        kwargs_ = dict(kwargs)
        curve_name = kwargs_.pop("curve", None)
        self._d = kwargs_.pop("d", None)
        self._seed = kwargs_.pop("seed", None)
        self._point = kwargs_.pop("point", None)
        if curve_name is None and self._point:
            curve_name = self._point.curve
        if kwargs_:
            raise TypeError("Unknown parameters: " + str(kwargs_))

        if curve_name not in _curves:
            raise ValueError("Unsupported curve (%s)" % curve_name)
        self._curve = _curves[curve_name]
        self.curve = self._curve.canonical

        count = int(self._d is not None) + int(self._seed is not None)

        if count == 0:
            if self._point is None:
                raise ValueError("At lest one between parameters 'point', 'd' or 'seed' must be specified")
            return

        if count == 2:
            raise ValueError("Parameters d and seed are mutually exclusive")

        # NIST P curves work with d, EdDSA works with seed

        # RFC 8032, 5.1.5
        if self._curve.id == _CurveID.ED25519:
            if self._d is not None:
                raise ValueError("Parameter d can only be used with NIST P curves")
            if len(self._seed) != 32:
                raise ValueError("Parameter seed must be 32 bytes long for Ed25519")
            seed_hash = SHA512.new(self._seed).digest()   # h
            self._prefix = seed_hash[32:]
            tmp = bytearray(seed_hash[:32])
            tmp[0] &= 0xF8
            tmp[31] = (tmp[31] & 0x7F) | 0x40
            self._d = Integer.from_bytes(tmp, byteorder='little')
        # RFC 8032, 5.2.5
        elif self._curve.id == _CurveID.ED448:
            if self._d is not None:
                raise ValueError("Parameter d can only be used with NIST P curves")
            if len(self._seed) != 57:
                raise ValueError("Parameter seed must be 57 bytes long for Ed448")
            seed_hash = SHAKE256.new(self._seed).read(114)  # h
            self._prefix = seed_hash[57:]
            tmp = bytearray(seed_hash[:57])
            tmp[0] &= 0xFC
            tmp[55] |= 0x80
            tmp[56] = 0
            self._d = Integer.from_bytes(tmp, byteorder='little')
        # RFC 7748, 5
        elif self._curve.id == _CurveID.CURVE25519:
            if self._d is not None:
                raise ValueError("Parameter d can only be used with NIST P curves")
            if len(self._seed) != 32:
                raise ValueError("Parameter seed must be 32 bytes long for Curve25519")
            tmp = bytearray(self._seed)
            tmp[0] &= 0xF8
            tmp[31] = (tmp[31] & 0x7F) | 0x40
            self._d = Integer.from_bytes(tmp, byteorder='little')
        elif self._curve.id == _CurveID.CURVE448:
            if self._d is not None:
                raise ValueError("Parameter d can only be used with NIST P curves")
            if len(self._seed) != 56:
                raise ValueError("Parameter seed must be 56 bytes long for Curve448")
            tmp = bytearray(self._seed)
            tmp[0] &= 0xFC
            tmp[55] |= 0x80
            self._d = Integer.from_bytes(tmp, byteorder='little')

        else:
            if self._seed is not None:
                raise ValueError("Parameter 'seed' cannot be used with NIST P-curves")
            self._d = Integer(self._d)
            if not 1 <= self._d < self._curve.order:
                raise ValueError("Parameter d must be an integer smaller than the curve order")

    def __eq__(self, other):
        if not isinstance(other, EccKey):
            return False

        if other.has_private() != self.has_private():
            return False

        return other.pointQ == self.pointQ

    def __repr__(self):
        if self.has_private():
            if self._curve.is_edwards:
                extra = ", seed=%s" % tostr(binascii.hexlify(self._seed))
            else:
                extra = ", d=%d" % int(self._d)
        else:
            extra = ""
        if self._curve.id in (_CurveID.CURVE25519,
                              _CurveID.CURVE448):
            x = self.pointQ.x
            result = "EccKey(curve='%s', point_x=%d%s)" % (self._curve.canonical, x, extra)
        else:
            x, y = self.pointQ.xy
            result = "EccKey(curve='%s', point_x=%d, point_y=%d%s)" % (self._curve.canonical, x, y, extra)
        return result

    def has_private(self):
        """``True`` if this key can be used for making signatures or decrypting data."""

        return self._d is not None

    # ECDSA
    def _sign(self, z, k):
        assert 0 < k < self._curve.order

        order = self._curve.order
        blind = Integer.random_range(min_inclusive=1,
                                     max_exclusive=order)

        blind_d = self._d * blind
        inv_blind_k = (blind * k).inverse(order)

        r = (self._curve.G * k).x % order
        s = inv_blind_k * (blind * z + blind_d * r) % order
        return (r, s)

    # ECDSA
    def _verify(self, z, rs):
        order = self._curve.order
        sinv = rs[1].inverse(order)
        point1 = self._curve.G * ((sinv * z) % order)
        point2 = self.pointQ * ((sinv * rs[0]) % order)
        return (point1 + point2).x == rs[0]

    @property
    def d(self):
        if not self.has_private():
            raise ValueError("This is not a private ECC key")
        return self._d

    @property
    def seed(self):
        if not self.has_private():
            raise ValueError("This is not a private ECC key")
        return self._seed

    @property
    def pointQ(self):
        if self._point is None:
            self._point = self._curve.G * self._d
        return self._point

    def public_key(self):
        """A matching ECC public key.

        Returns:
            a new :class:`EccKey` object
        """

        return EccKey(curve=self._curve.canonical, point=self.pointQ)

    def _export_SEC1(self, compress):
        if not self._curve.is_weierstrass:
            raise ValueError("SEC1 format is only supported for NIST P curves")

        # See 2.2 in RFC5480 and 2.3.3 in SEC1
        #
        # The first byte is:
        # - 0x02:   compressed, only X-coordinate, Y-coordinate is even
        # - 0x03:   compressed, only X-coordinate, Y-coordinate is odd
        # - 0x04:   uncompressed, X-coordinate is followed by Y-coordinate
        #
        # PAI is in theory encoded as 0x00.

        modulus_bytes = self.pointQ.size_in_bytes()

        if compress:
            if self.pointQ.y.is_odd():
                first_byte = b'\x03'
            else:
                first_byte = b'\x02'
            public_key = (first_byte +
                          self.pointQ.x.to_bytes(modulus_bytes))
        else:
            public_key = (b'\x04' +
                          self.pointQ.x.to_bytes(modulus_bytes) +
                          self.pointQ.y.to_bytes(modulus_bytes))
        return public_key

    def _export_eddsa_public(self):
        x, y = self.pointQ.xy
        if self._curve.id == _CurveID.ED25519:
            result = bytearray(y.to_bytes(32, byteorder='little'))
            result[31] = ((x & 1) << 7) | result[31]
        elif self._curve.id == _CurveID.ED448:
            result = bytearray(y.to_bytes(57, byteorder='little'))
            result[56] = (x & 1) << 7
        else:
            raise ValueError("Not an EdDSA key to export")
        return bytes(result)

    def _export_montgomery_public(self):
        if not self._curve.is_montgomery:
            raise ValueError("Not a Montgomery key to export")
        x = self.pointQ.x
        field_size = self.pointQ.size_in_bytes()
        result = bytearray(x.to_bytes(field_size, byteorder='little'))
        return bytes(result)

    def _export_subjectPublicKeyInfo(self, compress):
        if self._curve.is_edwards:
            oid = self._curve.oid
            public_key = self._export_eddsa_public()
            params = None
        elif self._curve.is_montgomery:
            oid = self._curve.oid
            public_key = self._export_montgomery_public()
            params = None
        else:
            oid = "1.2.840.10045.2.1"   # unrestricted
            public_key = self._export_SEC1(compress)
            params = DerObjectId(self._curve.oid)

        return _create_subject_public_key_info(oid,
                                               public_key,
                                               params)

    def _export_rfc5915_private_der(self, include_ec_params=True):

        assert self.has_private()

        # ECPrivateKey ::= SEQUENCE {
        #           version        INTEGER { ecPrivkeyVer1(1) } (ecPrivkeyVer1),
        #           privateKey     OCTET STRING,
        #           parameters [0] ECParameters {{ NamedCurve }} OPTIONAL,
        #           publicKey  [1] BIT STRING OPTIONAL
        #    }

        # Public key - uncompressed form
        modulus_bytes = self.pointQ.size_in_bytes()
        public_key = (b'\x04' +
                      self.pointQ.x.to_bytes(modulus_bytes) +
                      self.pointQ.y.to_bytes(modulus_bytes))

        seq = [1,
               DerOctetString(self.d.to_bytes(modulus_bytes)),
               DerObjectId(self._curve.oid, explicit=0),
               DerBitString(public_key, explicit=1)]

        if not include_ec_params:
            del seq[2]

        return DerSequence(seq).encode()

    def _export_pkcs8(self, **kwargs):
        from Crypto.IO import PKCS8

        if kwargs.get('passphrase', None) is not None and 'protection' not in kwargs:
            raise ValueError("At least the 'protection' parameter must be present")

        if self._seed is not None:
            oid = self._curve.oid
            private_key = DerOctetString(self._seed).encode()
            params = None
        else:
            oid = "1.2.840.10045.2.1"  # unrestricted
            private_key = self._export_rfc5915_private_der(include_ec_params=False)
            params = DerObjectId(self._curve.oid)

        result = PKCS8.wrap(private_key,
                            oid,
                            key_params=params,
                            **kwargs)
        return result

    def _export_public_pem(self, compress):
        from Crypto.IO import PEM

        encoded_der = self._export_subjectPublicKeyInfo(compress)
        return PEM.encode(encoded_der, "PUBLIC KEY")

    def _export_private_pem(self, passphrase, **kwargs):
        from Crypto.IO import PEM

        encoded_der = self._export_rfc5915_private_der()
        return PEM.encode(encoded_der, "EC PRIVATE KEY", passphrase, **kwargs)

    def _export_private_clear_pkcs8_in_clear_pem(self):
        from Crypto.IO import PEM

        encoded_der = self._export_pkcs8()
        return PEM.encode(encoded_der, "PRIVATE KEY")

    def _export_private_encrypted_pkcs8_in_clear_pem(self, passphrase, **kwargs):
        from Crypto.IO import PEM

        assert passphrase
        if 'protection' not in kwargs:
            raise ValueError("At least the 'protection' parameter should be present")
        encoded_der = self._export_pkcs8(passphrase=passphrase, **kwargs)
        return PEM.encode(encoded_der, "ENCRYPTED PRIVATE KEY")

    def _export_openssh(self, compress):
        if self.has_private():
            raise ValueError("Cannot export OpenSSH private keys")

        desc = self._curve.openssh

        if desc is None:
            raise ValueError("Cannot export %s keys as OpenSSH" % self.curve)
        elif desc == "ssh-ed25519":
            public_key = self._export_eddsa_public()
            comps = (tobytes(desc), tobytes(public_key))
        else:
            modulus_bytes = self.pointQ.size_in_bytes()

            if compress:
                first_byte = 2 + self.pointQ.y.is_odd()
                public_key = (bchr(first_byte) +
                              self.pointQ.x.to_bytes(modulus_bytes))
            else:
                public_key = (b'\x04' +
                              self.pointQ.x.to_bytes(modulus_bytes) +
                              self.pointQ.y.to_bytes(modulus_bytes))

            middle = desc.split("-")[2]
            comps = (tobytes(desc), tobytes(middle), public_key)

        blob = b"".join([struct.pack(">I", len(x)) + x for x in comps])
        return desc + " " + tostr(binascii.b2a_base64(blob))

    def export_key(self, **kwargs):
        """Export this ECC key.

        Args:
          format (string):
            The output format:

            - ``'DER'``. The key will be encoded in ASN.1 DER format (binary).
              For a public key, the ASN.1 ``subjectPublicKeyInfo`` structure
              defined in `RFC5480`_ will be used.
              For a private key, the ASN.1 ``ECPrivateKey`` structure defined
              in `RFC5915`_ is used instead (possibly within a PKCS#8 envelope,
              see the ``use_pkcs8`` flag below).
            - ``'PEM'``. The key will be encoded in a PEM_ envelope (ASCII).
            - ``'OpenSSH'``. The key will be encoded in the OpenSSH_ format
              (ASCII, public keys only).
            - ``'SEC1'``. The public key (i.e., the EC point) will be encoded
              into ``bytes`` according to Section 2.3.3 of `SEC1`_
              (which is a subset of the older X9.62 ITU standard).
              Only for NIST P-curves.
            - ``'raw'``. The public key will be encoded as ``bytes``,
              without any metadata.

              * For NIST P-curves: equivalent to ``'SEC1'``.
              * For Ed25519 and Ed448: ``bytes`` in the format
                defined in `RFC8032`_.
              * For Curve25519 and Curve448: ``bytes`` in the format
                defined in `RFC7748`_.

          passphrase (bytes or string):
            (*Private keys only*) The passphrase to protect the
            private key.

          use_pkcs8 (boolean):
            (*Private keys only*)
            If ``True`` (default and recommended), the `PKCS#8`_ representation
            will be used.
            It must be ``True`` for Ed25519, Ed448, Curve25519, and Curve448.

            If ``False`` and a passphrase is present, the obsolete PEM
            encryption will be used.

          protection (string):
            When a private key is exported with password-protection
            and PKCS#8 (both ``DER`` and ``PEM`` formats), this parameter MUST be
            present,
            For all possible protection schemes,
            refer to :ref:`the encryption parameters of PKCS#8<enc_params>`.
            It is recommended to use ``'PBKDF2WithHMAC-SHA512AndAES128-CBC'``.

          compress (boolean):
            If ``True``, the method returns a more compact representation
            of the public key, with the X-coordinate only.

            If ``False`` (default), the method returns the full public key.

            This parameter is ignored for Ed25519/Ed448/Curve25519/Curve448,
            as compression is mandatory.

          prot_params (dict):
            When a private key is exported with password-protection
            and PKCS#8 (both ``DER`` and ``PEM`` formats), this dictionary
            contains the  parameters to use to derive the encryption key
            from the passphrase.
            For all possible values,
            refer to :ref:`the encryption parameters of PKCS#8<enc_params>`.
            The recommendation is to use ``{'iteration_count':21000}`` for PBKDF2,
            and ``{'iteration_count':131072}`` for scrypt.

        .. warning::
            If you don't provide a passphrase, the private key will be
            exported in the clear!

        .. note::
            When exporting a private key with password-protection and `PKCS#8`_
            (both ``DER`` and ``PEM`` formats), any extra parameters
            to ``export_key()`` will be passed to :mod:`Crypto.IO.PKCS8`.

        .. _PEM:        http://www.ietf.org/rfc/rfc1421.txt
        .. _`PEM encryption`: http://www.ietf.org/rfc/rfc1423.txt
        .. _OpenSSH:    http://www.openssh.com/txt/rfc5656.txt
        .. _RFC5480:    https://tools.ietf.org/html/rfc5480
        .. _SEC1:       https://www.secg.org/sec1-v2.pdf
        .. _RFC7748:    https://tools.ietf.org/html/rfc7748

        Returns:
            A multi-line string (for ``'PEM'`` and ``'OpenSSH'``) or
            ``bytes`` (for ``'DER'``, ``'SEC1'``, and ``'raw'``) with the encoded key.
        """

        args = kwargs.copy()
        ext_format = args.pop("format")
        if ext_format not in ("PEM", "DER", "OpenSSH", "SEC1", "raw"):
            raise ValueError("Unknown format '%s'" % ext_format)

        compress = args.pop("compress", False)

        if self.has_private():
            passphrase = args.pop("passphrase", None)
            if is_string(passphrase):
                passphrase = tobytes(passphrase)
                if not passphrase:
                    raise ValueError("Empty passphrase")

            use_pkcs8 = args.pop("use_pkcs8", True)
            if use_pkcs8 is False:
                if self._curve.is_edwards:
                    raise ValueError("'pkcs8' must be True for EdDSA curves")
                if self._curve.is_montgomery:
                    raise ValueError("'pkcs8' must be True for Curve25519")
                if 'protection' in args:
                    raise ValueError("'protection' is only supported for PKCS#8")

            if ext_format == "PEM":
                if use_pkcs8:
                    if passphrase:
                        return self._export_private_encrypted_pkcs8_in_clear_pem(passphrase, **args)
                    else:
                        return self._export_private_clear_pkcs8_in_clear_pem()
                else:
                    return self._export_private_pem(passphrase, **args)
            elif ext_format == "DER":
                # DER
                if passphrase and not use_pkcs8:
                    raise ValueError("Private keys can only be encrpyted with DER using PKCS#8")
                if use_pkcs8:
                    return self._export_pkcs8(passphrase=passphrase, **args)
                else:
                    return self._export_rfc5915_private_der()
            else:
                raise ValueError("Private keys cannot be exported "
                                 "in the '%s' format" % ext_format)
        else:  # Public key
            if args:
                raise ValueError("Unexpected parameters: '%s'" % args)
            if ext_format == "PEM":
                return self._export_public_pem(compress)
            elif ext_format == "DER":
                return self._export_subjectPublicKeyInfo(compress)
            elif ext_format == "SEC1":
                return self._export_SEC1(compress)
            elif ext_format == "raw":
                if self._curve.is_edwards:
                    return self._export_eddsa_public()
                elif self._curve.is_montgomery:
                    return self._export_montgomery_public()
                else:
                    return self._export_SEC1(compress)
            else:
                return self._export_openssh(compress)


def generate(**kwargs):
    """Generate a new private key on the given curve.

    Args:

      curve (string):
        Mandatory. It must be a curve name defined in the `ECC table`_.

      randfunc (callable):
        Optional. The RNG to read randomness from.
        If ``None``, :func:`Crypto.Random.get_random_bytes` is used.
    """

    curve_name = kwargs.pop("curve")
    curve = _curves[curve_name]
    randfunc = kwargs.pop("randfunc", get_random_bytes)
    if kwargs:
        raise TypeError("Unknown parameters: " + str(kwargs))

    if _curves[curve_name].id == _CurveID.ED25519:
        seed = randfunc(32)
        new_key = EccKey(curve=curve_name, seed=seed)
    elif _curves[curve_name].id == _CurveID.ED448:
        seed = randfunc(57)
        new_key = EccKey(curve=curve_name, seed=seed)
    elif _curves[curve_name].id == _CurveID.CURVE25519:
        seed = randfunc(32)
        new_key = EccKey(curve=curve_name, seed=seed)
        _curves[curve_name].validate(new_key.pointQ)
    elif _curves[curve_name].id == _CurveID.CURVE448:
        seed = randfunc(56)
        new_key = EccKey(curve=curve_name, seed=seed)
        _curves[curve_name].validate(new_key.pointQ)
    else:
        d = Integer.random_range(min_inclusive=1,
                                 max_exclusive=curve.order,
                                 randfunc=randfunc)
        new_key = EccKey(curve=curve_name, d=d)

    return new_key


def construct(**kwargs):
    """Build a new ECC key (private or public) starting
    from some base components.

    In most cases, you will already have an existing key
    which you can read in with :func:`import_key` instead
    of this function.

    Args:
      curve (string):
        Mandatory. The name of the elliptic curve, as defined in the `ECC table`_.

      d (integer):
        Mandatory for a private key and a NIST P-curve (e.g., P-256).
        It must be an integer in the range ``[1..order-1]``.

      seed (bytes):
        Mandatory for a private key and curves Ed25519 (32 bytes),
        Curve25519 (32 bytes), Curve448 (56 bytes) and Ed448 (57 bytes).

      point_x (integer):
        The X coordinate (affine) of the ECC point.
        Mandatory for a public key.

      point_y (integer):
        The Y coordinate (affine) of the ECC point.
        Mandatory for a public key,
        except for Curve25519 and Curve448.

    Returns:
      :class:`EccKey` : a new ECC key object
    """

    curve_name = kwargs["curve"]
    curve = _curves[curve_name]
    point_x = kwargs.pop("point_x", None)
    point_y = kwargs.pop("point_y", None)

    if "point" in kwargs:
        raise TypeError("Unknown keyword: point")

    if curve.id == _CurveID.CURVE25519:

        if point_x is not None:
            kwargs["point"] = EccXPoint(point_x, curve_name)
        new_key = EccKey(**kwargs)
        curve.validate(new_key.pointQ)

    elif curve.id == _CurveID.CURVE448:

        if point_x is not None:
            kwargs["point"] = EccXPoint(point_x, curve_name)
        new_key = EccKey(**kwargs)
        curve.validate(new_key.pointQ)

    else:

        if None not in (point_x, point_y):
            kwargs["point"] = EccPoint(point_x, point_y, curve_name)
        new_key = EccKey(**kwargs)

        # Validate that the private key matches the public one
        # because EccKey will not do that automatically
        if new_key.has_private() and 'point' in kwargs:
            pub_key = curve.G * new_key.d
            if pub_key.xy != (point_x, point_y):
                raise ValueError("Private and public ECC keys do not match")

    return new_key


def _import_public_der(ec_point, curve_oid=None, curve_name=None):
    """Convert an encoded EC point into an EccKey object

    ec_point: byte string with the EC point (SEC1-encoded)
    curve_oid: string with the name the curve
    curve_name: string with the OID of the curve

    Either curve_id or curve_name must be specified

    """

    for _curve_name, curve in _curves.items():
        if curve_oid and curve.oid == curve_oid:
            break
        if curve_name == _curve_name:
            break
    else:
        if curve_oid:
            raise UnsupportedEccFeature("Unsupported ECC curve (OID: %s)" % curve_oid)
        else:
            raise UnsupportedEccFeature("Unsupported ECC curve (%s)" % curve_name)

    # See 2.2 in RFC5480 and 2.3.3 in SEC1
    # The first byte is:
    # - 0x02:   compressed, only X-coordinate, Y-coordinate is even
    # - 0x03:   compressed, only X-coordinate, Y-coordinate is odd
    # - 0x04:   uncompressed, X-coordinate is followed by Y-coordinate
    #
    # PAI is in theory encoded as 0x00.

    modulus_bytes = curve.p.size_in_bytes()
    point_type = bord(ec_point[0])

    # Uncompressed point
    if point_type == 0x04:
        if len(ec_point) != (1 + 2 * modulus_bytes):
            raise ValueError("Incorrect EC point length")
        x = Integer.from_bytes(ec_point[1:modulus_bytes+1])
        y = Integer.from_bytes(ec_point[modulus_bytes+1:])
    # Compressed point
    elif point_type in (0x02, 0x03):
        if len(ec_point) != (1 + modulus_bytes):
            raise ValueError("Incorrect EC point length")
        x = Integer.from_bytes(ec_point[1:])
        # Right now, we only support Short Weierstrass curves
        y = (x**3 - x*3 + curve.b).sqrt(curve.p)
        if point_type == 0x02 and y.is_odd():
            y = curve.p - y
        if point_type == 0x03 and y.is_even():
            y = curve.p - y
    else:
        raise ValueError("Incorrect EC point encoding")

    return construct(curve=_curve_name, point_x=x, point_y=y)


def _import_subjectPublicKeyInfo(encoded, *kwargs):
    """Convert a subjectPublicKeyInfo into an EccKey object"""

    # See RFC5480

    # Parse the generic subjectPublicKeyInfo structure
    oid, ec_point, params = _expand_subject_public_key_info(encoded)

    nist_p_oids = (
        "1.2.840.10045.2.1",        # id-ecPublicKey (unrestricted)
        "1.3.132.1.12",             # id-ecDH
        "1.3.132.1.13"              # id-ecMQV
    )
    eddsa_oids = {
        "1.3.101.112": ("Ed25519", _import_ed25519_public_key),     # id-Ed25519
        "1.3.101.113": ("Ed448",   _import_ed448_public_key)        # id-Ed448
    }
    xdh_oids = {
        "1.3.101.110": ("Curve25519", _import_curve25519_public_key),   # id-X25519
        "1.3.101.111": ("Curve448", _import_curve448_public_key),       # id-X448
    }

    if oid in nist_p_oids:
        # See RFC5480

        # Parameters are mandatory and encoded as ECParameters
        # ECParameters ::= CHOICE {
        #   namedCurve         OBJECT IDENTIFIER
        #   -- implicitCurve   NULL
        #   -- specifiedCurve  SpecifiedECDomain
        # }
        # implicitCurve and specifiedCurve are not supported (as per RFC)
        if not params:
            raise ValueError("Missing ECC parameters for ECC OID %s" % oid)
        try:
            curve_oid = DerObjectId().decode(params).value
        except ValueError:
            raise ValueError("Error decoding namedCurve")

        # ECPoint ::= OCTET STRING
        return _import_public_der(ec_point, curve_oid=curve_oid)

    elif oid in eddsa_oids:
        # See RFC8410
        curve_name, import_eddsa_public_key = eddsa_oids[oid]

        # Parameters must be absent
        if params:
            raise ValueError("Unexpected ECC parameters for ECC OID %s" % oid)

        x, y = import_eddsa_public_key(ec_point)
        return construct(point_x=x, point_y=y, curve=curve_name)

    elif oid in xdh_oids:
        curve_name, import_xdh_public_key = xdh_oids[oid]

        # Parameters must be absent
        if params:
            raise ValueError("Unexpected ECC parameters for ECC OID %s" % oid)

        x = import_xdh_public_key(ec_point)
        return construct(point_x=x, curve=curve_name)

    else:
        raise UnsupportedEccFeature("Unsupported ECC OID: %s" % oid)


def _import_rfc5915_der(encoded, passphrase, curve_oid=None):

    # See RFC5915 https://tools.ietf.org/html/rfc5915
    #
    # ECPrivateKey ::= SEQUENCE {
    #           version        INTEGER { ecPrivkeyVer1(1) } (ecPrivkeyVer1),
    #           privateKey     OCTET STRING,
    #           parameters [0] ECParameters {{ NamedCurve }} OPTIONAL,
    #           publicKey  [1] BIT STRING OPTIONAL
    #    }

    ec_private_key = DerSequence().decode(encoded, nr_elements=(2, 3, 4))
    if ec_private_key[0] != 1:
        raise ValueError("Incorrect ECC private key version")

    scalar_bytes = DerOctetString().decode(ec_private_key[1]).payload

    next_element = 2

    # Try to decode 'parameters'
    if next_element < len(ec_private_key):
        try:
            parameters = DerObjectId(explicit=0).decode(ec_private_key[next_element]).value
            if curve_oid is not None and parameters != curve_oid:
                raise ValueError("Curve mismatch")
            curve_oid = parameters
            next_element += 1
        except ValueError:
            pass

    if curve_oid is None:
        raise ValueError("No curve found")

    for curve_name, curve in _curves.items():
        if curve.oid == curve_oid:
            break
    else:
        raise UnsupportedEccFeature("Unsupported ECC curve (OID: %s)" % curve_oid)

    modulus_bytes = curve.p.size_in_bytes()
    if len(scalar_bytes) != modulus_bytes:
        raise ValueError("Private key is too small")

    # Try to decode 'publicKey'
    point_x = point_y = None
    if next_element < len(ec_private_key):
        try:
            public_key_enc = DerBitString(explicit=1).decode(ec_private_key[next_element]).value
            public_key = _import_public_der(public_key_enc, curve_oid=curve_oid)
            point_x = public_key.pointQ.x
            point_y = public_key.pointQ.y
            next_element += 1
        except ValueError:
            pass

    d = Integer.from_bytes(scalar_bytes)
    return construct(curve=curve_name, d=d, point_x=point_x, point_y=point_y)


def _import_pkcs8(encoded, passphrase):
    from Crypto.IO import PKCS8

    algo_oid, private_key, params = PKCS8.unwrap(encoded, passphrase)

    nist_p_oids = (
        "1.2.840.10045.2.1",        # id-ecPublicKey (unrestricted)
        "1.3.132.1.12",             # id-ecDH
        "1.3.132.1.13"              # id-ecMQV
    )
    eddsa_oids = {
        "1.3.101.112": "Ed25519",   # id-Ed25519
        "1.3.101.113": "Ed448",     # id-Ed448
    }
    xdh_oids = {
        "1.3.101.110": "Curve25519",  # id-X25519
        "1.3.101.111": "Curve448",    # id-X448
    }

    if algo_oid in nist_p_oids:
        curve_oid = DerObjectId().decode(params).value
        return _import_rfc5915_der(private_key, passphrase, curve_oid)
    elif algo_oid in eddsa_oids:
        if params is not None:
            raise ValueError("EdDSA ECC private key must not have parameters")
        curve_oid = None
        seed = DerOctetString().decode(private_key).payload
        return construct(curve=eddsa_oids[algo_oid], seed=seed)
    elif algo_oid in xdh_oids:
        curve_name = xdh_oids[algo_oid]
        if params is not None:
            raise ValueError("%s ECC private key must not have parameters" %
                             curve_name)
        curve_oid = None
        seed = DerOctetString().decode(private_key).payload
        return construct(curve=xdh_oids[algo_oid], seed=seed)
    else:
        raise UnsupportedEccFeature("Unsupported ECC purpose (OID: %s)" % algo_oid)


def _import_x509_cert(encoded, *kwargs):

    sp_info = _extract_subject_public_key_info(encoded)
    return _import_subjectPublicKeyInfo(sp_info)


def _import_der(encoded, passphrase):

    try:
        return _import_subjectPublicKeyInfo(encoded, passphrase)
    except UnsupportedEccFeature as err:
        raise err
    except (ValueError, TypeError, IndexError):
        pass

    try:
        return _import_x509_cert(encoded, passphrase)
    except UnsupportedEccFeature as err:
        raise err
    except (ValueError, TypeError, IndexError):
        pass

    try:
        return _import_rfc5915_der(encoded, passphrase)
    except UnsupportedEccFeature as err:
        raise err
    except (ValueError, TypeError, IndexError):
        pass

    try:
        return _import_pkcs8(encoded, passphrase)
    except UnsupportedEccFeature as err:
        raise err
    except (ValueError, TypeError, IndexError):
        pass

    raise ValueError("Not an ECC DER key")


def _import_openssh_public(encoded):
    parts = encoded.split(b' ')
    if len(parts) not in (2, 3):
        raise ValueError("Not an openssh public key")

    try:
        keystring = binascii.a2b_base64(parts[1])

        keyparts = []
        while len(keystring) > 4:
            lk = struct.unpack(">I", keystring[:4])[0]
            keyparts.append(keystring[4:4 + lk])
            keystring = keystring[4 + lk:]

        if parts[0] != keyparts[0]:
            raise ValueError("Mismatch in openssh public key")

        # NIST P curves
        if parts[0].startswith(b"ecdsa-sha2-"):

            for curve_name, curve in _curves.items():
                if curve.openssh is None:
                    continue
                if not curve.openssh.startswith("ecdsa-sha2"):
                    continue
                middle = tobytes(curve.openssh.split("-")[2])
                if keyparts[1] == middle:
                    break
            else:
                raise ValueError("Unsupported ECC curve: " + middle)

            ecc_key = _import_public_der(keyparts[2], curve_oid=curve.oid)

        # EdDSA
        elif parts[0] == b"ssh-ed25519":
            x, y = _import_ed25519_public_key(keyparts[1])
            ecc_key = construct(curve="Ed25519", point_x=x, point_y=y)
        else:
            raise ValueError("Unsupported SSH key type: " + parts[0])

    except (IndexError, TypeError, binascii.Error):
        raise ValueError("Error parsing SSH key type: " + parts[0])

    return ecc_key


def _import_openssh_private_ecc(data, password):

    from ._openssh import (import_openssh_private_generic,
                           read_bytes, read_string, check_padding)

    key_type, decrypted = import_openssh_private_generic(data, password)

    eddsa_keys = {
        "ssh-ed25519": ("Ed25519", _import_ed25519_public_key, 32),
    }

    # https://datatracker.ietf.org/doc/html/draft-miller-ssh-agent-04
    if key_type.startswith("ecdsa-sha2"):

        ecdsa_curve_name, decrypted = read_string(decrypted)
        if ecdsa_curve_name not in _curves:
            raise UnsupportedEccFeature("Unsupported ECC curve %s" % ecdsa_curve_name)
        curve = _curves[ecdsa_curve_name]
        modulus_bytes = (curve.modulus_bits + 7) // 8

        public_key, decrypted = read_bytes(decrypted)

        if bord(public_key[0]) != 4:
            raise ValueError("Only uncompressed OpenSSH EC keys are supported")
        if len(public_key) != 2 * modulus_bytes + 1:
            raise ValueError("Incorrect public key length")

        point_x = Integer.from_bytes(public_key[1:1+modulus_bytes])
        point_y = Integer.from_bytes(public_key[1+modulus_bytes:])

        private_key, decrypted = read_bytes(decrypted)
        d = Integer.from_bytes(private_key)

        params = {'d': d, 'curve': ecdsa_curve_name}

    elif key_type in eddsa_keys:

        curve_name, import_eddsa_public_key, seed_len = eddsa_keys[key_type]

        public_key, decrypted = read_bytes(decrypted)
        point_x, point_y = import_eddsa_public_key(public_key)

        private_public_key, decrypted = read_bytes(decrypted)
        seed = private_public_key[:seed_len]

        params = {'seed': seed, 'curve': curve_name}
    else:
        raise ValueError("Unsupport SSH agent key type:" + key_type)

    _, padded = read_string(decrypted)  # Comment
    check_padding(padded)

    return construct(point_x=point_x, point_y=point_y, **params)


def _import_ed25519_public_key(encoded):
    """Import an Ed25519 ECC public key, encoded as raw bytes as described
    in RFC8032_.

    Args:
      encoded (bytes):
        The Ed25519 public key to import. It must be 32 bytes long.

    Returns:
      x and y (integer)

    Raises:
      ValueError: when the given key cannot be parsed.

    .. _RFC8032: https://datatracker.ietf.org/doc/html/rfc8032
    """

    if len(encoded) != 32:
        raise ValueError("Incorrect length. Only Ed25519 public keys are supported.")

    p = Integer(0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed)  # 2**255 - 19
    d = 37095705934669439343138083508754565189542113879843219016388785533085940283555

    y = bytearray(encoded)
    x_lsb = y[31] >> 7
    y[31] &= 0x7F
    point_y = Integer.from_bytes(y, byteorder='little')
    if point_y >= p:
        raise ValueError("Invalid Ed25519 key (y)")
    if point_y == 1:
        return 0, 1

    u = (point_y**2 - 1) % p
    v = ((point_y**2 % p) * d + 1) % p
    try:
        v_inv = v.inverse(p)
        x2 = (u * v_inv) % p
        point_x = Integer._tonelli_shanks(x2, p)
        if (point_x & 1) != x_lsb:
            point_x = p - point_x
    except ValueError:
        raise ValueError("Invalid Ed25519 public key")
    return point_x, point_y


def _import_curve25519_public_key(encoded):
    """Import a Curve25519 ECC public key,
    encoded as raw bytes as described in RFC7748_.

    Args:
      encoded (bytes):
        The Curve25519 public key to import. It must be 32 bytes long.

    Returns:
      x (integer)

    Raises:
      ValueError: when the given key cannot be parsed.

    .. _RFC7748: https://datatracker.ietf.org/doc/html/rfc7748
    """

    if len(encoded) != 32:
        raise ValueError("Incorrect Curve25519 key length")

    x = bytearray(encoded)
    # RFC 7741, Section 5
    x[31] &= 0x7F
    point_x = Integer.from_bytes(x, byteorder='little')

    return point_x


def _import_curve448_public_key(encoded):
    """Import a Curve448 ECC public key,
    encoded as raw bytes as described in RFC7748_.

    Args:
      encoded (bytes):
        The Curve448 public key to import. It must be 56 bytes long.

    Returns:
      x (integer)

    Raises:
      ValueError: when the given key cannot be parsed.

    .. _RFC7748: https://datatracker.ietf.org/doc/html/rfc7748
    """

    if len(encoded) != 56:
        raise ValueError("Incorrect Curve448 key length")

    point_x = Integer.from_bytes(encoded, byteorder='little')

    return point_x


def _import_ed448_public_key(encoded):
    """Import an Ed448 ECC public key, encoded as raw bytes as described
    in RFC8032_.

    Args:
      encoded (bytes):
        The Ed448 public key to import. It must be 57 bytes long.

    Returns:
        x and y (integer)

    Raises:
      ValueError: when the given key cannot be parsed.

    .. _RFC8032: https://datatracker.ietf.org/doc/html/rfc8032
    """

    if len(encoded) != 57:
        raise ValueError("Incorrect length. Only Ed448 public keys are supported.")

    p = _curves['curve448'].p
    d = p - 39081

    y = encoded[:56]
    x_lsb = bord(encoded[56]) >> 7
    point_y = Integer.from_bytes(y, byteorder='little')
    if point_y >= p:
        raise ValueError("Invalid Ed448 key (y)")
    if point_y == 1:
        return 0, 1

    u = (point_y**2 - 1) % p
    v = ((point_y**2 % p) * d - 1) % p
    try:
        v_inv = v.inverse(p)
        x2 = (u * v_inv) % p
        point_x = Integer._tonelli_shanks(x2, p)
        if (point_x & 1) != x_lsb:
            point_x = p - point_x
    except ValueError:
        raise ValueError("Invalid Ed448 public key")
    return point_x, point_y


def import_key(encoded, passphrase=None, curve_name=None):
    """Import an ECC key (public or private).

    Args:
      encoded (bytes or multi-line string):
        The ECC key to import.
        The function will try to automatically detect the right format.

        Supported formats for an ECC **public** key:

        * X.509 certificate: binary (DER) or ASCII (PEM).
        * X.509 ``subjectPublicKeyInfo``: binary (DER) or ASCII (PEM).
        * SEC1_ (or X9.62), as ``bytes``. NIST P curves only.
          You must also provide the ``curve_name`` (with a value from the `ECC table`_)
        * OpenSSH line, defined in RFC5656_ and RFC8709_ (ASCII).
          This is normally the content of files like ``~/.ssh/id_ecdsa.pub``.

        Supported formats for an ECC **private** key:

        * A binary ``ECPrivateKey`` structure, as defined in `RFC5915`_ (DER).
          NIST P curves only.
        * A `PKCS#8`_ structure (or the more recent Asymmetric Key
          Package, RFC5958_): binary (DER) or ASCII (PEM).
        * `OpenSSH 6.5`_ and newer versions (ASCII).

        Private keys can be in the clear or password-protected.

        For details about the PEM encoding, see `RFC1421`_/`RFC1423`_.

      passphrase (byte string):
        The passphrase to use for decrypting a private key.
        Encryption may be applied protected at the PEM level (not recommended)
        or at the PKCS#8 level (recommended).
        This parameter is ignored if the key in input is not encrypted.

      curve_name (string):
        For a SEC1 encoding only. This is the name of the curve,
        as defined in the `ECC table`_.

    .. note::

        To import EdDSA private and public keys, when encoded as raw ``bytes``, use:

        * :func:`Crypto.Signature.eddsa.import_public_key`, or
        * :func:`Crypto.Signature.eddsa.import_private_key`.

    .. note::

        To import X25519/X448 private and public keys, when encoded as raw ``bytes``, use:

        * :func:`Crypto.Protocol.DH.import_x25519_public_key`
        * :func:`Crypto.Protocol.DH.import_x25519_private_key`
        * :func:`Crypto.Protocol.DH.import_x448_public_key`
        * :func:`Crypto.Protocol.DH.import_x448_private_key`

    Returns:
      :class:`EccKey` : a new ECC key object

    Raises:
      ValueError: when the given key cannot be parsed (possibly because
        the pass phrase is wrong).

    .. _RFC1421: https://datatracker.ietf.org/doc/html/rfc1421
    .. _RFC1423: https://datatracker.ietf.org/doc/html/rfc1423
    .. _RFC5915: https://datatracker.ietf.org/doc/html/rfc5915
    .. _RFC5656: https://datatracker.ietf.org/doc/html/rfc5656
    .. _RFC8709: https://datatracker.ietf.org/doc/html/rfc8709
    .. _RFC5958: https://datatracker.ietf.org/doc/html/rfc5958
    .. _`PKCS#8`: https://datatracker.ietf.org/doc/html/rfc5208
    .. _`OpenSSH 6.5`: https://flak.tedunangst.com/post/new-openssh-key-format-and-bcrypt-pbkdf
    .. _SEC1: https://www.secg.org/sec1-v2.pdf
    """

    from Crypto.IO import PEM

    encoded = tobytes(encoded)
    if passphrase is not None:
        passphrase = tobytes(passphrase)

    # PEM
    if encoded.startswith(b'-----BEGIN OPENSSH PRIVATE KEY'):
        text_encoded = tostr(encoded)
        openssh_encoded, marker, enc_flag = PEM.decode(text_encoded, passphrase)
        result = _import_openssh_private_ecc(openssh_encoded, passphrase)
        return result

    elif encoded.startswith(b'-----'):

        text_encoded = tostr(encoded)

        # Remove any EC PARAMETERS section
        # Ignore its content because the curve type must be already given in the key
        ecparams_start = "-----BEGIN EC PARAMETERS-----"
        ecparams_end = "-----END EC PARAMETERS-----"
        text_encoded = re.sub(ecparams_start + ".*?" + ecparams_end, "",
                              text_encoded,
                              flags=re.DOTALL)

        der_encoded, marker, enc_flag = PEM.decode(text_encoded, passphrase)
        if enc_flag:
            passphrase = None
        try:
            result = _import_der(der_encoded, passphrase)
        except UnsupportedEccFeature as uef:
            raise uef
        except ValueError:
            raise ValueError("Invalid DER encoding inside the PEM file")
        return result

    # OpenSSH
    if encoded.startswith((b'ecdsa-sha2-', b'ssh-ed25519')):
        return _import_openssh_public(encoded)

    # DER
    if len(encoded) > 0 and bord(encoded[0]) == 0x30:
        return _import_der(encoded, passphrase)

    # SEC1
    if len(encoded) > 0 and bord(encoded[0]) in (0x02, 0x03, 0x04):
        if curve_name is None:
            raise ValueError("No curve name was provided")
        return _import_public_der(encoded, curve_name=curve_name)

    raise ValueError("ECC key format is not supported")


if __name__ == "__main__":

    import time

    d = 0xc51e4753afdec1e6b6c6a5b992f43f8dd0c7a8933072708b6522468b2ffb06fd

    point = _curves['p256'].G.copy()
    count = 3000

    start = time.time()
    for x in range(count):
        pointX = point * d
    print("(P-256 G)", (time.time() - start) / count * 1000, "ms")

    start = time.time()
    for x in range(count):
        pointX = pointX * d
    print("(P-256 arbitrary point)", (time.time() - start) / count * 1000, "ms")
