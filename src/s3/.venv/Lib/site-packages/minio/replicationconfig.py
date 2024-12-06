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

"""Request/response of PutBucketReplication and GetBucketReplication APIs."""

from __future__ import absolute_import, annotations

from abc import ABCMeta
from typing import Type, TypeVar, cast
from xml.etree import ElementTree as ET

from .commonconfig import DISABLED, BaseRule, Filter, check_status
from .xml import Element, SubElement, find, findall, findtext

A = TypeVar("A", bound="Status")


class Status:
    """Status."""
    __metaclass__ = ABCMeta

    def __init__(self, status: str):
        check_status(status)
        self._status = status

    @property
    def status(self) -> str:
        """Get status."""
        return self._status

    @classmethod
    def fromxml(cls: Type[A], element: ET.Element) -> A:
        """Create new object with values from XML element."""
        element = cast(ET.Element, find(element, cls.__name__, True))
        status = cast(str, findtext(element, "Status", True))
        return cls(status)

    def toxml(self, element: ET.Element | None) -> ET.Element:
        """Convert to XML."""
        if element is None:
            raise ValueError("element must be provided")
        element = SubElement(element, self.__class__.__name__)
        SubElement(element, "Status", self._status)
        return element


class SseKmsEncryptedObjects(Status):
    """SSE KMS encrypted objects."""


B = TypeVar("B", bound="SourceSelectionCriteria")


class SourceSelectionCriteria:
    """Source selection criteria."""

    def __init__(
            self,
            sse_kms_encrypted_objects: SseKmsEncryptedObjects | None = None,
    ):
        self._sse_kms_encrypted_objects = sse_kms_encrypted_objects

    @property
    def sse_kms_encrypted_objects(self) -> SseKmsEncryptedObjects | None:
        """Get SSE KMS encrypted objects."""
        return self._sse_kms_encrypted_objects

    @classmethod
    def fromxml(cls: Type[B], element: ET.Element) -> B:
        """Create new object with values from XML element."""
        element = cast(
            ET.Element,
            find(element, "SourceSelectionCriteria", True),
        )
        return cls(
            None if find(element, "SseKmsEncryptedObjects") is None
            else SseKmsEncryptedObjects.fromxml(element)
        )

    def toxml(self, element: ET.Element | None) -> ET.Element:
        """Convert to XML."""
        if element is None:
            raise ValueError("element must be provided")
        element = SubElement(element, "SourceSelectionCriteria")
        if self._sse_kms_encrypted_objects:
            self._sse_kms_encrypted_objects.toxml(element)
        return element


class ExistingObjectReplication(Status):
    """Existing object replication."""


class DeleteMarkerReplication(Status):
    """Delete marker replication."""

    def __init__(self, status=DISABLED):
        super().__init__(status)


C = TypeVar("C", bound="ReplicationTimeValue")


class ReplicationTimeValue:
    """Replication time value."""
    __metaclass__ = ABCMeta

    def __init__(self, minutes: None | int = 15):
        self._minutes = minutes

    @property
    def minutes(self) -> int | None:
        """Get minutes."""
        return self._minutes

    @classmethod
    def fromxml(cls: Type[C], element: ET.Element) -> C:
        """Create new object with values from XML element."""
        element = cast(ET.Element, find(element, cls.__name__, True))
        minutes = findtext(element, "Minutes")
        return cls(int(minutes) if minutes else None)

    def toxml(self, element: ET.Element | None) -> ET.Element:
        """Convert to XML."""
        if element is None:
            raise ValueError("element must be provided")
        element = SubElement(element, self.__class__.__name__)
        if self._minutes is not None:
            SubElement(element, "Minutes", str(self._minutes))
        return element


class Time(ReplicationTimeValue):
    """Time."""


D = TypeVar("D", bound="ReplicationTime")


