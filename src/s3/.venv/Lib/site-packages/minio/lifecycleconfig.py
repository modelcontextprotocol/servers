# -*- coding: utf-8 -*-
# MinIO Python Library for Amazon S3 Compatible Cloud Storage, (C)
# 2015, 2016, 2017, 2018, 2019 MinIO, Inc.
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
Request/response of PutBucketLifecycleConfiguration and
GetBucketLifecycleConfiguration APIs.
"""
# pylint: disable=invalid-name

from __future__ import absolute_import, annotations

from abc import ABCMeta
from datetime import datetime
from typing import Type, TypeVar, cast
from xml.etree import ElementTree as ET

from .commonconfig import BaseRule, Filter, check_status
from .time import from_iso8601utc, to_iso8601utc
from .xml import Element, SubElement, find, findall, findtext


class DateDays:
    """Base class holds date and days of Transition and Expiration."""
    __metaclass__ = ABCMeta

    def __init__(self, date: datetime | None = None, days: int | None = None):
        self._date = date
        self._days = days

    @property
    def date(self) -> datetime | None:
        """Get date."""
        return self._date

    @property
    def days(self) -> int | None:
        """Get days."""
        return self._days

    @staticmethod
    def parsexml(element: ET.Element) -> tuple[datetime | None, int | None]:
        """Parse XML to date and days."""
        date = from_iso8601utc(findtext(element, "Date"))
        days = findtext(element, "Days")
        return date, int(days) if days else None

    def toxml(self, element: ET.Element | None) -> ET.Element:
        """Convert to XML."""
        if element is None:
            raise ValueError("element must be provided")
        if self._date is not None:
            SubElement(
                element, "Date", to_iso8601utc(self._date),
            )
        if self._days:
            SubElement(element, "Days", str(self._days))
        return element


A = TypeVar("A", bound="Transition")


class Transition(DateDays):
    """Transition."""

    def __init__(
            self,
            date: datetime | None = None,
            days: int | None = None,
            storage_class: str | None = None,
    ):
        super().__init__(date, days)
        self._storage_class = storage_class

    @property
    def storage_class(self) -> str | None:
        """Get storage class."""
        return self._storage_class

    @classmethod
    def fromxml(cls: Type[A], element: ET.Element) -> A:
        """Create new object with values from XML element."""
        element = cast(ET.Element, find(element, "Transition", True))
        date, days = cls.parsexml(element)
        return cls(date, days, findtext(element, "StorageClass"))

    def toxml(self, element: ET.Element | None) -> ET.Element:
        """Convert to XML."""
        if element is None:
            raise ValueError("element must be provided")
        element = SubElement(element, "Transition")
        super().toxml(element)
        if self._storage_class:
            SubElement(element, "StorageClass", self._storage_class)
        return element


B = TypeVar("B", bound="NoncurrentVersionTransition")


class NoncurrentVersionTransition:
    """Noncurrent version transition."""

    def __init__(
            self,
            noncurrent_days: int | None = None,
            storage_class: str | None = None,
    ):
        self._noncurrent_days = noncurrent_days
        self._storage_class = storage_class

    @property
    def noncurrent_days(self) -> int | None:
        """Get Noncurrent days."""
        return self._noncurrent_days

    @property
    def storage_class(self) -> str | None:
        """Get storage class."""
        return self._storage_class

    @classmethod
    def fromxml(cls: Type[B], element: ET.Element) -> B:
        """Create new object with values from XML element."""
        element = cast(
            ET.Element,
            find(element, "NoncurrentVersionTransition", True),
        )
        noncurrent_days = findtext(element, "NoncurrentDays")
        return cls(
            int(noncurrent_days) if noncurrent_days else None,
            findtext(element, "StorageClass"),
        )

    def toxml(self, element: ET.Element | None) -> ET.Element:
        """Convert to XML."""
        if element is None:
            raise ValueError("element must be provided")
        element = SubElement(element, "NoncurrentVersionTransition")
        if self._noncurrent_days:
            SubElement(element, "NoncurrentDays", str(self._noncurrent_days))
        if self._storage_class:
            SubElement(element, "StorageClass", self._storage_class)
        return element


C = TypeVar("C", bound="NoncurrentVersionExpiration")


class NoncurrentVersionExpiration:
    """Noncurrent version expiration."""

    def __init__(self, noncurrent_days: int | None = None):
        self._noncurrent_days = noncurrent_days

    @property
    def noncurrent_days(self) -> int | None:
        """Get Noncurrent days."""
        return self._noncurrent_days

    @classmethod
    def fromxml(cls: Type[C], element: ET.Element) -> C:
        """Create new object with values from XML element."""
        element = cast(
            ET.Element,
            find(element, "NoncurrentVersionExpiration", True),
        )
        noncurrent_days = findtext(element, "NoncurrentDays")
        return cls(int(noncurrent_days) if noncurrent_days else None)

    def toxml(self, element: ET.Element | None) -> ET.Element:
        """Convert to XML."""
        if element is None:
            raise ValueError("element must be provided")
        element = SubElement(element, "NoncurrentVersionExpiration")
        if self._noncurrent_days:
            SubElement(element, "NoncurrentDays", str(self._noncurrent_days))
        return element


D = TypeVar("D", bound="Expiration")


class Expiration(DateDays):
    """Expiration."""

    def __init__(
            self,
            date: datetime | None = None,
            days: int | None = None,
            expired_object_delete_marker: bool | None = None,
    ):
        super().__init__(date, days)
        self._expired_object_delete_marker = expired_object_delete_marker

    @property
    def expired_object_delete_marker(self) -> bool | None:
        """Get expired object delete marker."""
        return self._expired_object_delete_marker

    @classmethod
    def fromxml(cls: Type[D], element: ET.Element) -> D:
        """Create new object with values from XML element."""
        element = cast(ET.Element, find(element, "Expiration", True))
        date, days = cls.parsexml(element)
        expired_object_delete_marker = findtext(
            element, "ExpiredObjectDeleteMarker",
        )
        if expired_object_delete_marker is None:
            return cls(date, days, None)

        if expired_object_delete_marker.title() not in ["False", "True"]:
            raise ValueError(
                "value of ExpiredObjectDeleteMarker must be "
                "'True' or 'False'",
            )
        return cls(date, days, expired_object_delete_marker.title() == "True")

    def toxml(self, element: ET.Element | None) -> ET.Element:
        """Convert to XML."""
        if element is None:
            raise ValueError("element must be provided")
        element = SubElement(element, "Expiration")
        super().toxml(element)
        if self._expired_object_delete_marker is not None:
            SubElement(
                element,
                "ExpiredObjectDeleteMarker",
                str(self._expired_object_delete_marker).lower(),
            )
        return element


E = TypeVar("E", bound="AbortIncompleteMultipartUpload")


class AbortIncompleteMultipartUpload:
    """Abort incomplete multipart upload."""

    def __init__(self, days_after_initiation: int | None = None):
        self._days_after_initiation = days_after_initiation

    @property
    def days_after_initiation(self) -> int | None:
        """Get days after initiation."""
        return self._days_after_initiation

    @classmethod
    def fromxml(cls: Type[E], element: ET.Element) -> E:
        """Create new object with values from XML element."""
        element = cast(
            ET.Element,
            find(element, "AbortIncompleteMultipartUpload", True),
        )
        days_after_initiation = findtext(element, "DaysAfterInitiation")
        return cls(
            int(days_after_initiation) if days_after_initiation else None,
        )

    def toxml(self, element: ET.Element | None) -> ET.Element:
        """Convert to XML."""
        if element is None:
            raise ValueError("element must be provided")
        element = SubElement(element, "AbortIncompleteMultipartUpload")
        if self._days_after_initiation:
            SubElement(
                element,
                "DaysAfterInitiation",
                str(self._days_after_initiation),
            )
        return element


F = TypeVar("F", bound="Rule")


class Rule(BaseRule):
    """Lifecycle rule. """

    def __init__(
            self,
            status: str,
            abort_incomplete_multipart_upload:
                AbortIncompleteMultipartUpload | None = None,
            expiration: Expiration | None = None,
            rule_filter: Filter | None = None,
            rule_id: str | None = None,
            noncurrent_version_expiration:
                NoncurrentVersionExpiration | None = None,
            noncurrent_version_transition:
                NoncurrentVersionTransition | None = None,
            transition: Transition | None = None,
    ):
        check_status(status)
        if (not abort_incomplete_multipart_upload and not expiration
            and not noncurrent_version_expiration
            and not noncurrent_version_transition
                and not transition):
            raise ValueError(
                "at least one of action (AbortIncompleteMultipartUpload, "
                "Expiration, NoncurrentVersionExpiration, "
                "NoncurrentVersionTransition or Transition) must be specified "
                "in a rule")
        if not rule_filter:
            raise ValueError("Rule filter must be provided")

        super().__init__(rule_filter, rule_id)

        self._status = status
        self._abort_incomplete_multipart_upload = (
            abort_incomplete_multipart_upload
        )
        self._expiration = expiration
        self._noncurrent_version_expiration = noncurrent_version_expiration
        self._noncurrent_version_transition = noncurrent_version_transition
        self._transition = transition

    @property
    def status(self) -> str | None:
        """Get status."""
        return self._status

    @property
    def abort_incomplete_multipart_upload(
            self,
    ) -> AbortIncompleteMultipartUpload | None:
        """Get abort incomplete multipart upload."""
        return self._abort_incomplete_multipart_upload

    @property
    def expiration(self) -> Expiration | None:
        """Get expiration."""
        return self._expiration

    @property
    def noncurrent_version_expiration(
            self,
    ) -> NoncurrentVersionExpiration | None:
        """Get noncurrent version expiration."""
        return self._noncurrent_version_expiration

    @property
    def noncurrent_version_transition(
            self,
    ) -> NoncurrentVersionTransition | None:
        """Get noncurrent version transition."""
        return self._noncurrent_version_transition

    @property
    def transition(self) -> Transition | None:
        """Get transition."""
        return self._transition

    @classmethod
    def fromxml(cls: Type[F], element: ET.Element) -> F:
        """Create new object with values from XML element."""
        status = cast(str, findtext(element, "Status", True))
        abort_incomplete_multipart_upload = (
            None if find(element, "AbortIncompleteMultipartUpload") is None
            else AbortIncompleteMultipartUpload.fromxml(element)
        )
        expiration = (
            None if find(element, "Expiration") is None
            else Expiration.fromxml(element)
        )
        rule_filter, rule_id = cls.parsexml(element)
        noncurrent_version_expiration = (
            None if find(element, "NoncurrentVersionExpiration") is None
            else NoncurrentVersionExpiration.fromxml(element)
        )
        noncurrent_version_transition = (
            None if find(element, "NoncurrentVersionTransition") is None
            else NoncurrentVersionTransition.fromxml(element)
        )
        transition = (
            None if find(element, "Transition") is None
            else Transition.fromxml(element)
        )

        return cls(
            status,
            abort_incomplete_multipart_upload=(
                abort_incomplete_multipart_upload
            ),
            expiration=expiration,
            rule_filter=rule_filter,
            rule_id=rule_id,
            noncurrent_version_expiration=noncurrent_version_expiration,
            noncurrent_version_transition=noncurrent_version_transition,
            transition=transition,
        )

    def toxml(self, element: ET.Element | None) -> ET.Element:
        """Convert to XML."""
        if element is None:
            raise ValueError("element must be provided")
        element = SubElement(element, "Rule")
        SubElement(element, "Status", self._status)
        if self._abort_incomplete_multipart_upload:
            self._abort_incomplete_multipart_upload.toxml(element)
        if self._expiration:
            self._expiration.toxml(element)
        super().toxml(element)
        if self._noncurrent_version_expiration:
            self._noncurrent_version_expiration.toxml(element)
        if self._noncurrent_version_transition:
            self._noncurrent_version_transition.toxml(element)
        if self._transition:
            self._transition.toxml(element)
        return element


G = TypeVar("G", bound="LifecycleConfig")


class LifecycleConfig:
    """Lifecycle configuration."""

    def __init__(self, rules: list[Rule]):
        if not rules:
            raise ValueError("rules must be provided")
        self._rules = rules

    @property
    def rules(self) -> list[Rule]:
        """Get rules."""
        return self._rules

    @classmethod
    def fromxml(cls: Type[G], element: ET.Element) -> G:
        """Create new object with values from XML element."""
        elements = findall(element, "Rule")
        rules = []
        for tag in elements:
            rules.append(Rule.fromxml(tag))
        return cls(rules)

    def toxml(self, element: ET.Element | None) -> ET.Element:
        """Convert to XML."""
        element = Element("LifecycleConfiguration")
        for rule in self._rules:
            rule.toxml(element)
        return element
