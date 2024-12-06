# This file is licensed under the BSD 2-Clause License.
# See https://opensource.org/licenses/BSD-2-Clause for details.

from ._curve import _Curve
from Crypto.Math.Numbers import Integer
from Crypto.Util._raw_api import (load_pycryptodome_raw_lib, VoidPointer,
                                  SmartPointer, c_size_t, c_uint8_ptr,
                                  c_ulonglong)
from Crypto.Util.number import long_to_bytes
from Crypto.Random.random import getrandbits


_ec_lib = load_pycryptodome_raw_lib("Crypto.PublicKey._ec_ws", """
typedef void EcContext;
typedef void EcPoint;
int ec_ws_new_context(EcContext **pec_ctx,
                      const uint8_t *modulus,
                      const uint8_t *b,
                      const uint8_t *order,
                      size_t len,
                      uint64_t seed);
void ec_ws_free_context(EcContext *ec_ctx);
int ec_ws_new_point(EcPoint **pecp,
                    const uint8_t *x,
                    const uint8_t *y,
                    size_t len,
                    const EcContext *ec_ctx);
void ec_ws_free_point(EcPoint *ecp);
int ec_ws_get_xy(uint8_t *x,
                 uint8_t *y,
                 size_t len,
                 const EcPoint *ecp);
int ec_ws_double(EcPoint *p);
int ec_ws_add(EcPoint *ecpa, EcPoint *ecpb);
int ec_ws_scalar(EcPoint *ecp,
                 const uint8_t *k,
                 size_t len,
                 uint64_t seed);
int ec_ws_clone(EcPoint **pecp2, const EcPoint *ecp);
int ec_ws_cmp(const EcPoint *ecp1, const EcPoint *ecp2);
int ec_ws_neg(EcPoint *p);
""")


class EcLib(object):
    new_context = _ec_lib.ec_ws_new_context
    free_context = _ec_lib.ec_ws_free_context
    new_point = _ec_lib.ec_ws_new_point
    free_point = _ec_lib.ec_ws_free_point
    get_xy = _ec_lib.ec_ws_get_xy
    double = _ec_lib.ec_ws_double
    add = _ec_lib.ec_ws_add
    scalar = _ec_lib.ec_ws_scalar
    clone = _ec_lib.ec_ws_clone
    cmp = _ec_lib.ec_ws_cmp
    neg = _ec_lib.ec_ws_neg


def p192_curve():
    p = 0xfffffffffffffffffffffffffffffffeffffffffffffffff
    b = 0x64210519e59c80e70fa7e9ab72243049feb8deecc146b9b1
    order = 0xffffffffffffffffffffffff99def836146bc9b1b4d22831
    Gx = 0x188da80eb03090f67cbf20eb43a18800f4ff0afd82ff1012
    Gy = 0x07192b95ffc8da78631011ed6b24cdd573f977a11e794811

    p192_modulus = long_to_bytes(p, 24)
    p192_b = long_to_bytes(b, 24)
    p192_order = long_to_bytes(order, 24)

    ec_p192_context = VoidPointer()
    result = _ec_lib.ec_ws_new_context(ec_p192_context.address_of(),
                                       c_uint8_ptr(p192_modulus),
                                       c_uint8_ptr(p192_b),
                                       c_uint8_ptr(p192_order),
                                       c_size_t(len(p192_modulus)),
                                       c_ulonglong(getrandbits(64))
                                       )
    if result:
        raise ImportError("Error %d initializing P-192 context" % result)

    context = SmartPointer(ec_p192_context.get(), _ec_lib.ec_ws_free_context)
    p192 = _Curve(Integer(p),
                  Integer(b),
                  Integer(order),
                  Integer(Gx),
                  Integer(Gy),
                  None,
                  192,
                  "1.2.840.10045.3.1.1",    # ANSI X9.62 / SEC2
                  context,
                  "NIST P-192",
                  "ecdsa-sha2-nistp192",
                  EcLib)
    return p192


def p224_curve():
    p = 0xffffffffffffffffffffffffffffffff000000000000000000000001
    b = 0xb4050a850c04b3abf54132565044b0b7d7bfd8ba270b39432355ffb4
    order = 0xffffffffffffffffffffffffffff16a2e0b8f03e13dd29455c5c2a3d
    Gx = 0xb70e0cbd6bb4bf7f321390b94a03c1d356c21122343280d6115c1d21
    Gy = 0xbd376388b5f723fb4c22dfe6cd4375a05a07476444d5819985007e34

    p224_modulus = long_to_bytes(p, 28)
    p224_b = long_to_bytes(b, 28)
    p224_order = long_to_bytes(order, 28)

    ec_p224_context = VoidPointer()
    result = _ec_lib.ec_ws_new_context(ec_p224_context.address_of(),
                                       c_uint8_ptr(p224_modulus),
                                       c_uint8_ptr(p224_b),
                                       c_uint8_ptr(p224_order),
                                       c_size_t(len(p224_modulus)),
                                       c_ulonglong(getrandbits(64))
                                       )
    if result:
        raise ImportError("Error %d initializing P-224 context" % result)

    context = SmartPointer(ec_p224_context.get(), _ec_lib.ec_ws_free_context)
    p224 = _Curve(Integer(p),
                  Integer(b),
                  Integer(order),
                  Integer(Gx),
                  Integer(Gy),
                  None,
                  224,
                  "1.3.132.0.33",    # SEC 2
                  context,
                  "NIST P-224",
                  "ecdsa-sha2-nistp224",
                  EcLib)
    return p224


