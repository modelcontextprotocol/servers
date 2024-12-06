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

# pylint: disable=too-many-lines

"""
Response of ListBuckets, ListObjects, ListObjectsV2 and ListObjectVersions API.
"""

from __future__ import absolute_import, annotations

import base64
import json
from collections import OrderedDict
from datetime import datetime
from enum import Enum
from typing import Any, List, Tuple, Type, TypeVar, cast
from urllib.parse import unquote_plus
from xml.etree import ElementTree as ET

from urllib3._collections import HTTPHeaderDict

try:
    from urllib3.response import BaseHTTPResponse  # type: ignore[attr-defined]
except ImportError:
    from urllib3.response import HTTPResponse as BaseHTTPResponse

from .commonconfig import Tags
from .credentials import Credentials
from .helpers import check_bucket_name
from .signer import get_credential_string, post_presign_v4
from .time import from_iso8601utc, to_amz_date, to_iso8601utc
from .xml import find, findall, findtext

JSONDecodeError: type[ValueError]
try:
    from json.decoder import JSONDecodeError
except ImportError:
    JSONDecodeError = ValueError


class Bucket:
    """Bucket information."""

    def __init__(self, name: str, creation_date: datetime | None):
        self._name = name
        self._creation_date = creation_date

    @property
    def name(self) -> str:
        """Get name."""
        return self._name

    @property
    def creation_date(self) -> datetime | None:
        """Get creation date."""
        return self._creation_date

    def __repr__(self):
        return f"{type(self).__name__}('{self.name}')"

    def __str__(self):
        return self.name

    def __eq__(self, other):
        if isinstance(other, Bucket):
            return self.name == other.name
        if isinstance(other, str):
            return self.name == other
        return NotImplemented

    def __hash__(self):
        return hash(self.name)


A = TypeVar("A", bound="ListAllMyBucketsResult")


class ListAllMyBucketsResult:
    """LissBuckets API result."""

    def __init__(self, buckets: list[Bucket]):
        self._buckets = buckets

    @property
    def buckets(self):
        """Get buckets."""
        return self._buckets

    @classmethod
    def fromxml(cls: Type[A], element: ET.Element) -> A:
        """Create new object with values from XML element."""
        element = cast(ET.Element, find(element, "Buckets", True))
        buckets = []
        elements = findall(element, "Bucket")
        for bucket in elements:
            name = cast(str, findtext(bucket, "Name", True))
            creation_date = findtext(bucket, "CreationDate")
            buckets.append(Bucket(
                name,
                from_iso8601utc(creation_date) if creation_date else None,
            ))
        return cls(buckets)


B = TypeVar("B", bound="Object")


