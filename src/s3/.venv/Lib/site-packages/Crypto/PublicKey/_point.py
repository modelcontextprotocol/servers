# This file is licensed under the BSD 2-Clause License.
# See https://opensource.org/licenses/BSD-2-Clause for details.

import threading

from Crypto.Util.number import bytes_to_long, long_to_bytes
from Crypto.Util._raw_api import (VoidPointer, null_pointer,
                                  SmartPointer, c_size_t, c_uint8_ptr,
                                  c_ulonglong)
from Crypto.Math.Numbers import Integer
from Crypto.Random.random import getrandbits


class CurveID(object):
    P192 = 1
    P224 = 2
    P256 = 3
    P384 = 4
    P521 = 5
    ED25519 = 6
    ED448 = 7
    CURVE25519 = 8
    CURVE448 = 9


class _Curves(object):

    curves = {}
    curves_lock = threading.RLock()

    p192_names = ["p192", "NIST P-192", "P-192", "prime192v1", "secp192r1",
                  "nistp192"]
    p224_names = ["p224", "NIST P-224", "P-224", "prime224v1", "secp224r1",
                  "nistp224"]
    p256_names = ["p256", "NIST P-256", "P-256", "prime256v1", "secp256r1",
                  "nistp256"]
    p384_names = ["p384", "NIST P-384", "P-384", "prime384v1", "secp384r1",
                  "nistp384"]
    p521_names = ["p521", "NIST P-521", "P-521", "prime521v1", "secp521r1",
                  "nistp521"]
    ed25519_names = ["ed25519", "Ed25519"]
    ed448_names = ["ed448", "Ed448"]
    curve25519_names = ["curve25519", "Curve25519", "X25519"]
    curve448_names = ["curve448", "Curve448", "X448"]

    all_names = p192_names + p224_names + p256_names + p384_names + p521_names + \
        ed25519_names + ed448_names + curve25519_names + curve448_names

    def __contains__(self, item):
        return item in self.all_names

    def __dir__(self):
        return self.all_names

    def load(self, name):
        if name in self.p192_names:
            from . import _nist_ecc
            p192 = _nist_ecc.p192_curve()
            p192.id = CurveID.P192
            self.curves.update(dict.fromkeys(self.p192_names, p192))
        elif name in self.p224_names:
            from . import _nist_ecc
            p224 = _nist_ecc.p224_curve()
            p224.id = CurveID.P224
            self.curves.update(dict.fromkeys(self.p224_names, p224))
        elif name in self.p256_names:
            from . import _nist_ecc
            p256 = _nist_ecc.p256_curve()
            p256.id = CurveID.P256
            self.curves.update(dict.fromkeys(self.p256_names, p256))
        elif name in self.p384_names:
            from . import _nist_ecc
            p384 = _nist_ecc.p384_curve()
            p384.id = CurveID.P384
            self.curves.update(dict.fromkeys(self.p384_names, p384))
        elif name in self.p521_names:
            from . import _nist_ecc
            p521 = _nist_ecc.p521_curve()
            p521.id = CurveID.P521
            self.curves.update(dict.fromkeys(self.p521_names, p521))
        elif name in self.ed25519_names:
            from . import _edwards
            ed25519 = _edwards.ed25519_curve()
            ed25519.id = CurveID.ED25519
            self.curves.update(dict.fromkeys(self.ed25519_names, ed25519))
        elif name in self.ed448_names:
            from . import _edwards
            ed448 = _edwards.ed448_curve()
            ed448.id = CurveID.ED448
            self.curves.update(dict.fromkeys(self.ed448_names, ed448))
        elif name in self.curve25519_names:
            from . import _montgomery
            curve25519 = _montgomery.curve25519_curve()
            curve25519.id = CurveID.CURVE25519
            self.curves.update(dict.fromkeys(self.curve25519_names, curve25519))
        elif name in self.curve448_names:
            from . import _montgomery
            curve448 = _montgomery.curve448_curve()
            curve448.id = CurveID.CURVE448
            self.curves.update(dict.fromkeys(self.curve448_names, curve448))
        else:
            raise ValueError("Unsupported curve '%s'" % name)
        return self.curves[name]

    def __getitem__(self, name):
        with self.curves_lock:
            curve = self.curves.get(name)
            if curve is None:
                curve = self.load(name)
                if name in self.curve25519_names or name in self.curve448_names:
                    curve.G = EccXPoint(curve.Gx, name)
                else:
                    curve.G = EccPoint(curve.Gx, curve.Gy, name)
                curve.is_edwards = curve.id in (CurveID.ED25519, CurveID.ED448)
                curve.is_montgomery = curve.id in (CurveID.CURVE25519,
                                                   CurveID.CURVE448)
                curve.is_weierstrass = not (curve.is_edwards or
                                            curve.is_montgomery)
        return curve

    def items(self):
        # Load all curves
        for name in self.all_names:
            _ = self[name]
        return self.curves.items()


_curves = _Curves()


