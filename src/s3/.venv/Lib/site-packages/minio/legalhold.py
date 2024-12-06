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

"""Request/response of PutObjectLegalHold and GetObjectLegalHold S3 APIs."""

from __future__ import absolute_import, annotations

from typing import Type, TypeVar
from xml.etree import ElementTree as ET

from .xml import Element, SubElement, findtext

A = TypeVar("A", bound="LegalHold")


class LegalHold:
    """Legal hold configuration."""

    def __init__(self, status: bool = False):
        self._status = status

    @property
    def status(self) -> bool:
        """Get status."""
        return self._status

    @classmethod
    def fromxml(cls: Type[A], element: ET.Element) -> A:
        """Create new object with values from XML element."""
        status = findtext(element, "Status")
        return cls(status == "ON")

    def toxml(self, element: ET.Element | None) -> ET.Element:
        """Convert to XML."""
        element = Element("LegalHold")
        SubElement(element, "Status", "ON" if self._status is True else "OFF")
        return element