class Object:
    """Object information."""

    def __init__(  # pylint: disable=too-many-arguments
            self,
            bucket_name: str,
            object_name: str | None,
            last_modified: datetime | None = None,
            etag: str | None = None,
            size: int | None = None,
            metadata: dict[str, str] | HTTPHeaderDict | None = None,
            version_id: str | None = None,
            is_latest: str | None = None,
            storage_class: str | None = None,
            owner_id: str | None = None,
            owner_name: str | None = None,
            content_type: str | None = None,
            is_delete_marker: bool = False,
            tags: Tags | None = None,
    ):
        self._bucket_name = bucket_name
        self._object_name = object_name
        self._last_modified = last_modified
        self._etag = etag
        self._size = size
        self._metadata = metadata
        self._version_id = version_id
        self._is_latest = is_latest
        self._storage_class = storage_class
        self._owner_id = owner_id
        self._owner_name = owner_name
        self._content_type = content_type
        self._is_delete_marker = is_delete_marker
        self._tags = tags

    @property
    def bucket_name(self) -> str:
        """Get bucket name."""
        return self._bucket_name

    @property
    def object_name(self) -> str | None:
        """Get object name."""
        return self._object_name

    @property
    def is_dir(self) -> bool:
        """Get whether this key is a directory."""
        return (
            self._object_name is not None and self._object_name.endswith("/")
        )

    @property
    def last_modified(self) -> datetime | None:
        """Get last modified time."""
        return self._last_modified

    @property
    def etag(self) -> str | None:
        """Get etag."""
        return self._etag

    @property
    def size(self) -> int | None:
        """Get size."""
        return self._size

    @property
    def metadata(self) -> dict[str, str] | HTTPHeaderDict | None:
        """Get metadata."""
        return self._metadata

    @property
    def version_id(self) -> str | None:
        """Get version ID."""
        return self._version_id

    @property
    def is_latest(self) -> str | None:
        """Get is-latest flag."""
        return self._is_latest

    @property
    def storage_class(self) -> str | None:
        """Get storage class."""
        return self._storage_class

    @property
    def owner_id(self) -> str | None:
        """Get owner ID."""
        return self._owner_id

    @property
    def owner_name(self) -> str | None:
        """Get owner name."""
        return self._owner_name

    @property
    def is_delete_marker(self) -> bool:
        """Get whether this key is a delete marker."""
        return self._is_delete_marker

    @property
    def content_type(self) -> str | None:
        """Get content type."""
        return self._content_type

    @property
    def tags(self) -> Tags | None:
        """Get the tags"""
        return self._tags

    @classmethod
    def fromxml(
            cls: Type[B],
            element: ET.Element,
            bucket_name: str,
            is_delete_marker: bool = False,
            encoding_type: str | None = None,
    ) -> B:
        """Create new object with values from XML element."""
        tag = findtext(element, "LastModified")
        last_modified = None if tag is None else from_iso8601utc(tag)

        tag = findtext(element, "ETag")
        etag = None if tag is None else tag.replace('"', "")

        tag = findtext(element, "Size")
        size = None if tag is None else int(tag)

        elem = find(element, "Owner")
        owner_id, owner_name = (
            (None, None) if elem is None
            else (findtext(elem, "ID"), findtext(elem, "DisplayName"))
        )

        elems: ET.Element | list = find(element, "UserMetadata") or []
        metadata: dict[str, str] = {}
        for child in elems:
            key = child.tag.split("}")[1] if "}" in child.tag else child.tag
            metadata[key] = child.text or ""

        object_name = cast(str, findtext(element, "Key", True))
        if encoding_type == "url":
            object_name = unquote_plus(object_name)

        tags_text = findtext(element, "UserTags")
        tags: Tags | None = None
        if tags_text:
            tags = Tags.new_object_tags()
            tags.update(
                cast(
                    List[Tuple[Any, Any]],
                    [tokens.split("=") for tokens in tags_text.split("&")],
                ),
            )

        return cls(
            bucket_name,
            object_name,
            last_modified=last_modified,
            etag=etag,
            size=size,
            version_id=findtext(element, "VersionId"),
            is_latest=findtext(element, "IsLatest"),
            storage_class=findtext(element, "StorageClass"),
            owner_id=owner_id,
            owner_name=owner_name,
            metadata=metadata,
            is_delete_marker=is_delete_marker,
            tags=tags
        )