class EccPoint(object):
    """A class to model a point on an Elliptic Curve.

    The class supports operators for:

    * Adding two points: ``R = S + T``
    * In-place addition: ``S += T``
    * Negating a point: ``R = -T``
    * Comparing two points: ``if S == T: ...`` or ``if S != T: ...``
    * Multiplying a point by a scalar: ``R = S*k``
    * In-place multiplication by a scalar: ``T *= k``

    :ivar curve: The **canonical** name of the curve as defined in the `ECC table`_.
    :vartype curve: string

    :ivar x: The affine X-coordinate of the ECC point
    :vartype x: integer

    :ivar y: The affine Y-coordinate of the ECC point
    :vartype y: integer

    :ivar xy: The tuple with affine X- and Y- coordinates
    """

    def __init__(self, x, y, curve="p256"):

        try:
            self._curve = _curves[curve]
        except KeyError:
            raise ValueError("Unknown curve name %s" % str(curve))
        self.curve = self._curve.canonical

        if self._curve.id == CurveID.CURVE25519:
            raise ValueError("EccPoint cannot be created for Curve25519")

        modulus_bytes = self.size_in_bytes()

        xb = long_to_bytes(x, modulus_bytes)
        yb = long_to_bytes(y, modulus_bytes)
        if len(xb) != modulus_bytes or len(yb) != modulus_bytes:
            raise ValueError("Incorrect coordinate length")

        new_point = self._curve.rawlib.new_point
        free_func = self._curve.rawlib.free_point

        self._point = VoidPointer()
        try:
            context = self._curve.context.get()
        except AttributeError:
            context = null_pointer
        result = new_point(self._point.address_of(),
                           c_uint8_ptr(xb),
                           c_uint8_ptr(yb),
                           c_size_t(modulus_bytes),
                           context)

        if result:
            if result == 15:
                raise ValueError("The EC point does not belong to the curve")
            raise ValueError("Error %d while instantiating an EC point" % result)

        # Ensure that object disposal of this Python object will (eventually)
        # free the memory allocated by the raw library for the EC point
        self._point = SmartPointer(self._point.get(), free_func)

    def set(self, point):
        clone = self._curve.rawlib.clone
        free_func = self._curve.rawlib.free_point

        self._point = VoidPointer()
        result = clone(self._point.address_of(),
                       point._point.get())

        if result:
            raise ValueError("Error %d while cloning an EC point" % result)

        self._point = SmartPointer(self._point.get(), free_func)
        return self

    def __eq__(self, point):
        if not isinstance(point, EccPoint):
            return False

        cmp_func = self._curve.rawlib.cmp
        return 0 == cmp_func(self._point.get(), point._point.get())

    # Only needed for Python 2
    def __ne__(self, point):
        return not self == point

    def __neg__(self):
        neg_func = self._curve.rawlib.neg
        np = self.copy()
        result = neg_func(np._point.get())
        if result:
            raise ValueError("Error %d while inverting an EC point" % result)
        return np

    def copy(self):
        """Return a copy of this point."""
        x, y = self.xy
        np = EccPoint(x, y, self.curve)
        return np

    def is_point_at_infinity(self):
        """``True`` if this is the *point-at-infinity*."""

        if self._curve.is_edwards:
            return self.x == 0
        else:
            return self.xy == (0, 0)

    def point_at_infinity(self):
        """Return the *point-at-infinity* for the curve."""

        if self._curve.is_edwards:
            return EccPoint(0, 1, self.curve)
        else:
            return EccPoint(0, 0, self.curve)

    @property
    def x(self):
        return self.xy[0]

    @property
    def y(self):
        return self.xy[1]

    @property
    def xy(self):
        modulus_bytes = self.size_in_bytes()
        xb = bytearray(modulus_bytes)
        yb = bytearray(modulus_bytes)
        get_xy = self._curve.rawlib.get_xy
        result = get_xy(c_uint8_ptr(xb),
                        c_uint8_ptr(yb),
                        c_size_t(modulus_bytes),
                        self._point.get())
        if result:
            raise ValueError("Error %d while encoding an EC point" % result)

        return (Integer(bytes_to_long(xb)), Integer(bytes_to_long(yb)))

    def size_in_bytes(self):
        """Size of each coordinate, in bytes."""
        return (self.size_in_bits() + 7) // 8

    def size_in_bits(self):
        """Size of each coordinate, in bits."""
        return self._curve.modulus_bits

    def double(self):
        """Double this point (in-place operation).

        Returns:
            This same object (to enable chaining).
        """

        double_func = self._curve.rawlib.double
        result = double_func(self._point.get())
        if result:
            raise ValueError("Error %d while doubling an EC point" % result)
        return self

    def __iadd__(self, point):
        """Add a second point to this one"""

        add_func = self._curve.rawlib.add
        result = add_func(self._point.get(), point._point.get())
        if result:
            if result == 16:
                raise ValueError("EC points are not on the same curve")
            raise ValueError("Error %d while adding two EC points" % result)
        return self

    def __add__(self, point):
        """Return a new point, the addition of this one and another"""

        np = self.copy()
        np += point
        return np

    def __imul__(self, scalar):
        """Multiply this point by a scalar"""

        scalar_func = self._curve.rawlib.scalar
        if scalar < 0:
            raise ValueError("Scalar multiplication is only defined for non-negative integers")
        sb = long_to_bytes(scalar)
        result = scalar_func(self._point.get(),
                             c_uint8_ptr(sb),
                             c_size_t(len(sb)),
                             c_ulonglong(getrandbits(64)))
        if result:
            raise ValueError("Error %d during scalar multiplication" % result)
        return self

    def __mul__(self, scalar):
        """Return a new point, the scalar product of this one"""

        np = self.copy()
        np *= scalar
        return np

    def __rmul__(self, left_hand):
        return self.__mul__(left_hand)


