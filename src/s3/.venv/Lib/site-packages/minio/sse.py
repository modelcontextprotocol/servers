# -*- coding: utf-8 -*-
# MinIO Python Library for Amazon S3 Compatible Cloud Storage,
# (C) 2018 MinIO, Inc.
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

"""
minio.sse
~~~~~~~~~~~~~~~~~~~

This module contains core API parsers.

:copyright: (c) 2018 by MinIO, Inc.
:license: Apache 2.0, see LICENSE for more details.

"""
from __future__ import absolute_import, annotations

import base64
import json
from abc import ABCMeta, abstractmethod
from typing import Any, cast


class Sse:
    """Server-side encryption base class."""
    __metaclass__ = ABCMeta

    @abstractmethod
    def headers(self) -> dict[str, str]:
        """Return headers."""

    def tls_required(self) -> bool:  # pylint: disable=no-self-use
        """Return TLS required to use this server-side encryption."""
        return True

    def copy_headers(self) -> dict[str, str]:  # pylint: disable=no-self-use
        """Return copy headers."""
        return {}


class SseCustomerKey(Sse):
    """ Server-side encryption - customer key type."""

    def __init__(self, key: bytes):
        if len(key) != 32:
            raise ValueError(
                "SSE-C keys need to be 256 bit base64 encoded",
            )
        b64key = base64.b64encode(key).decode()
        from .helpers import \
            md5sum_hash  # pylint: disable=import-outside-toplevel
        md5key = cast(str, md5sum_hash(key))
        self._headers: dict[str, str] = {
            "X-Amz-Server-Side-Encryption-Customer-Algorithm": "AES256",
            "X-Amz-Server-Side-Encryption-Customer-Key": b64key,
            "X-Amz-Server-Side-Encryption-Customer-Key-MD5": md5key,
        }
        self._copy_headers: dict[str, str] = {
            "X-Amz-Copy-Source-Server-Side-Encryption-Customer-Algorithm":
            "AES256",
            "X-Amz-Copy-Source-Server-Side-Encryption-Customer-Key": b64key,
            "X-Amz-Copy-Source-Server-Side-Encryption-Customer-Key-MD5":
            md5key,
        }

    def headers(self) -> dict[str, str]:
        return self._headers.copy()

    def copy_headers(self) -> dict[str, str]:
        return self._copy_headers.copy()


class SseKMS(Sse):
    """Server-side encryption - KMS type."""

    def __init__(self, key: str, context: dict[str, Any]):
        self._headers = {
            "X-Amz-Server-Side-Encryption-Aws-Kms-Key-Id": key,
            "X-Amz-Server-Side-Encryption": "aws:kms"
        }
        if context:
            data = bytes(json.dumps(context), "utf-8")
            self._headers["X-Amz-Server-Side-Encryption-Context"] = (
                base64.b64encode(data).decode()
            )

    def headers(self) -> dict[str, str]:
        return self._headers.copy()


class SseS3(Sse):
    """Server-side encryption - S3 type."""

    def headers(self) -> dict[str, str]:
        return {
            "X-Amz-Server-Side-Encryption": "AES256"
        }

    def tls_required(self) -> bool:
        return False