def parse_list_objects(
        response: BaseHTTPResponse,
        bucket_name: str | None = None,
) -> tuple[list[Object], bool, str | None, str | None]:
    """Parse ListObjects/ListObjectsV2/ListObjectVersions response."""
    element = ET.fromstring(response.data.decode())
    bucket_name = cast(str, findtext(element, "Name", True))
    encoding_type = findtext(element, "EncodingType")
    elements = findall(element, "Contents")
    objects = [
        Object.fromxml(tag, bucket_name, encoding_type=encoding_type)
        for tag in elements
    ]
    marker = objects[-1].object_name if objects else None

    elements = findall(element, "Version")
    objects += [
        Object.fromxml(tag, bucket_name, encoding_type=encoding_type)
        for tag in elements
    ]

    elements = findall(element, "CommonPrefixes")
    objects += [
        Object(
            bucket_name, unquote_plus(findtext(tag, "Prefix", True) or "")
            if encoding_type == "url" else findtext(tag, "Prefix", True)
        ) for tag in elements
    ]

    elements = findall(element, "DeleteMarker")
    objects += [
        Object.fromxml(tag, bucket_name, is_delete_marker=True,
                       encoding_type=encoding_type)
        for tag in elements
    ]

    is_truncated = (findtext(element, "IsTruncated") or "").lower() == "true"
    key_marker = findtext(element, "NextKeyMarker")
    if key_marker and encoding_type == "url":
        key_marker = unquote_plus(key_marker)
    version_id_marker = findtext(element, "NextVersionIdMarker")
    continuation_token = findtext(element, "NextContinuationToken")
    if key_marker is not None:
        continuation_token = key_marker
    if continuation_token is None:
        continuation_token = findtext(element, "NextMarker")
        if continuation_token and encoding_type == "url":
            continuation_token = unquote_plus(continuation_token)
    if continuation_token is None and is_truncated:
        continuation_token = marker
    return objects, is_truncated, continuation_token, version_id_marker


class CompleteMultipartUploadResult:
    """CompleteMultipartUpload API result."""

    def __init__(self, response: BaseHTTPResponse):
        element = ET.fromstring(response.data.decode())
        self._bucket_name = findtext(element, "Bucket")
        self._object_name = findtext(element, "Key")
        self._location = findtext(element, "Location")
        self._etag = findtext(element, "ETag")
        if self._etag:
            self._etag = self._etag.replace('"', "")
        self._version_id = response.headers.get("x-amz-version-id")
        self._http_headers = response.headers

    @property
    def bucket_name(self) -> str | None:
        """Get bucket name."""
        return self._bucket_name

    @property
    def object_name(self) -> str | None:
        """Get object name."""
        return self._object_name

    @property
    def location(self) -> str | None:
        """Get location."""
        return self._location

    @property
    def etag(self) -> str | None:
        """Get etag."""
        return self._etag

    @property
    def version_id(self) -> str | None:
        """Get version ID."""
        return self._version_id

    @property
    def http_headers(self) -> HTTPHeaderDict:
        """Get HTTP headers."""
        return self._http_headers


C = TypeVar("C", bound="Part")


class Part:
    """Part information of a multipart upload."""

    def __init__(
            self,
            part_number: int,
            etag: str,
            last_modified: datetime | None = None,
            size: int | None = None,
    ):
        self._part_number = part_number
        self._etag = etag
        self._last_modified = last_modified
        self._size = size

    @property
    def part_number(self) -> int:
        """Get part number. """
        return self._part_number

    @property
    def etag(self) -> str:
        """Get etag."""
        return self._etag

    @property
    def last_modified(self) -> datetime | None:
        """Get last-modified."""
        return self._last_modified

    @property
    def size(self) -> int | None:
        """Get size."""
        return self._size

    @classmethod
    def fromxml(cls: Type[C], element: ET.Element) -> C:
        """Create new object with values from XML element."""
        part_number = int(cast(str, findtext(element, "PartNumber", True)))
        etag = cast(str, findtext(element, "ETag", True))
        etag = etag.replace('"', "")
        tag = findtext(element, "LastModified")
        last_modified = None if tag is None else from_iso8601utc(tag)
        size = findtext(element, "Size")
        return cls(
            part_number, etag, last_modified, int(size) if size else None,
        )


