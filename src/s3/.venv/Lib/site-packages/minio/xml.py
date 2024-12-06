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

"""XML utility module."""

from __future__ import absolute_import, annotations

import io
from typing import Type, TypeVar
from xml.etree import ElementTree as ET

from typing_extensions import Protocol

_S3_NAMESPACE = "http://s3.amazonaws.com/doc/2006-03-01/"


def Element(  # pylint: disable=invalid-name
    tag: str,
    namespace: str = _S3_NAMESPACE,
) -> ET.Element:
    """Create ElementTree.Element with tag and namespace."""
    return ET.Element(tag, {"xmlns": namespace} if namespace else {})


def SubElement(  # pylint: disable=invalid-name
    parent: ET.Element, tag: str, text: str | None = None
) -> ET.Element:
    """Create ElementTree.SubElement on parent with tag and text."""
    element = ET.SubElement(parent, tag)
    if text is not None:
        element.text = text
    return element


def _get_namespace(element: ET.Element) -> str:
    """Exact namespace if found."""
    start = element.tag.find("{")
    if start < 0:
        return ""
    start += 1
    end = element.tag.find("}")
    if end < 0:
        return ""
    return element.tag[start:end]


def findall(element: ET.Element, name: str) -> list[ET.Element]:
    """Namespace aware ElementTree.Element.findall()."""
    namespace = _get_namespace(element)
    return element.findall(
        "ns:" + name if namespace else name,
        {"ns": namespace} if namespace else {},
    )


def find(
        element: ET.Element,
        name: str,
        strict: bool = False,
) -> ET.Element | None:
    """Namespace aware ElementTree.Element.find()."""
    namespace = _get_namespace(element)
    elem = element.find(
        "ns:" + name if namespace else name,
        {"ns": namespace} if namespace else {},
    )
    if strict and elem is None:
        raise ValueError(f"XML element <{name}> not found")
    return elem


def findtext(
    element: ET.Element,
    name: str,
    strict: bool = False,
) -> str | None:
    """
    Namespace aware ElementTree.Element.findtext() with strict flag
    raises ValueError if element name not exist.
    """
    elem = find(element, name, strict=strict)
    return None if elem is None else (elem.text or "")


A = TypeVar("A")


class FromXmlType(Protocol):
    """typing stub for class with `fromxml` method"""

    @classmethod
    def fromxml(cls: Type[A], element: ET.Element) -> A:
        """Create python object with values from XML element."""


B = TypeVar("B", bound=FromXmlType)


def unmarshal(cls: Type[B], xmlstring: str) -> B:
    """Unmarshal given XML string to an object of passed class."""
    return cls.fromxml(ET.fromstring(xmlstring))


def getbytes(element: ET.Element) -> bytes:
    """Convert ElementTree.Element to bytes."""
    with io.BytesIO() as data:
        ET.ElementTree(element).write(
            data,
            encoding=None,
            xml_declaration=False,
        )
        return data.getvalue()


class ToXmlType(Protocol):
    """typing stub for class with `toxml` method"""

    def toxml(self, element: ET.Element | None) -> ET.Element:
        """Convert python object to ElementTree.Element."""


def marshal(obj: ToXmlType) -> bytes:
    """Get XML data as bytes of ElementTree.Element."""
    return getbytes(obj.toxml(None))
