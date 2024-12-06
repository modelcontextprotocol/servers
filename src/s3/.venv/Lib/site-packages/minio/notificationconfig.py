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

"""
Request/response of PutBucketNotificationConfiguration and
GetBucketNotiicationConfiguration APIs.
"""

from __future__ import absolute_import, annotations

from abc import ABCMeta
from typing import Type, TypeVar, cast
from xml.etree import ElementTree as ET

from .xml import Element, SubElement, find, findall, findtext

A = TypeVar("A", bound="FilterRule")


class FilterRule:
    """Filter rule."""

    __metaclass__ = ABCMeta

    def __init__(self, name: str, value: str):
        self._name = name
        self._value = value

    @property
    def name(self) -> str:
        """Get name."""
        return self._name

    @property
    def value(self) -> str:
        """Get value."""
        return self._value

    @classmethod
    def fromxml(cls: Type[A], element: ET.Element) -> A:
        """Create new object with values from XML element."""
        name = cast(str, findtext(element, "Name", True))
        value = cast(str, findtext(element, "Value", True))
        return cls(name, value)

    def toxml(self, element: ET.Element | None) -> ET.Element:
        """Convert to XML."""
        if element is None:
            raise ValueError("element must be provided")
        element = SubElement(element, "FilterRule")
        SubElement(element, "Name", self._name)
        SubElement(element, "Value", self._value)
        return element


class PrefixFilterRule(FilterRule):
    """Prefix filter rule."""

    def __init__(self, value: str):
        super().__init__("prefix", value)


class SuffixFilterRule(FilterRule):
    """Suffix filter rule."""

    def __init__(self, value: str):
        super().__init__("suffix", value)


class CommonConfig:
    """Common for cloud-function/queue/topic configuration."""

    __metaclass__ = ABCMeta

    def __init__(
            self,
            events: list[str],
            config_id: str | None,
            prefix_filter_rule: PrefixFilterRule | None,
            suffix_filter_rule: SuffixFilterRule | None,
    ):
        if not events:
            raise ValueError("events must be provided")
        self._events = events
        self._config_id = config_id
        self._prefix_filter_rule = prefix_filter_rule
        self._suffix_filter_rule = suffix_filter_rule

    @property
    def events(self) -> list[str]:
        """Get events."""
        return self._events

    @property
    def config_id(self) -> str | None:
        """Get configuration ID."""
        return self._config_id

    @property
    def prefix_filter_rule(self) -> PrefixFilterRule | None:
        """Get prefix filter rule."""
        return self._prefix_filter_rule

    @property
    def suffix_filter_rule(self) -> SuffixFilterRule | None:
        """Get suffix filter rule."""
        return self._suffix_filter_rule

    @staticmethod
    def parsexml(
            element: ET.Element,
    ) -> tuple[
        list[str], str | None, PrefixFilterRule | None, SuffixFilterRule | None
    ]:
        """Parse XML."""
        elements = findall(element, "Event")
        events = []
        for tag in elements:
            if tag.text is None:
                raise ValueError("missing value in XML tag 'Event'")
            events.append(tag.text)
        config_id = findtext(element, "Id")
        elem = find(element, "Filter")
        if elem is None:
            return events, config_id, None, None
        prefix_filter_rule = None
        suffix_filter_rule = None
        elem = cast(ET.Element, find(elem, "S3Key", True))
        elements = findall(elem, "FilterRule")
        for tag in elements:
            filter_rule = FilterRule.fromxml(tag)
            if filter_rule.name == "prefix":
                prefix_filter_rule = PrefixFilterRule(filter_rule.value)
            else:
                suffix_filter_rule = SuffixFilterRule(filter_rule.value)
        return events, config_id, prefix_filter_rule, suffix_filter_rule

    def toxml(self, element: ET.Element | None) -> ET.Element:
        """Convert to XML."""
        if element is None:
            raise ValueError("element must be provided")
        for event in self._events:
            SubElement(element, "Event", event)
        if self._config_id is not None:
            SubElement(element, "Id", self._config_id)
        if self._prefix_filter_rule or self._suffix_filter_rule:
            rule = SubElement(element, "Filter")
            rule = SubElement(rule, "S3Key")
        if self._prefix_filter_rule:
            self._prefix_filter_rule.toxml(rule)
        if self._suffix_filter_rule:
            self._suffix_filter_rule.toxml(rule)
        return element


B = TypeVar("B", bound="CloudFuncConfig")


class CloudFuncConfig(CommonConfig):
    """Cloud function configuration."""

    def __init__(
            self,
            cloud_func: str,
            events: list[str],
            config_id: str | None = None,
            prefix_filter_rule: PrefixFilterRule | None = None,
            suffix_filter_rule: SuffixFilterRule | None = None,
    ):
        if not cloud_func:
            raise ValueError("cloud function must be provided")
        self._cloud_func = cloud_func
        super().__init__(
            events, config_id, prefix_filter_rule, suffix_filter_rule,
        )

    @property
    def cloud_func(self) -> str:
        """Get cloud function ARN."""
        return self._cloud_func

    @classmethod
    def fromxml(cls: Type[B], element: ET.Element) -> B:
        """Create new object with values from XML element."""
        cloud_func = cast(str, findtext(element, "CloudFunction", True))
        (events, config_id, prefix_filter_rule,
         suffix_filter_rule) = cls.parsexml(element)
        return cls(
            cloud_func,
            events,
            config_id,
            prefix_filter_rule,
            suffix_filter_rule
        )

    def toxml(self, element: ET.Element | None) -> ET.Element:
        """Convert to XML."""
        if element is None:
            raise ValueError("element must be provided")
        element = SubElement(element, "CloudFunctionConfiguration")
        SubElement(element, "CloudFunction", self._cloud_func)
        super().toxml(element)
        return element