class ListPartsResult:
    """ListParts API result."""

    def __init__(self, response: BaseHTTPResponse):
        element = ET.fromstring(response.data.decode())
        self._bucket_name = findtext(element, "Bucket")
        self._object_name = findtext(element, "Key")
        tag = find(element, "Initiator")
        self._initiator_id = (
            None if tag is None else findtext(tag, "ID")
        )
        self._initiator_name = (
            None if tag is None else findtext(tag, "DisplayName")
        )
        tag = find(element, "Owner")
        self._owner_id = (
            None if tag is None else findtext(tag, "ID")
        )
        self._owner_name = (
            None if tag is None else findtext(tag, "DisplayName")
        )
        self._storage_class = findtext(element, "StorageClass")
        self._part_number_marker = findtext(element, "PartNumberMarker")
        next_part_number_marker = findtext(element, "NextPartNumberMarker")
        self._next_part_number_marker = (
            int(next_part_number_marker) if next_part_number_marker else None
        )
        max_parts = findtext(element, "MaxParts")
        self._max_parts = int(max_parts) if max_parts else None
        is_truncated = findtext(element, "IsTruncated")
        self._is_truncated = (
            is_truncated is not None and is_truncated.lower() == "true"
        )
        self._parts = [Part.fromxml(tag) for tag in findall(element, "Part")]

    @property
    def bucket_name(self) -> str | None:
        """Get bucket name."""
        return self._bucket_name

    @property
    def object_name(self) -> str | None:
        """Get object name."""
        return self._object_name

    @property
    def initiator_id(self) -> str | None:
        """Get initiator ID."""
        return self._initiator_id

    @property
    def initator_name(self) -> str | None:
        """Get initiator name."""
        return self._initiator_name

    @property
    def owner_id(self) -> str | None:
        """Get owner ID."""
        return self._owner_id

    @property
    def owner_name(self) -> str | None:
        """Get owner name."""
        return self._owner_name

    @property
    def storage_class(self) -> str | None:
        """Get storage class."""
        return self._storage_class

    @property
    def part_number_marker(self) -> str | None:
        """Get part number marker."""
        return self._part_number_marker

    @property
    def next_part_number_marker(self) -> int | None:
        """Get next part number marker."""
        return self._next_part_number_marker

    @property
    def max_parts(self) -> int | None:
        """Get max parts."""
        return self._max_parts

    @property
    def is_truncated(self) -> bool:
        """Get is-truncated flag."""
        return self._is_truncated

    @property
    def parts(self) -> list[Part]:
        """Get parts."""
        return self._parts


class Upload:
    """ Upload information of a multipart upload."""

    def __init__(self, element: ET.Element, encoding_type: str | None = None):
        self._encoding_type = encoding_type
        object_name = cast(str, findtext(element, "Key", True))
        self._object_name = (
            unquote_plus(object_name) if self._encoding_type == "url"
            else object_name
        )
        self._upload_id = findtext(element, "UploadId")
        tag = find(element, "Initiator")
        self._initiator_id = (
            None if tag is None else findtext(tag, "ID")
        )
        self._initiator_name = (
            None if tag is None else findtext(tag, "DisplayName")
        )
        tag = find(element, "Owner")
        self._owner_id = (
            None if tag is None else findtext(tag, "ID")
        )
        self._owner_name = (
            None if tag is None else findtext(tag, "DisplayName")
        )
        self._storage_class = findtext(element, "StorageClass")
        initiated_time = findtext(element, "Initiated")
        self._initiated_time = (
            from_iso8601utc(initiated_time) if initiated_time else None
        )

    @property
    def object_name(self) -> str:
        """Get object name."""
        return self._object_name

    @property
    def initiator_id(self) -> str | None:
        """Get initiator ID."""
        return self._initiator_id

    @property
    def initator_name(self) -> str | None:
        """Get initiator name."""
        return self._initiator_name

    @property
    def owner_id(self) -> str | None:
        """Get owner ID."""
        return self._owner_id

    @property
    def owner_name(self) -> str | None:
        """Get owner name."""
        return self._owner_name

    @property
    def storage_class(self) -> str | None:
        """Get storage class."""
        return self._storage_class

    @property
    def upload_id(self) -> str | None:
        """Get upload ID."""
        return self._upload_id

    @property
    def initiated_time(self) -> datetime | None:
        """Get initiated time."""
        return self._initiated_time