class EccXPoint(object):
    """A class to model a point on an Elliptic Curve,
    where only the X-coordinate is exposed.

    The class supports operators for:

    * Multiplying a point by a scalar: ``R = S*k``
    * In-place multiplication by a scalar: ``T *= k``

    :ivar curve: The **canonical** name of the curve as defined in the `ECC table`_.
    :vartype curve: string

    :ivar x: The affine X-coordinate of the ECC point
    :vartype x: integer
    """

    def __init__(self, x, curve):
        # Once encoded, x must not exceed the length of the modulus,
        # but its value may match or exceed the modulus itself
        # (i.e., non-canonical value)

        try:
            self._curve = _curves[curve]
        except KeyError:
            raise ValueError("Unknown curve name %s" % str(curve))
        self.curve = self._curve.canonical

        if self._curve.id not in (CurveID.CURVE25519, CurveID.CURVE448):
            raise ValueError("EccXPoint can only be created for Curve25519/Curve448")

        new_point = self._curve.rawlib.new_point
        free_func = self._curve.rawlib.free_point

        self._point = VoidPointer()
        try:
            context = self._curve.context.get()
        except AttributeError:
            context = null_pointer

        modulus_bytes = self.size_in_bytes()

        if x is None:
            xb = null_pointer
        else:
            xb = c_uint8_ptr(long_to_bytes(x, modulus_bytes))
            if len(xb) != modulus_bytes:
                raise ValueError("Incorrect coordinate length")

        self._point = VoidPointer()
        result = new_point(self._point.address_of(),
                           xb,
                           c_size_t(modulus_bytes),
                           context)

        if result == 15:
            raise ValueError("The EC point does not belong to the curve")
        if result:
            raise ValueError("Error %d while instantiating an EC point" % result)

        # Ensure that object disposal of this Python object will (eventually)
        # free the memory allocated by the raw library for the EC point
        self._point = SmartPointer(self._point.get(), free_func)

    def set(self, point):
        clone = self._curve.rawlib.clone
        free_func = self._curve.rawlib.free_point

        self._point = VoidPointer()
        result = clone(self._point.address_of(),
                       point._point.get())
        if result:
            raise ValueError("Error %d while cloning an EC point" % result)

        self._point = SmartPointer(self._point.get(), free_func)
        return self

    def __eq__(self, point):
        if not isinstance(point, EccXPoint):
            return False

        cmp_func = self._curve.rawlib.cmp
        p1 = self._point.get()
        p2 = point._point.get()
        res = cmp_func(p1, p2)
        return 0 == res

    def copy(self):
        """Return a copy of this point."""

        try:
            x = self.x
        except ValueError:
            return self.point_at_infinity()
        return EccXPoint(x, self.curve)

    def is_point_at_infinity(self):
        """``True`` if this is the *point-at-infinity*."""

        try:
            _ = self.x
        except ValueError:
            return True
        return False

    def point_at_infinity(self):
        """Return the *point-at-infinity* for the curve."""

        return EccXPoint(None, self.curve)

    @property
    def x(self):
        modulus_bytes = self.size_in_bytes()
        xb = bytearray(modulus_bytes)
        get_x = self._curve.rawlib.get_x
        result = get_x(c_uint8_ptr(xb),
                       c_size_t(modulus_bytes),
                       self._point.get())
        if result == 19:    # ERR_ECC_PAI
            raise ValueError("No X coordinate for the point at infinity")
        if result:
            raise ValueError("Error %d while getting X of an EC point" % result)
        return Integer(bytes_to_long(xb))

    def size_in_bytes(self):
        """Size of each coordinate, in bytes."""
        return (self.size_in_bits() + 7) // 8

    def size_in_bits(self):
        """Size of each coordinate, in bits."""
        return self._curve.modulus_bits

    def __imul__(self, scalar):
        """Multiply this point by a scalar"""

        scalar_func = self._curve.rawlib.scalar
        if scalar < 0:
            raise ValueError("Scalar multiplication is only defined for non-negative integers")
        sb = long_to_bytes(scalar)
        result = scalar_func(self._point.get(),
                             c_uint8_ptr(sb),
                             c_size_t(len(sb)),
                             c_ulonglong(getrandbits(64)))
        if result:
            raise ValueError("Error %d during scalar multiplication" % result)
        return self

    def __mul__(self, scalar):
        """Return a new point, the scalar product of this one"""

        np = self.copy()
        np *= scalar
        return np

    def __rmul__(self, left_hand):
        return self.__mul__(left_hand)
