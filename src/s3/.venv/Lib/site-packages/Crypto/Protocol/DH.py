from Crypto.Util.number import long_to_bytes
from Crypto.PublicKey.ECC import (EccKey,
                                  construct,
                                  _import_curve25519_public_key,
                                  _import_curve448_public_key)


def _compute_ecdh(key_priv, key_pub):
    pointP = key_pub.pointQ * key_priv.d
    if pointP.is_point_at_infinity():
         raise ValueError("Invalid ECDH point")

    if key_priv.curve == "Curve25519":
        z = bytearray(pointP.x.to_bytes(32, byteorder='little'))
    elif key_priv.curve == "Curve448":
        z = bytearray(pointP.x.to_bytes(56, byteorder='little'))
    else:
        # See Section 5.7.1.2 in NIST SP 800-56Ar3
        z = long_to_bytes(pointP.x, pointP.size_in_bytes())
    return z


def import_x25519_public_key(encoded):
    """Create a new X25519 public key object,
    starting from the key encoded as raw ``bytes``,
    in the format described in RFC7748.

    Args:
      encoded (bytes):
        The x25519 public key to import.
        It must be 32 bytes.

    Returns:
      :class:`Crypto.PublicKey.EccKey` : a new ECC key object.

    Raises:
      ValueError: when the given key cannot be parsed.
    """

    x = _import_curve25519_public_key(encoded)
    return construct(curve='Curve25519', point_x=x)


def import_x25519_private_key(encoded):
    """Create a new X25519 private key object,
    starting from the key encoded as raw ``bytes``,
    in the format described in RFC7748.

    Args:
      encoded (bytes):
        The X25519 private key to import.
        It must be 32 bytes.

    Returns:
      :class:`Crypto.PublicKey.EccKey` : a new ECC key object.

    Raises:
      ValueError: when the given key cannot be parsed.
    """

    return construct(seed=encoded, curve="Curve25519")


def import_x448_public_key(encoded):
    """Create a new X448 public key object,
    starting from the key encoded as raw ``bytes``,
    in the format described in RFC7748.

    Args:
      encoded (bytes):
        The x448 public key to import.
        It must be 56 bytes.

    Returns:
      :class:`Crypto.PublicKey.EccKey` : a new ECC key object.

    Raises:
      ValueError: when the given key cannot be parsed.
    """

    x = _import_curve448_public_key(encoded)
    return construct(curve='Curve448', point_x=x)


def import_x448_private_key(encoded):
    """Create a new X448 private key object,
    starting from the key encoded as raw ``bytes``,
    in the format described in RFC7748.

    Args:
      encoded (bytes):
        The X448 private key to import.
        It must be 56 bytes.

    Returns:
      :class:`Crypto.PublicKey.EccKey` : a new ECC key object.

    Raises:
      ValueError: when the given key cannot be parsed.
    """

    return construct(seed=encoded, curve="Curve448")


def key_agreement(**kwargs):
    """Perform a Diffie-Hellman key agreement.

    Keywords:
      kdf (callable):
        A key derivation function that accepts ``bytes`` as input and returns
        ``bytes``.
      static_priv (EccKey):
        The local static private key. Optional.
      static_pub (EccKey):
        The static public key that belongs to the peer. Optional.
      eph_priv (EccKey):
        The local ephemeral private key, generated for this session. Optional.
      eph_pub (EccKey):
        The ephemeral public key, received from the peer for this session. Optional.

    At least two keys must be passed, of which one is a private key and one
    a public key.

    Returns (bytes):
      The derived secret key material.
    """

    static_priv = kwargs.get('static_priv', None)
    static_pub = kwargs.get('static_pub', None)
    eph_priv = kwargs.get('eph_priv', None)
    eph_pub = kwargs.get('eph_pub', None)
    kdf = kwargs.get('kdf', None)

    if kdf is None:
        raise ValueError("'kdf' is mandatory")

    count_priv = 0
    count_pub = 0
    curve = None

    def check_curve(curve, key, name, private):
        if not isinstance(key, EccKey):
            raise TypeError("'%s' must be an ECC key" % name)
        if private and not key.has_private():
            raise TypeError("'%s' must be a private ECC key" % name)
        if curve is None:
            curve = key.curve
        elif curve != key.curve:
            raise TypeError("'%s' is defined on an incompatible curve" % name)
        return curve

    if static_priv is not None:
        curve = check_curve(curve, static_priv, 'static_priv', True)
        count_priv += 1

    if static_pub is not None:
        curve = check_curve(curve, static_pub, 'static_pub', False)
        count_pub += 1

    if eph_priv is not None:
        curve = check_curve(curve, eph_priv, 'eph_priv', True)
        count_priv += 1

    if eph_pub is not None:
        curve = check_curve(curve, eph_pub, 'eph_pub', False)
        count_pub += 1

    if (count_priv + count_pub) < 2 or count_priv == 0 or count_pub == 0:
        raise ValueError("Too few keys for the ECDH key agreement")

    Zs = b''
    Ze = b''

    if static_priv and static_pub:
        # C(*, 2s)
        Zs = _compute_ecdh(static_priv, static_pub)

    if eph_priv and eph_pub:
        # C(2e, 0s) or C(2e, 2s)
        if bool(static_priv) != bool(static_pub):
            raise ValueError("DH mode C(2e, 1s) is not supported")
        Ze = _compute_ecdh(eph_priv, eph_pub)
    elif eph_priv and static_pub:
        # C(1e, 2s) or C(1e, 1s)
        Ze = _compute_ecdh(eph_priv, static_pub)
    elif eph_pub and static_priv:
        # C(1e, 2s) or C(1e, 1s)
        Ze = _compute_ecdh(static_priv, eph_pub)

    Z = Ze + Zs

    return kdf(Z)