class ListMultipartUploadsResult:
    """ListMultipartUploads API result."""

    def __init__(self, response: BaseHTTPResponse):
        element = ET.fromstring(response.data.decode())
        self._encoding_type = findtext(element, "EncodingType")
        self._bucket_name = findtext(element, "Bucket")
        self._key_marker = findtext(element, "KeyMarker")
        if self._key_marker:
            self._key_marker = (
                unquote_plus(self._key_marker) if self._encoding_type == "url"
                else self._key_marker
            )
        self._upload_id_marker = findtext(element, "UploadIdMarker")
        self._next_key_marker = findtext(element, "NextKeyMarker")
        if self._next_key_marker:
            self._next_key_marker = (
                unquote_plus(self._next_key_marker)
                if self._encoding_type == "url" else self._next_key_marker
            )
        self._next_upload_id_marker = findtext(element, "NextUploadIdMarker")
        max_uploads = findtext(element, "MaxUploads")
        self._max_uploads = int(max_uploads) if max_uploads else None
        is_truncated = findtext(element, "IsTruncated")
        self._is_truncated = (
            is_truncated is not None and is_truncated.lower() == "true"
        )
        self._uploads = [
            Upload(tag, self._encoding_type)
            for tag in findall(element, "Upload")
        ]

    @property
    def bucket_name(self) -> str | None:
        """Get bucket name."""
        return self._bucket_name

    @property
    def key_marker(self) -> str | None:
        """Get key marker."""
        return self._key_marker

    @property
    def upload_id_marker(self) -> str | None:
        """Get upload ID marker."""
        return self._upload_id_marker

    @property
    def next_key_marker(self) -> str | None:
        """Get next key marker."""
        return self._next_key_marker

    @property
    def next_upload_id_marker(self) -> str | None:
        """Get next upload ID marker."""
        return self._next_upload_id_marker

    @property
    def max_uploads(self) -> int | None:
        """Get max uploads."""
        return self._max_uploads

    @property
    def is_truncated(self) -> bool:
        """Get is-truncated flag."""
        return self._is_truncated

    @property
    def encoding_type(self) -> str | None:
        """Get encoding type."""
        return self._encoding_type

    @property
    def uploads(self) -> list[Upload]:
        """Get uploads."""
        return self._uploads


_RESERVED_ELEMENTS = (
    "bucket",
    "x-amz-algorithm",
    "x-amz-credential",
    "x-amz-date",
    "policy",
    "x-amz-signature",
)
_EQ = "eq"
_STARTS_WITH = "starts-with"
_ALGORITHM = "AWS4-HMAC-SHA256"


def _trim_dollar(value: str) -> str:
    """Trim dollar character if present."""
    return value[1:] if value.startswith("$") else value


