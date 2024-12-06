# -*- coding: utf-8 -*-
#
# ===================================================================
# The contents of this file are dedicated to the public domain.  To
# the extent that dedication to the public domain is not available,
# everyone is granted a worldwide, perpetual, royalty-free,
# non-exclusive license to exercise all rights associated with the
# contents of this file for any purpose whatsoever.
# No rights are reserved.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
# EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
# MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
# NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS
# BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
# ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
# CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
# ===================================================================

__all__ = ['HMAC', 'MD2', 'MD4', 'MD5', 'RIPEMD160', 'SHA1',
           'SHA224', 'SHA256', 'SHA384', 'SHA512',
           'SHA3_224', 'SHA3_256', 'SHA3_384', 'SHA3_512',
           'CMAC', 'Poly1305',
           'cSHAKE128', 'cSHAKE256', 'KMAC128', 'KMAC256',
           'TupleHash128', 'TupleHash256', 'KangarooTwelve',
           'TurboSHAKE128', 'TurboSHAKE256']

def new(name):
    """Return a new hash instance, based on its name or
    on its ASN.1 Object ID"""

    name = name.upper()
    if name in ("1.3.14.3.2.26", "SHA1", "SHA-1"):
        from . import SHA1
        return SHA1.new()
    if name in ("2.16.840.1.101.3.4.2.4", "SHA224", "SHA-224"):
        from . import SHA224
        return SHA224.new()
    if name in ("2.16.840.1.101.3.4.2.1", "SHA256", "SHA-256"):
        from . import SHA256
        return SHA256.new()
    if name in ("2.16.840.1.101.3.4.2.2", "SHA384", "SHA-384"):
        from . import SHA384
        return SHA384.new()
    if name in ("2.16.840.1.101.3.4.2.3", "SHA512", "SHA-512"):
        from . import SHA512
        return SHA512.new()
    if name in ("2.16.840.1.101.3.4.2.5", "SHA512-224", "SHA-512-224"):
        from . import SHA512
        return SHA512.new(truncate='224')
    if name in ("2.16.840.1.101.3.4.2.6", "SHA512-256", "SHA-512-256"):
        from . import SHA512
        return SHA512.new(truncate='256')
    if name in ("2.16.840.1.101.3.4.2.7", "SHA3-224", "SHA-3-224"):
        from . import SHA3_224
        return SHA3_224.new()
    if name in ("2.16.840.1.101.3.4.2.8", "SHA3-256", "SHA-3-256"):
        from . import SHA3_256
        return SHA3_256.new()
    if name in ("2.16.840.1.101.3.4.2.9", "SHA3-384", "SHA-3-384"):
        from . import SHA3_384
        return SHA3_384.new()
    if name in ("2.16.840.1.101.3.4.2.10", "SHA3-512", "SHA-3-512"):
        from . import SHA3_512
        return SHA3_512.new()
    else:
        raise ValueError("Unknown hash %s" % str(name))

