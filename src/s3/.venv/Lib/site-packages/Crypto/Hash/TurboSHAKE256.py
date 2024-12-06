from .TurboSHAKE128 import TurboSHAKE

def new(**kwargs):
    """Create a new TurboSHAKE256 object.

    Args:
       domain (integer):
         Optional - A domain separation byte, between 0x01 and 0x7F.
         The default value is 0x1F.
       data (bytes/bytearray/memoryview):
        Optional - The very first chunk of the message to hash.
        It is equivalent to an early call to :meth:`update`.

    :Return: A :class:`TurboSHAKE` object
    """

    domain_separation = kwargs.get('domain', 0x1F)
    if not (0x01 <= domain_separation <= 0x7F):
        raise ValueError("Incorrect domain separation value (%d)" %
                         domain_separation)
    data = kwargs.get('data')
    return TurboSHAKE(64, domain_separation, data=data)