class PostPolicy:
    """
    Post policy information to be used to generate presigned post policy
    form-data. Condition elements and respective condition for Post policy
    is available at
    https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-HTTPPOSTConstructPolicy.html#sigv4-PolicyConditions
    """

    def __init__(self, bucket_name: str, expiration: datetime):
        check_bucket_name(bucket_name)
        if not isinstance(expiration, datetime):
            raise ValueError("expiration must be datetime type")
        self._bucket_name = bucket_name
        self._expiration = expiration
        self._conditions: OrderedDict = OrderedDict()
        self._conditions[_EQ] = OrderedDict()
        self._conditions[_STARTS_WITH] = OrderedDict()
        self._lower_limit: int | None = None
        self._upper_limit: int | None = None

    def add_equals_condition(self, element: str, value: str):
        """Add equals condition of an element and value."""
        if not element:
            raise ValueError("condition element cannot be empty")
        element = _trim_dollar(element)
        if (
                element in [
                    "success_action_redirect",
                    "redirect",
                    "content-length-range",
                ]
        ):
            raise ValueError(element + " is unsupported for equals condition")
        if element in _RESERVED_ELEMENTS:
            raise ValueError(element + " cannot be set")
        self._conditions[_EQ][element] = value

    def remove_equals_condition(self, element: str):
        """Remove previously set equals condition of an element."""
        if not element:
            raise ValueError("condition element cannot be empty")
        self._conditions[_EQ].pop(element)

    def add_starts_with_condition(self, element: str, value: str):
        """
        Add starts-with condition of an element and value. Value set to empty
        string does matching any content condition.
        """
        if not element:
            raise ValueError("condition element cannot be empty")
        element = _trim_dollar(element)
        if (
                element in ["success_action_status", "content-length-range"] or
                (
                    element.startswith("x-amz-") and
                    not element.startswith("x-amz-meta-")
                )
        ):
            raise ValueError(
                f"{element} is unsupported for starts-with condition",
            )
        if element in _RESERVED_ELEMENTS:
            raise ValueError(element + " cannot be set")
        self._conditions[_STARTS_WITH][element] = value

    def remove_starts_with_condition(self, element: str):
        """Remove previously set starts-with condition of an element."""
        if not element:
            raise ValueError("condition element cannot be empty")
        self._conditions[_STARTS_WITH].pop(element)

    def add_content_length_range_condition(  # pylint: disable=invalid-name
            self, lower_limit: int, upper_limit: int):
        """Add content-length-range condition with lower and upper limits."""
        if lower_limit < 0:
            raise ValueError("lower limit cannot be negative number")
        if upper_limit < 0:
            raise ValueError("upper limit cannot be negative number")
        if lower_limit > upper_limit:
            raise ValueError("lower limit cannot be greater than upper limit")
        self._lower_limit = lower_limit
        self._upper_limit = upper_limit

    def remove_content_length_range_condition(  # pylint: disable=invalid-name
            self):
        """Remove previously set content-length-range condition."""
        self._lower_limit = None
        self._upper_limit = None

    def form_data(self, creds: Credentials, region: str):
        """
        Return form-data of this post policy. The returned dict contains
        x-amz-algorithm, x-amz-credential, x-amz-security-token, x-amz-date,
        policy and x-amz-signature.
        """
        if not isinstance(creds, Credentials):
            raise ValueError("credentials must be Credentials type")
        if not region:
            raise ValueError("region cannot be empty")
        if (
                "key" not in self._conditions[_EQ] and
                "key" not in self._conditions[_STARTS_WITH]
        ):
            raise ValueError("key condition must be set")

        policy: OrderedDict = OrderedDict()
        policy["expiration"] = to_iso8601utc(self._expiration)
        policy["conditions"] = [[_EQ, "$bucket", self._bucket_name]]
        for cond_key, conditions in self._conditions.items():
            for key, value in conditions.items():
                policy["conditions"].append([cond_key, "$"+key, value])
        if self._lower_limit is not None and self._upper_limit is not None:
            policy["conditions"].append(
                ["content-length-range", self._lower_limit, self._upper_limit],
            )
        utcnow = datetime.utcnow()
        credential = get_credential_string(creds.access_key, utcnow, region)
        amz_date = to_amz_date(utcnow)
        policy["conditions"].append([_EQ, "$x-amz-algorithm", _ALGORITHM])
        policy["conditions"].append([_EQ, "$x-amz-credential", credential])
        if creds.session_token:
            policy["conditions"].append(
                [_EQ, "$x-amz-security-token", creds.session_token],
            )
        policy["conditions"].append([_EQ, "$x-amz-date", amz_date])

        policy_encoded = base64.b64encode(
            json.dumps(policy).encode(),
        ).decode("utf-8")
        signature = post_presign_v4(
            policy_encoded, creds.secret_key, utcnow, region,
        )
        form_data = {
            "x-amz-algorithm": _ALGORITHM,
            "x-amz-credential": credential,
            "x-amz-date": amz_date,
            "policy": policy_encoded,
            "x-amz-signature": signature,
        }
        if creds.session_token:
            form_data["x-amz-security-token"] = creds.session_token
        return form_data

    @property
    def bucket_name(self) -> str:
        """Get bucket name."""
        return self._bucket_name