class ReplicationTime:
    """Replication time."""

    def __init__(self, time: Time, status: str):
        if not time:
            raise ValueError("time must be provided")
        check_status(status)
        self._time = time
        self._status = status

    @property
    def time(self) -> Time:
        """Get time value."""
        return self._time

    @property
    def status(self) -> str:
        """Get status."""
        return self._status

    @classmethod
    def fromxml(cls: Type[D], element: ET.Element) -> D:
        """Create new object with values from XML element."""
        element = cast(ET.Element, find(element, "ReplicationTime", True))
        time = Time.fromxml(element)
        status = cast(str, findtext(element, "Status", True))
        return cls(time, status)

    def toxml(self, element: ET.Element | None) -> ET.Element:
        """Convert to XML."""
        if element is None:
            raise ValueError("element must be provided")
        element = SubElement(element, "ReplicationTime")
        self._time.toxml(element)
        SubElement(element, "Status", self._status)
        return element


class EventThreshold(ReplicationTimeValue):
    """Event threshold."""


E = TypeVar("E", bound="Metrics")


class Metrics:
    """Metrics."""

    def __init__(self, event_threshold: EventThreshold, status: str):
        if not event_threshold:
            raise ValueError("event threshold must be provided")
        check_status(status)
        self._event_threshold = event_threshold
        self._status = status

    @property
    def event_threshold(self) -> EventThreshold:
        """Get event threshold."""
        return self._event_threshold

    @property
    def status(self) -> str:
        """Get status."""
        return self._status

    @classmethod
    def fromxml(cls: Type[E], element: ET.Element) -> E:
        """Create new object with values from XML element."""
        element = cast(ET.Element, find(element, "Metrics", True))
        event_threshold = EventThreshold.fromxml(element)
        status = cast(str, findtext(element, "Status", True))
        return cls(event_threshold, status)

    def toxml(self, element: ET.Element | None) -> ET.Element:
        """Convert to XML."""
        if element is None:
            raise ValueError("element must be provided")
        element = SubElement(element, "Metrics")
        self._event_threshold.toxml(element)
        SubElement(element, "Status", self._status)
        return element


F = TypeVar("F", bound="EncryptionConfig")


class EncryptionConfig:
    """Encryption configuration."""

    def __init__(self, replica_kms_key_id: str | None = None):
        self._replica_kms_key_id = replica_kms_key_id

    @property
    def replica_kms_key_id(self) -> str | None:
        """Get replica KMS key ID."""
        return self._replica_kms_key_id

    @classmethod
    def fromxml(cls: Type[F], element: ET.Element) -> F:
        """Create new object with values from XML element."""
        element = cast(
            ET.Element,
            find(element, "EncryptionConfiguration", True),
        )
        return cls(findtext(element, "ReplicaKmsKeyID"))

    def toxml(self, element: ET.Element | None) -> ET.Element:
        """Convert to XML."""
        if element is None:
            raise ValueError("element must be provided")
        element = SubElement(element, "EncryptionConfiguration")
        SubElement(element, "ReplicaKmsKeyID", self._replica_kms_key_id)
        return element


G = TypeVar("G", bound="AccessControlTranslation")


class AccessControlTranslation:
    """Access control translation."""

    def __init__(self, owner: str = "Destination"):
        if not owner:
            raise ValueError("owner must be provided")
        self._owner = owner

    @property
    def owner(self) -> str:
        """Get owner."""
        return self._owner

    @classmethod
    def fromxml(cls: Type[G], element: ET.Element) -> G:
        """Create new object with values from XML element."""
        element = cast(
            ET.Element, find(element, "AccessControlTranslation", True),
        )
        owner = cast(str, findtext(element, "Owner", True))
        return cls(owner)

    def toxml(self, element: ET.Element | None) -> ET.Element:
        """Convert to XML."""
        if element is None:
            raise ValueError("element must be provided")
        element = SubElement(element, "AccessControlTranslation")
        SubElement(element, "Owner", self._owner)
        return element