def p256_curve():
    p = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff
    b = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b
    order = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551
    Gx = 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296
    Gy = 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5

    p256_modulus = long_to_bytes(p, 32)
    p256_b = long_to_bytes(b, 32)
    p256_order = long_to_bytes(order, 32)

    ec_p256_context = VoidPointer()
    result = _ec_lib.ec_ws_new_context(ec_p256_context.address_of(),
                                       c_uint8_ptr(p256_modulus),
                                       c_uint8_ptr(p256_b),
                                       c_uint8_ptr(p256_order),
                                       c_size_t(len(p256_modulus)),
                                       c_ulonglong(getrandbits(64))
                                       )
    if result:
        raise ImportError("Error %d initializing P-256 context" % result)

    context = SmartPointer(ec_p256_context.get(), _ec_lib.ec_ws_free_context)
    p256 = _Curve(Integer(p),
                  Integer(b),
                  Integer(order),
                  Integer(Gx),
                  Integer(Gy),
                  None,
                  256,
                  "1.2.840.10045.3.1.7",    # ANSI X9.62 / SEC2
                  context,
                  "NIST P-256",
                  "ecdsa-sha2-nistp256",
                  EcLib)
    return p256


def p384_curve():
    p = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffeffffffff0000000000000000ffffffff
    b = 0xb3312fa7e23ee7e4988e056be3f82d19181d9c6efe8141120314088f5013875ac656398d8a2ed19d2a85c8edd3ec2aef
    order = 0xffffffffffffffffffffffffffffffffffffffffffffffffc7634d81f4372ddf581a0db248b0a77aecec196accc52973
    Gx = 0xaa87ca22be8b05378eb1c71ef320ad746e1d3b628ba79b9859f741e082542a385502f25dbf55296c3a545e3872760aB7
    Gy = 0x3617de4a96262c6f5d9e98bf9292dc29f8f41dbd289a147ce9da3113b5f0b8c00a60b1ce1d7e819d7a431d7c90ea0e5F

    p384_modulus = long_to_bytes(p, 48)
    p384_b = long_to_bytes(b, 48)
    p384_order = long_to_bytes(order, 48)

    ec_p384_context = VoidPointer()
    result = _ec_lib.ec_ws_new_context(ec_p384_context.address_of(),
                                       c_uint8_ptr(p384_modulus),
                                       c_uint8_ptr(p384_b),
                                       c_uint8_ptr(p384_order),
                                       c_size_t(len(p384_modulus)),
                                       c_ulonglong(getrandbits(64))
                                       )
    if result:
        raise ImportError("Error %d initializing P-384 context" % result)

    context = SmartPointer(ec_p384_context.get(), _ec_lib.ec_ws_free_context)
    p384 = _Curve(Integer(p),
                  Integer(b),
                  Integer(order),
                  Integer(Gx),
                  Integer(Gy),
                  None,
                  384,
                  "1.3.132.0.34",   # SEC 2
                  context,
                  "NIST P-384",
                  "ecdsa-sha2-nistp384",
                  EcLib)
    return p384


def p521_curve():
    p = 0x000001ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
    b = 0x00000051953eb9618e1c9a1f929a21a0b68540eea2da725b99b315f3b8b489918ef109e156193951ec7e937b1652c0bd3bb1bf073573df883d2c34f1ef451fd46b503f00
    order = 0x000001fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffa51868783bf2f966b7fcc0148f709a5d03bb5c9b8899c47aebb6fb71e91386409
    Gx = 0x000000c6858e06b70404e9cd9e3ecb662395b4429c648139053fb521f828af606b4d3dbaa14b5e77efe75928fe1dc127a2ffa8de3348b3c1856a429bf97e7e31c2e5bd66
    Gy = 0x0000011839296a789a3bc0045c8a5fb42c7d1bd998f54449579b446817afbd17273e662c97ee72995ef42640c550b9013fad0761353c7086a272c24088be94769fd16650

    p521_modulus = long_to_bytes(p, 66)
    p521_b = long_to_bytes(b, 66)
    p521_order = long_to_bytes(order, 66)

    ec_p521_context = VoidPointer()
    result = _ec_lib.ec_ws_new_context(ec_p521_context.address_of(),
                                       c_uint8_ptr(p521_modulus),
                                       c_uint8_ptr(p521_b),
                                       c_uint8_ptr(p521_order),
                                       c_size_t(len(p521_modulus)),
                                       c_ulonglong(getrandbits(64))
                                       )
    if result:
        raise ImportError("Error %d initializing P-521 context" % result)

    context = SmartPointer(ec_p521_context.get(), _ec_lib.ec_ws_free_context)
    p521 = _Curve(Integer(p),
                  Integer(b),
                  Integer(order),
                  Integer(Gx),
                  Integer(Gy),
                  None,
                  521,
                  "1.3.132.0.35",   # SEC 2
                  context,
                  "NIST P-521",
                  "ecdsa-sha2-nistp521",
                  EcLib)
    return p521
