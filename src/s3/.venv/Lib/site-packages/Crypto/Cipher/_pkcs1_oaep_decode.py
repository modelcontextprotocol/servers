from Crypto.Util._raw_api import (load_pycryptodome_raw_lib, c_size_t,
                                  c_uint8_ptr)


_raw_pkcs1_decode = load_pycryptodome_raw_lib("Crypto.Cipher._pkcs1_decode",
                        """
                        int pkcs1_decode(const uint8_t *em, size_t len_em,
                                         const uint8_t *sentinel, size_t len_sentinel,
                                         size_t expected_pt_len,
                                         uint8_t *output);

                        int oaep_decode(const uint8_t *em,
                                        size_t em_len,
                                        const uint8_t *lHash,
                                        size_t hLen,
                                        const uint8_t *db,
                                        size_t db_len);
                        """)


def pkcs1_decode(em, sentinel, expected_pt_len, output):
    if len(em) != len(output):
        raise ValueError("Incorrect output length")

    ret = _raw_pkcs1_decode.pkcs1_decode(c_uint8_ptr(em),
                                         c_size_t(len(em)),
                                         c_uint8_ptr(sentinel),
                                         c_size_t(len(sentinel)),
                                         c_size_t(expected_pt_len),
                                         c_uint8_ptr(output))
    return ret


def oaep_decode(em, lHash, db):
    ret = _raw_pkcs1_decode.oaep_decode(c_uint8_ptr(em),
                                        c_size_t(len(em)),
                                        c_uint8_ptr(lHash),
                                        c_size_t(len(lHash)),
                                        c_uint8_ptr(db),
                                        c_size_t(len(db)))
    return ret