H = TypeVar("H", bound="Destination")


class Destination:
    """Replication destination."""

    def __init__(
            self,
            bucket_arn: str,
            access_control_translation: AccessControlTranslation | None = None,
            account: str | None = None,
            encryption_config: EncryptionConfig | None = None,
            metrics: Metrics | None = None,
            replication_time: ReplicationTime | None = None,
            storage_class: str | None = None,
    ):
        if not bucket_arn:
            raise ValueError("bucket ARN must be provided")
        self._bucket_arn = bucket_arn
        self._access_control_translation = access_control_translation
        self._account = account
        self._encryption_config = encryption_config
        self._metrics = metrics
        self._replication_time = replication_time
        self._storage_class = storage_class

    @property
    def bucket_arn(self) -> str:
        """Get bucket ARN."""
        return self._bucket_arn

    @property
    def access_control_translation(self) -> AccessControlTranslation | None:
        """Get access control translation. """
        return self._access_control_translation

    @property
    def account(self) -> str | None:
        """Get account."""
        return self._account

    @property
    def encryption_config(self) -> EncryptionConfig | None:
        """Get encryption configuration."""
        return self._encryption_config

    @property
    def metrics(self) -> Metrics | None:
        """Get metrics."""
        return self._metrics

    @property
    def replication_time(self) -> ReplicationTime | None:
        """Get replication time."""
        return self._replication_time

    @property
    def storage_class(self) -> str | None:
        """Get storage class."""
        return self._storage_class

    @classmethod
    def fromxml(cls: Type[H], element: ET.Element) -> H:
        """Create new object with values from XML element."""
        element = cast(ET.Element, find(element, "Destination", True))
        access_control_translation = (
            None if find(element, "AccessControlTranslation") is None
            else AccessControlTranslation.fromxml(element)
        )
        account = findtext(element, "Account")
        bucket_arn = cast(str, findtext(element, "Bucket", True))
        encryption_config = (
            None if find(element, "EncryptionConfiguration") is None
            else EncryptionConfig.fromxml(element)
        )
        metrics = (
            None if find(element, "Metrics") is None
            else Metrics.fromxml(element)
        )
        replication_time = (
            None if find(element, "ReplicationTime") is None
            else ReplicationTime.fromxml(element)
        )
        storage_class = findtext(element, "StorageClass")
        return cls(bucket_arn, access_control_translation, account,
                   encryption_config, metrics, replication_time, storage_class)

    def toxml(self, element: ET.Element | None) -> ET.Element:
        """Convert to XML."""
        if element is None:
            raise ValueError("element must be provided")
        element = SubElement(element, "Destination")
        if self._access_control_translation:
            self._access_control_translation.toxml(element)
        if self._account is not None:
            SubElement(element, "Account", self._account)
        SubElement(element, "Bucket", self._bucket_arn)
        if self._encryption_config:
            self._encryption_config.toxml(element)
        if self._metrics:
            self._metrics.toxml(element)
        if self._replication_time:
            self._replication_time.toxml(element)
        if self._storage_class:
            SubElement(element, "StorageClass", self._storage_class)
        return element


I = TypeVar("I", bound="Rule")


