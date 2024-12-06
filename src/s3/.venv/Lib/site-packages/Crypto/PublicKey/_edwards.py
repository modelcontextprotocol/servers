# This file is licensed under the BSD 2-Clause License.
# See https://opensource.org/licenses/BSD-2-Clause for details.

from ._curve import _Curve
from Crypto.Math.Numbers import Integer
from Crypto.Util._raw_api import (load_pycryptodome_raw_lib, VoidPointer,
                                  SmartPointer)


def ed25519_curve():
    p = 0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed  # 2**255 - 19
    order = 0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed
    Gx = 0x216936d3cd6e53fec0a4e231fdd6dc5c692cc7609525a7b2c9562d608f25d51a
    Gy = 0x6666666666666666666666666666666666666666666666666666666666666658

    _ed25519_lib = load_pycryptodome_raw_lib("Crypto.PublicKey._ed25519", """
typedef void Point;
int ed25519_new_point(Point **out,
                      const uint8_t x[32],
                      const uint8_t y[32],
                      size_t modsize,
                      const void *context);
int ed25519_clone(Point **P, const Point *Q);
void ed25519_free_point(Point *p);
int ed25519_cmp(const Point *p1, const Point *p2);
int ed25519_neg(Point *p);
int ed25519_get_xy(uint8_t *xb, uint8_t *yb, size_t modsize, Point *p);
int ed25519_double(Point *p);
int ed25519_add(Point *P1, const Point *P2);
int ed25519_scalar(Point *P, const uint8_t *scalar, size_t scalar_len, uint64_t seed);
""")

    class EcLib(object):
        new_point = _ed25519_lib.ed25519_new_point
        clone = _ed25519_lib.ed25519_clone
        free_point = _ed25519_lib.ed25519_free_point
        cmp = _ed25519_lib.ed25519_cmp
        neg = _ed25519_lib.ed25519_neg
        get_xy = _ed25519_lib.ed25519_get_xy
        double = _ed25519_lib.ed25519_double
        add = _ed25519_lib.ed25519_add
        scalar = _ed25519_lib.ed25519_scalar

    ed25519 = _Curve(Integer(p),
                     None,
                     Integer(order),
                     Integer(Gx),
                     Integer(Gy),
                     None,
                     255,
                     "1.3.101.112",     # RFC8410
                     None,
                     "Ed25519",
                     "ssh-ed25519",
                     EcLib)
    return ed25519


def ed448_curve():
    p = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffeffffffffffffffffffffffffffffffffffffffffffffffffffffffff  # 2**448 - 2**224 - 1
    order = 0x3fffffffffffffffffffffffffffffffffffffffffffffffffffffff7cca23e9c44edb49aed63690216cc2728dc58f552378c292ab5844f3
    Gx = 0x4f1970c66bed0ded221d15a622bf36da9e146570470f1767ea6de324a3d3a46412ae1af72ab66511433b80e18b00938e2626a82bc70cc05e
    Gy = 0x693f46716eb6bc248876203756c9c7624bea73736ca3984087789c1e05a0c2d73ad3ff1ce67c39c4fdbd132c4ed7c8ad9808795bf230fa14

    _ed448_lib = load_pycryptodome_raw_lib("Crypto.PublicKey._ed448", """
typedef void EcContext;
typedef void PointEd448;
int ed448_new_context(EcContext **pec_ctx);
void ed448_context(EcContext *ec_ctx);
void ed448_free_context(EcContext *ec_ctx);
int ed448_new_point(PointEd448 **out,
                    const uint8_t x[56],
                    const uint8_t y[56],
                    size_t len,
                    const EcContext *context);
int ed448_clone(PointEd448 **P, const PointEd448 *Q);
void ed448_free_point(PointEd448 *p);
int ed448_cmp(const PointEd448 *p1, const PointEd448 *p2);
int ed448_neg(PointEd448 *p);
int ed448_get_xy(uint8_t *xb, uint8_t *yb, size_t len, const PointEd448 *p);
int ed448_double(PointEd448 *p);
int ed448_add(PointEd448 *P1, const PointEd448 *P2);
int ed448_scalar(PointEd448 *P, const uint8_t *scalar, size_t scalar_len, uint64_t seed);
""")

    class EcLib(object):
        new_point = _ed448_lib.ed448_new_point
        clone = _ed448_lib.ed448_clone
        free_point = _ed448_lib.ed448_free_point
        cmp = _ed448_lib.ed448_cmp
        neg = _ed448_lib.ed448_neg
        get_xy = _ed448_lib.ed448_get_xy
        double = _ed448_lib.ed448_double
        add = _ed448_lib.ed448_add
        scalar = _ed448_lib.ed448_scalar

    ed448_context = VoidPointer()
    result = _ed448_lib.ed448_new_context(ed448_context.address_of())
    if result:
        raise ImportError("Error %d initializing Ed448 context" % result)

    context = SmartPointer(ed448_context.get(), _ed448_lib.ed448_free_context)

    ed448 = _Curve(Integer(p),
                   None,
                   Integer(order),
                   Integer(Gx),
                   Integer(Gy),
                   None,
                   448,
                   "1.3.101.113",       # RFC8410
                   context,
                   "Ed448",
                   None,
                   EcLib)
    return ed448