C = TypeVar("C", bound="QueueConfig")


class QueueConfig(CommonConfig):
    """Queue configuration."""

    def __init__(
            self,
            queue: str,
            events: list[str],
            config_id: str | None = None,
            prefix_filter_rule: PrefixFilterRule | None = None,
            suffix_filter_rule: SuffixFilterRule | None = None,
    ):
        if not queue:
            raise ValueError("queue must be provided")
        self._queue = queue
        super().__init__(
            events, config_id, prefix_filter_rule, suffix_filter_rule,
        )

    @property
    def queue(self) -> str:
        """Get queue ARN."""
        return self._queue

    @classmethod
    def fromxml(cls: Type[C], element: ET.Element) -> C:
        """Create new object with values from XML element."""
        queue = cast(str, findtext(element, "Queue", True))
        (events, config_id, prefix_filter_rule,
         suffix_filter_rule) = cls.parsexml(element)
        return cls(
            queue,
            events,
            config_id,
            prefix_filter_rule,
            suffix_filter_rule
        )

    def toxml(self, element: ET.Element | None) -> ET.Element:
        """Convert to XML."""
        if element is None:
            raise ValueError("element must be provided")
        element = SubElement(element, "QueueConfiguration")
        SubElement(element, "Queue", self._queue)
        super().toxml(element)
        return element


D = TypeVar("D", bound="TopicConfig")


class TopicConfig(CommonConfig):
    """Get topic configuration."""

    def __init__(
            self,
            topic: str,
            events: list[str],
            config_id: str | None = None,
            prefix_filter_rule: PrefixFilterRule | None = None,
            suffix_filter_rule: SuffixFilterRule | None = None,
    ):
        if not topic:
            raise ValueError("topic must be provided")
        self._topic = topic
        super().__init__(
            events, config_id, prefix_filter_rule, suffix_filter_rule,
        )

    @property
    def topic(self) -> str:
        """Get topic ARN."""
        return self._topic

    @classmethod
    def fromxml(cls: Type[D], element: ET.Element) -> D:
        """Create new object with values from XML element."""
        topic = cast(str, findtext(element, "Topic", True))
        (events, config_id, prefix_filter_rule,
         suffix_filter_rule) = cls.parsexml(element)
        return cls(
            topic,
            events,
            config_id,
            prefix_filter_rule,
            suffix_filter_rule
        )

    def toxml(self, element: ET.Element | None) -> ET.Element:
        """Convert to XML."""
        if element is None:
            raise ValueError("element must be provided")
        element = SubElement(element, "TopicConfiguration")
        SubElement(element, "Topic", self._topic)
        super().toxml(element)
        return element


E = TypeVar("E", bound="NotificationConfig")


class NotificationConfig:
    """Notification configuration."""

    def __init__(
            self,
            cloud_func_config_list: list[CloudFuncConfig] | None = None,
            queue_config_list: list[QueueConfig] | None = None,
            topic_config_list: list[TopicConfig] | None = None,
    ):
        self._cloud_func_config_list = cloud_func_config_list or []
        self._queue_config_list = queue_config_list or []
        self._topic_config_list = topic_config_list or []

    @property
    def cloud_func_config_list(self) -> list[CloudFuncConfig] | None:
        """Get cloud function configuration list."""
        return self._cloud_func_config_list

    @property
    def queue_config_list(self) -> list[QueueConfig] | None:
        """Get queue configuration list."""
        return self._queue_config_list

    @property
    def topic_config_list(self) -> list[TopicConfig] | None:
        """Get topic configuration list."""
        return self._topic_config_list

    @classmethod
    def fromxml(cls: Type[E], element: ET.Element) -> E:
        """Create new object with values from XML element."""
        elements = findall(element, "CloudFunctionConfiguration")
        cloud_func_config_list = []
        for tag in elements:
            cloud_func_config_list.append(CloudFuncConfig.fromxml(tag))
        elements = findall(element, "QueueConfiguration")
        queue_config_list = []
        for tag in elements:
            queue_config_list.append(QueueConfig.fromxml(tag))
        elements = findall(element, "TopicConfiguration")
        topic_config_list = []
        for tag in elements:
            topic_config_list.append(TopicConfig.fromxml(tag))
        return cls(
            cloud_func_config_list, queue_config_list, topic_config_list,
        )

    def toxml(self, element: ET.Element | None) -> ET.Element:
        """Convert to XML."""
        element = Element("NotificationConfiguration")
        for cloud_func_config in self._cloud_func_config_list:
            cloud_func_config.toxml(element)
        for queue_config in self._queue_config_list:
            queue_config.toxml(element)
        for config in self._topic_config_list:
            config.toxml(element)
        return element