class Rule(BaseRule):
    """Replication rule. """

    def __init__(
            self,
            destination: Destination,
            status: str,
            delete_marker_replication: DeleteMarkerReplication | None = None,
            existing_object_replication:
                ExistingObjectReplication | None = None,
            rule_filter: Filter | None = None,
            rule_id: str | None = None,
            prefix: str | None = None,
            priority: int | None = None,
            source_selection_criteria: SourceSelectionCriteria | None = None,
    ):
        if not destination:
            raise ValueError("destination must be provided")

        check_status(status)

        super().__init__(rule_filter, rule_id)

        self._destination = destination
        self._status = status
        if rule_filter and not delete_marker_replication:
            delete_marker_replication = DeleteMarkerReplication()
        self._delete_marker_replication = delete_marker_replication
        self._existing_object_replication = existing_object_replication
        self._prefix = prefix
        self._priority = priority
        self._source_selection_criteria = source_selection_criteria

    @property
    def destination(self) -> Destination:
        """Get destination."""
        return self._destination

    @property
    def status(self) -> str:
        """Get status."""
        return self._status

    @property
    def delete_marker_replication(self) -> DeleteMarkerReplication | None:
        """Get delete marker replication."""
        return self._delete_marker_replication

    @property
    def existing_object_replication(self) -> ExistingObjectReplication | None:
        """Get existing object replication."""
        return self._existing_object_replication

    @property
    def prefix(self) -> str | None:
        """Get prefix."""
        return self._prefix

    @property
    def priority(self) -> int | None:
        """Get priority."""
        return self._priority

    @property
    def source_selection_criteria(self) -> SourceSelectionCriteria | None:
        """Get source selection criteria."""
        return self._source_selection_criteria

    @classmethod
    def fromxml(cls: Type[I], element: ET.Element) -> I:
        """Create new object with values from XML element."""
        delete_marker_replication = (
            None if find(element, "DeleteMarkerReplication") is None
            else DeleteMarkerReplication.fromxml(element)
        )
        destination = Destination.fromxml(element)
        existing_object_replication = (
            None if find(element, "ExistingObjectReplication") is None
            else ExistingObjectReplication.fromxml(element)
        )
        rule_filter, rule_id = cls.parsexml(element)
        prefix = findtext(element, "Prefix")
        priority = findtext(element, "Priority")
        source_selection_criteria = (
            None if find(element, "SourceSelectionCriteria") is None
            else SourceSelectionCriteria.fromxml(element)
        )
        status = cast(str, findtext(element, "Status", True))

        return cls(
            destination,
            status,
            delete_marker_replication,
            existing_object_replication,
            rule_filter,
            rule_id,
            prefix,
            int(priority) if priority else None,
            source_selection_criteria,
        )

    def toxml(self, element: ET.Element | None) -> ET.Element:
        """Convert to XML."""
        if element is None:
            raise ValueError("element must be provided")
        element = SubElement(element, "Rule")
        if self._delete_marker_replication:
            self._delete_marker_replication.toxml(element)
        self._destination.toxml(element)
        if self._existing_object_replication:
            self._existing_object_replication.toxml(element)
        super().toxml(element)
        if self._prefix is not None:
            SubElement(element, "Prefix", self._prefix)
        if self._priority is not None:
            SubElement(element, "Priority", str(self._priority))
        if self._source_selection_criteria:
            self._source_selection_criteria.toxml(element)
        SubElement(element, "Status", self._status)
        return element


J = TypeVar("J", bound="ReplicationConfig")


class ReplicationConfig:
    """Replication configuration."""

    def __init__(self, role: str, rules: list[Rule]):
        if not rules:
            raise ValueError("rules must be provided")
        if len(rules) > 1000:
            raise ValueError("more than 1000 rules are not supported")
        self._role = role
        self._rules = rules

    @property
    def role(self) -> str:
        """Get role."""
        return self._role

    @property
    def rules(self) -> list[Rule]:
        """Get rules."""
        return self._rules

    @classmethod
    def fromxml(cls: Type[J], element: ET.Element) -> J:
        """Create new object with values from XML element."""
        role = cast(str, findtext(element, "Role", True))
        elements = findall(element, "Rule")
        rules = []
        for tag in elements:
            rules.append(Rule.fromxml(tag))
        return cls(role, rules)

    def toxml(self, element: ET.Element | None) -> ET.Element:
        """Convert to XML."""
        element = Element("ReplicationConfiguration")
        SubElement(element, "Role", self._role)
        for rule in self._rules:
            rule.toxml(element)
        return element
