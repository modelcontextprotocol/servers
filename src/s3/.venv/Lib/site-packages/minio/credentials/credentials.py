# -*- coding: utf-8 -*-
# MinIO Python Library for Amazon S3 Compatible Cloud Storage,
# (C) 2020 MinIO, Inc.
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

"""Credential definitions to access S3 service."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone


class Credentials:
    """
    Represents credentials access key, secret key and session token.
    """

    _access_key: str
    _secret_key: str
    _session_token: str | None
    _expiration: datetime | None

    def __init__(
        self,
        access_key: str,
        secret_key: str,
        session_token: str | None = None,
        expiration: datetime | None = None,
    ):
        if not access_key:
            raise ValueError("Access key must not be empty")

        if not secret_key:
            raise ValueError("Secret key must not be empty")

        self._access_key = access_key
        self._secret_key = secret_key
        self._session_token = session_token
        if expiration and expiration.tzinfo:
            expiration = (
                expiration.astimezone(timezone.utc).replace(tzinfo=None)
            )
        self._expiration = expiration

    @property
    def access_key(self) -> str:
        """Get access key."""
        return self._access_key

    @property
    def secret_key(self) -> str:
        """Get secret key."""
        return self._secret_key

    @property
    def session_token(self) -> str | None:
        """Get session token."""
        return self._session_token

    def is_expired(self) -> bool:
        """Check whether this credentials expired or not."""
        return (
            self._expiration < (datetime.utcnow() + timedelta(seconds=10))
            if self._expiration else False
        )
