# -*- coding: utf-8 -*-
# MinIO Python Library for Amazon S3 Compatible Cloud Storage, (C)
# 2015, 2016, 2017 MinIO, Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Cryptography to read and write encrypted MinIO Admin payload"""

from __future__ import absolute_import, annotations

import os

from argon2.low_level import Type, hash_secret_raw
from Crypto.Cipher import AES, ChaCha20_Poly1305
from Crypto.Cipher._mode_gcm import GcmMode
from Crypto.Cipher.ChaCha20_Poly1305 import ChaCha20Poly1305Cipher

try:
    from urllib3.response import BaseHTTPResponse  # type: ignore[attr-defined]
except ImportError:
    from urllib3.response import HTTPResponse as BaseHTTPResponse

#
# Encrypted Message Format:
#
# |    41 bytes HEADER      |
# |-------------------------|
# | 16 KiB encrypted chunk  |
# |     + 16 bytes TAG      |
# |-------------------------|
# |          ....           |
# |-------------------------|
# | ~16 KiB encrypted chunk |
# |     + 16 bytes TAG      |
# |-------------------------|
#
# HEADER:
#
# | 32 bytes salt  |
# |----------------|
# | 1 byte AEAD ID |
# |----------------|
# | 8 bytes NONCE  |
# |----------------|
#


_TAG_LEN = 16
_CHUNK_SIZE = 16 * 1024
_MAX_CHUNK_SIZE = _TAG_LEN + _CHUNK_SIZE
_SALT_LEN = 32
_NONCE_LEN = 8


def _get_cipher(
        aead_id: int,
        key: bytes,
        nonce: bytes,
) -> GcmMode | ChaCha20Poly1305Cipher:
    """Get cipher for AEAD ID."""
    if aead_id == 0:
        return AES.new(key, AES.MODE_GCM, nonce)
    if aead_id == 1:
        return ChaCha20_Poly1305.new(key=key, nonce=nonce)
    raise ValueError(f"Unknown AEAD ID {aead_id}")


def _generate_key(secret: bytes, salt: bytes) -> bytes:
    """Generate 256-bit Argon2ID key"""
    return hash_secret_raw(
        secret=secret,
        salt=salt,
        time_cost=1,
        memory_cost=65536,
        parallelism=4,
        hash_len=32,
        type=Type.ID,
        version=19,
    )


def _generate_additional_data(
    aead_id: int, key: bytes, padded_nonce: bytes
) -> bytes:
    """Generate additional data"""
    cipher = _get_cipher(aead_id, key, padded_nonce)
    return b"\x00" + cipher.digest()


def _mark_as_last(additional_data: bytes) -> bytes:
    """Mark additional data as the last in the sequence"""
    return b'\x80' + additional_data[1:]


def _update_nonce_id(nonce: bytes, idx: int) -> bytes:
    """Set nonce id (4 last bytes)"""
    return nonce + idx.to_bytes(4, byteorder="little")


def encrypt(payload: bytes, password: str) -> bytes:
    """Encrypt given payload."""
    nonce = os.urandom(_NONCE_LEN)
    salt = os.urandom(_SALT_LEN)
    key = _generate_key(password.encode(), salt)
    aead_id = b"\x00"
    padded_nonce = nonce + b"\x00\x00\x00\x00"
    additional_data = _generate_additional_data(aead_id[0], key, padded_nonce)

    indices = range(0, len(payload), _CHUNK_SIZE)
    nonce_id = 0
    result = salt + aead_id + nonce
    for i in indices:
        nonce_id += 1
        if i == indices[-1]:
            additional_data = _mark_as_last(additional_data)
        padded_nonce = _update_nonce_id(nonce, nonce_id)
        cipher = _get_cipher(aead_id[0], key, padded_nonce)
        cipher.update(additional_data)
        encrypted_data, hmac_tag = cipher.encrypt_and_digest(
            payload[i:i+_CHUNK_SIZE],
        )

        result += encrypted_data
        result += hmac_tag

    return result


class DecryptReader:
    """
    BufferedIOBase compatible reader represents decrypted data of MinioAdmin
    APIs.
    """

    def __init__(self, response: BaseHTTPResponse, secret: bytes):
        self._response = response
        self._secret = secret
        self._payload = None

        header = self._response.read(41)
        if len(header) != 41:
            raise IOError("insufficient data")
        self._salt = header[:32]
        self._aead_id = header[32]
        self._nonce = header[33:]
        self._key = _generate_key(self._secret, self._salt)
        padded_nonce = self._nonce + b"\x00\x00\x00\x00"
        self._additional_data = _generate_additional_data(
            self._aead_id, self._key, padded_nonce
        )
        self._chunk = b""
        self._count = 0
        self._is_closed = False

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, exc_traceback):
        return self.close()

    def readable(self):  # pylint: disable=no-self-use
        """Return this is readable."""
        return True

    def writeable(self):  # pylint: disable=no-self-use
        """Return this is not writeable."""
        return False

    def close(self):
        """Close response and release network resources."""
        self._response.close()
        self._response.release_conn()

    def _decrypt(self, payload: bytes, last_chunk: bool = False) -> bytes:
        """Decrypt given payload."""
        self._count += 1
        if last_chunk:
            self._additional_data = _mark_as_last(self._additional_data)

        padded_nonce = _update_nonce_id(self._nonce, self._count)
        cipher = _get_cipher(self._aead_id, self._key, padded_nonce)
        cipher.update(self._additional_data)

        hmac_tag = payload[-_TAG_LEN:]
        encrypted_data = payload[:-_TAG_LEN]
        decrypted_data = cipher.decrypt_and_verify(encrypted_data, hmac_tag)
        return decrypted_data

    def _read_chunk(self) -> bool:
        """Read a chunk at least one byte more than chunk size."""
        if self._is_closed:
            return True

        while len(self._chunk) != (1 + _MAX_CHUNK_SIZE):
            chunk = self._response.read(1 + _MAX_CHUNK_SIZE - len(self._chunk))
            self._chunk += chunk
            if len(chunk) == 0:
                self._is_closed = True
                return True

        return False

    def _read(self) -> bytes:
        """Read and decrypt response."""
        stop = self._read_chunk()

        if len(self._chunk) == 0:
            return self._chunk

        length = _MAX_CHUNK_SIZE
        if len(self._chunk) < length:
            length = len(self._chunk)
            stop = True
        payload = self._chunk[:length]
        self._chunk = self._chunk[length:]
        return self._decrypt(payload, stop)

    def stream(self, num_bytes=32*1024):
        """
        Stream extracted payload from response data. Upon completion, caller
        should call self.close() to release network resources.
        """
        while True:
            data = self._read()
            if not data:
                break
            while data:
                result = data
                if num_bytes < len(data):
                    result = data[:num_bytes]
                data = data[len(result):]
                yield result


def decrypt(response: BaseHTTPResponse, secret_key: str) -> bytes:
    """Decrypt response data."""
    result = b""
    with DecryptReader(response, secret_key.encode()) as reader:
        for data in reader.stream():
            result += data
    return result
