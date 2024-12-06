# -*- coding: utf-8 -*-
# MinIO Python Library for Amazon S3 Compatible Cloud Storage, (C)
# 2020 MinIO, Inc.
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

"""Request/response of PutBucketVersioning and GetBucketVersioning APIs."""

from __future__ import absolute_import, annotations

from typing import List, Type, TypeVar, Union, cast
from xml.etree import ElementTree as ET

from .commonconfig import DISABLED, ENABLED
from .xml import Element, SubElement, findall, findtext

OFF = "Off"
SUSPENDED = "Suspended"

A = TypeVar("A", bound="VersioningConfig")


class VersioningConfig:
    """Versioning configuration."""

    def __init__(
            self,
            status: str | None = None,
            mfa_delete: str | None = None,
            excluded_prefixes: list[str] | None = None,
            exclude_folders: bool = False,
    ):
        if status is not None and status not in [ENABLED, SUSPENDED]:
            raise ValueError(f"status must be {ENABLED} or {SUSPENDED}")
        if mfa_delete is not None and mfa_delete not in [ENABLED, DISABLED]:
            raise ValueError(f"MFA delete must be {ENABLED} or {DISABLED}")
        self._status = status
        self._mfa_delete = mfa_delete
        self._excluded_prefixes = excluded_prefixes
        self._exclude_folders = exclude_folders

    @property
    def status(self) -> str:
        """Get status."""
        return self._status or OFF

    @property
    def mfa_delete(self) -> str | None:
        """Get MFA delete."""
        return self._mfa_delete

    @property
    def excluded_prefixes(self) -> list[str] | None:
        """Get excluded prefixes."""
        return self._excluded_prefixes

    @property
    def exclude_folders(self) -> bool:
        """Get exclude folders."""
        return self._exclude_folders

    @classmethod
    def fromxml(cls: Type[A], element: ET.Element) -> A:
        """Create new object with values from XML element."""
        status = findtext(element, "Status")
        mfa_delete = findtext(element, "MFADelete")
        excluded_prefixes = [
            prefix.text
            for prefix in findall(
                element,
                "ExcludedPrefixes/ExcludedPrefix",
            )
        ]
        exclude_folders = findtext(element, "ExcludeFolders") == "true"
        return cls(
            status,
            mfa_delete,
            cast(Union[List[str], None], excluded_prefixes),
            exclude_folders,
        )

    def toxml(self, element: ET.Element | None) -> ET.Element:
        """Convert to XML."""
        element = Element("VersioningConfiguration")
        if self._status:
            SubElement(element, "Status", self._status)
        if self._mfa_delete:
            SubElement(element, "MFADelete", self._mfa_delete)
        for prefix in self._excluded_prefixes or []:
            SubElement(
                SubElement(element, "ExcludedPrefixes"),
                "ExcludedPrefix",
                prefix,
            )
        if self._exclude_folders:
            SubElement(element, "ExcludeFolders", "true")
        return element