def parse_copy_object(
        response: BaseHTTPResponse,
) -> tuple[str, datetime | None]:
    """Parse CopyObject/UploadPartCopy response."""
    element = ET.fromstring(response.data.decode())
    etag = cast(str, findtext(element, "ETag", True)).replace('"', "")
    last_modified = findtext(element, "LastModified")
    return etag, from_iso8601utc(last_modified) if last_modified else None


class EventIterable:
    """Context manager friendly event iterable."""

    def __init__(self, func):
        self._func = func
        self._response = None

    def _close_response(self):
        """Close response."""
        if self._response:
            self._response.close()
            self._response.release_conn()
            self._response = None

    def __iter__(self):
        return self

    def _get_records(self):
        """Get event records from response stream."""
        try:
            line = self._response.readline().strip()
            if not line:
                return None
            if hasattr(line, 'decode'):
                line = line.decode()
            event = json.loads(line)
            if event['Records']:
                return event
        except (StopIteration, JSONDecodeError):
            self._close_response()
        return None

    def __next__(self):
        records = None
        while not records:
            if not self._response or self._response.closed:
                self._response = self._func()
            records = self._get_records()
        return records

    def __enter__(self):
        return self

    def __exit__(self, exc_type, value, traceback):
        self._close_response()


class PeerSite:
    """Represents a cluster/site to be added to the set of replicated sites."""

    def __init__(
            self,
            name: str,
            endpoint: str,
            access_key: str,
            secret_key: str,
    ):
        self._name = name
        self._endpoint = endpoint
        self._access_key = access_key
        self._secret_key = secret_key

    def to_dict(self) -> dict[str, str]:
        """Convert to dictionary."""
        return {
            "name": self._name,
            "endpoints": self._endpoint,
            "accessKey": self._access_key,
            "secretKey": self._secret_key,
        }


class SiteReplicationStatusOptions:
    """Represents site replication status options."""
    ENTITY_TYPE = Enum(
        "ENTITY_TYPE",
        {
            "BUCKET": "bucket",
            "POLICY": "policy",
            "USER": "user",
            "GROUP": "group",
        },
    )

    def __init__(self):
        self._buckets = False
        self._policies = False
        self._users = False
        self._groups = False
        self._metrics = False
        self._entity = None
        self._entity_value = None
        self._show_deleted = False

    @property
    def buckets(self) -> bool:
        """Get buckets."""
        return self._buckets

    @buckets.setter
    def buckets(self, value: bool):
        """Set buckets."""
        self._buckets = value

    @property
    def policies(self) -> bool:
        """Get policies."""
        return self._policies

    @policies.setter
    def policies(self, value: bool):
        """Set policies."""
        self._policies = value

    @property
    def users(self) -> bool:
        """Get users."""
        return self._users

    @users.setter
    def users(self, value: bool):
        """Set users."""
        self._users = value

    @property
    def groups(self) -> bool:
        """Get groups."""
        return self._groups

    @groups.setter
    def groups(self, value: bool):
        """Set groups."""
        self._groups = value

    @property
    def metrics(self) -> bool:
        """Get metrics."""
        return self._metrics

    @metrics.setter
    def metrics(self, value: bool):
        """Set metrics."""
        self._metrics = value

    @property
    def entity(self) -> str:
        """Get entity."""
        return self._entity

    @entity.setter
    def entity(self, value: str):
        """Set entity."""
        self._entity = value

    @property
    def entity_value(self) -> str:
        """Get entity value."""
        return self._entity_value

    @entity_value.setter
    def entity_value(self, value: str):
        """Set entity value."""
        self._entity_value = value

    @property
    def show_deleted(self) -> bool:
        """Get show deleted."""
        return self._show_deleted

    @show_deleted.setter
    def show_deleted(self, value: bool):
        """Set show deleted."""
        self._show_deleted = value

    def to_query_params(self) -> dict[str, str]:
        """Convert this options to query parameters."""
        params = {
            "buckets": str(self._buckets).lower(),
            "policies": str(self._policies).lower(),
            "users": str(self._users).lower(),
            "groups": str(self._groups).lower(),
            "metrics": str(self._metrics).lower(),
            "showDeleted": str(self._show_deleted).lower(),
        }
        if self._entity and self._entity_value:
            params["entityvalue"] = self._entity_value
            params["entity"] = self._entity.value
        return params


