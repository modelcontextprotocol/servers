# This file is licensed under the BSD 2-Clause License.
# See https://opensource.org/licenses/BSD-2-Clause for details.

# This is the element of a database of curve parameters. Items are indexed by their
# human-friendly name, such as "P-256". The element has the following fields:
#
# - p               the prime number that defines the finite field for all modulo operations
# - b               the constant in the Short Weierstrass curve equation (can be None)
# - order           the number of elements in the group with the generator below
# - Gx              the affine coordinate X of the generator point
# - Gy              the affine coordinate Y of the generator point
# - G               the generator, as an EccPoint object
# - modulus_bits    the minimum number of bits for encoding the modulus p
# - oid             an ASCII string with the registered ASN.1 Object ID
# - context         a raw pointer to memory holding a context for all curve operations (can be None)
# - canonical       the canonical name of the curve
# - openssh         the ASCII string used in OpenSSH id files for public keys on this curve
# - rawlib          the reference to the dynamic libary with the low-level functions
# - validate        a function that raises an exception if the the input point is invalid

class _Curve(object):

    def __init__(self, p, b, order, Gx, Gy, G, modulus_bits, oid, context,
                 canonical, openssh, rawlib, validate=None):
        self.p = p
        self.b = b
        self.order = order
        self.Gx = Gx
        self.Gy = Gy
        self.G = G
        self.modulus_bits = modulus_bits
        self.oid = oid
        self.context = context
        self.canonical = canonical
        self.openssh = openssh
        self.rawlib = rawlib
        self.validate = validate