class PeerInfo:
    """Site replication peer information."""

    def __init__(
            self,
            deployment_id: str,
            endpoint: str,
            bucket_bandwidth_limit: str,
            bucket_bandwidth_set: str,
    ):
        self._deployment_id = deployment_id
        self._endpoint = endpoint
        self._name: str | None = None
        self._sync_status: str | None = None
        self._bucket_bandwidth_limit = bucket_bandwidth_limit
        self._bucket_bandwidth_set = bucket_bandwidth_set
        self._bucket_bandwidth_updated_at: datetime | None = None

    @property
    def deployment_id(self) -> str:
        """Get deployment ID."""
        return self._deployment_id

    @deployment_id.setter
    def deployment_id(self, value: str):
        """Set deployment ID."""
        self._deployment_id = value

    @property
    def endpoint(self) -> str:
        """Get endpoint."""
        return self._endpoint

    @endpoint.setter
    def endpoint(self, value: str):
        """Set endpoint."""
        self._endpoint = value

    @property
    def name(self) -> str | None:
        """Get name."""
        return self._name

    @name.setter
    def name(self, value: str):
        """Set name."""
        self._name = value

    @property
    def sync_status(self) -> str | None:
        """Get sync status."""
        return self._sync_status

    @sync_status.setter
    def sync_status(self, value: str):
        """Set sync status."""
        self._sync_status = value

    @property
    def bucket_bandwidth_limit(self) -> str:
        """Get bucket bandwidth limit."""
        return self._bucket_bandwidth_limit

    @bucket_bandwidth_limit.setter
    def bucket_bandwidth_limit(self, value: str):
        """Set bucket bandwidth limit."""
        self._bucket_bandwidth_limit = value

    @property
    def bucket_bandwidth_set(self) -> str:
        """Get bucket bandwidth set."""
        return self._bucket_bandwidth_set

    @bucket_bandwidth_set.setter
    def bucket_bandwidth_set(self, value: str):
        """Set bucket bandwidth set."""
        self._bucket_bandwidth_set = value

    @property
    def bucket_bandwidth_updated_at(self) -> datetime | None:
        """Get bucket bandwidth updated at."""
        return self._bucket_bandwidth_updated_at

    @bucket_bandwidth_updated_at.setter
    def bucket_bandwidth_updated_at(self, value: datetime | None):
        """Set bucket bandwidth updated at."""
        self._bucket_bandwidth_updated_at = value

    def to_dict(self):
        """Converts peer information to dictionary."""
        data = {
            "endpoint": self._endpoint,
            "deploymentID": self._deployment_id,
            "defaultbandwidth": {
                "bandwidthLimitPerBucket": self._bucket_bandwidth_limit,
                "set": self._bucket_bandwidth_set,
            },
        }
        if self._name:
            data["name"] = self._name
        if self._sync_status is not None:
            data["sync"] = "enable" if self._sync_status else "disable"
        if self._bucket_bandwidth_updated_at:
            data["defaultbandwidth"]["updatedAt"] = to_iso8601utc(
                self._bucket_bandwidth_updated_at,
            )
        return data
