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

"""Helper functions."""

from __future__ import absolute_import, annotations, division, unicode_literals

import base64
import errno
import hashlib
import math
import os
import platform
import re
import urllib.parse
from datetime import datetime
from queue import Queue
from threading import BoundedSemaphore, Thread
from typing import BinaryIO, Dict, List, Mapping, Tuple, Union

from typing_extensions import Protocol
from urllib3._collections import HTTPHeaderDict

from . import __title__, __version__
from .sse import Sse, SseCustomerKey
from .time import to_iso8601utc

_DEFAULT_USER_AGENT = (
    f"MinIO ({platform.system()}; {platform.machine()}) "
    f"{__title__}/{__version__}"
)

MAX_MULTIPART_COUNT = 10000  # 10000 parts
MAX_MULTIPART_OBJECT_SIZE = 5 * 1024 * 1024 * 1024 * 1024  # 5TiB
MAX_PART_SIZE = 5 * 1024 * 1024 * 1024  # 5GiB
MIN_PART_SIZE = 5 * 1024 * 1024  # 5MiB

_AWS_S3_PREFIX = (r'^(((bucket\.|accesspoint\.)'
                  r'vpce(-(?!_)[a-z_\d]+(?<!-)(?<!_))+\.s3\.)|'
                  r'((?!s3)(?!-)(?!_)[a-z_\d-]{1,63}(?<!-)(?<!_)\.)'
                  r's3-control(-(?!_)[a-z_\d]+(?<!-)(?<!_))*\.|'
                  r'(s3(-(?!_)[a-z_\d]+(?<!-)(?<!_))*\.))')

_BUCKET_NAME_REGEX = re.compile(r'^[a-z0-9][a-z0-9\.\-]{1,61}[a-z0-9]$')
_OLD_BUCKET_NAME_REGEX = re.compile(r'^[a-z0-9][a-z0-9_\.\-\:]{1,61}[a-z0-9]$',
                                    re.IGNORECASE)
_IPV4_REGEX = re.compile(
    r'^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}'
    r'(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$')
_HOSTNAME_REGEX = re.compile(
    r'^((?!-)(?!_)[a-z_\d-]{1,63}(?<!-)(?<!_)\.)*'
    r'((?!_)(?!-)[a-z_\d-]{1,63}(?<!-)(?<!_))$',
    re.IGNORECASE)
_AWS_ENDPOINT_REGEX = re.compile(r'.*\.amazonaws\.com(|\.cn)$', re.IGNORECASE)
_AWS_S3_ENDPOINT_REGEX = re.compile(
    _AWS_S3_PREFIX +
    r'((?!s3)(?!-)(?!_)[a-z_\d-]{1,63}(?<!-)(?<!_)\.)*'
    r'amazonaws\.com(|\.cn)$',
    re.IGNORECASE)
_AWS_ELB_ENDPOINT_REGEX = re.compile(
    r'^(?!-)(?!_)[a-z_\d-]{1,63}(?<!-)(?<!_)\.'
    r'(?!-)(?!_)[a-z_\d-]{1,63}(?<!-)(?<!_)\.'
    r'elb\.amazonaws\.com$',
    re.IGNORECASE)
_AWS_S3_PREFIX_REGEX = re.compile(_AWS_S3_PREFIX, re.IGNORECASE)
_REGION_REGEX = re.compile(r'^((?!_)(?!-)[a-z_\d-]{1,63}(?<!-)(?<!_))$',
                           re.IGNORECASE)

DictType = Dict[str, Union[str, List[str], Tuple[str]]]


def quote(
        resource: str,
        safe: str = "/",
        encoding: str | None = None,
        errors: str | None = None,
) -> str:
    """
    Wrapper to urllib.parse.quote() replacing back to '~' for older python
    versions.
    """
    return urllib.parse.quote(
        resource,
        safe=safe,
        encoding=encoding,
        errors=errors,
    ).replace("%7E", "~")


def queryencode(
        query: str,
        safe: str = "",
        encoding: str | None = None,
        errors: str | None = None,
) -> str:
    """Encode query parameter value."""
    return quote(query, safe, encoding, errors)


def headers_to_strings(
        headers: Mapping[str, str | list[str] | tuple[str]],
        titled_key: bool = False,
) -> str:
    """Convert HTTP headers to multi-line string."""
    values = []
    for key, value in headers.items():
        key = key.title() if titled_key else key
        for item in value if isinstance(value, (list, tuple)) else [value]:
            item = re.sub(
                r"Credential=([^/]+)",
                "Credential=*REDACTED*",
                re.sub(r"Signature=([0-9a-f]+)", "Signature=*REDACTED*", item),
            ) if titled_key else item
            values.append(f"{key}: {item}")
    return "\n".join(values)


def _validate_sizes(object_size: int, part_size: int):
    """Validate object and part size."""
    if part_size > 0:
        if part_size < MIN_PART_SIZE:
            raise ValueError(
                f"part size {part_size} is not supported; minimum allowed 5MiB"
            )
        if part_size > MAX_PART_SIZE:
            raise ValueError(
                f"part size {part_size} is not supported; maximum allowed 5GiB"
            )

    if object_size >= 0:
        if object_size > MAX_MULTIPART_OBJECT_SIZE:
            raise ValueError(
                f"object size {object_size} is not supported; "
                f"maximum allowed 5TiB"
            )
    elif part_size <= 0:
        raise ValueError(
            "valid part size must be provided when object size is unknown",
        )


def _get_part_info(object_size: int, part_size: int):
    """Compute part information for object and part size."""
    _validate_sizes(object_size, part_size)

    if object_size < 0:
        return part_size, -1

    if part_size > 0:
        part_size = min(part_size, object_size)
        return part_size, math.ceil(object_size / part_size) if part_size else 1

    part_size = math.ceil(
        math.ceil(object_size / MAX_MULTIPART_COUNT) / MIN_PART_SIZE,
    ) * MIN_PART_SIZE
    return part_size, math.ceil(object_size / part_size) if part_size else 1


def get_part_info(object_size: int, part_size: int) -> tuple[int, int]:
    """Compute part information for object and part size."""
    part_size, part_count = _get_part_info(object_size, part_size)
    if part_count > MAX_MULTIPART_COUNT:
        raise ValueError(
            f"object size {object_size} and part size {part_size} "
            f"make more than {MAX_MULTIPART_COUNT} parts for upload"
        )
    return part_size, part_count


class ProgressType(Protocol):
    """typing stub for Put/Get object progress."""

    def set_meta(self, object_name: str, total_length: int):
        """Set process meta information."""

    def update(self, length: int):
        """Set current progress length."""


def read_part_data(
        stream: BinaryIO,
        size: int,
        part_data: bytes = b"",
        progress: ProgressType | None = None,
) -> bytes:
    """Read part data of given size from stream."""
    size -= len(part_data)
    while size:
        data = stream.read(size)
        if not data:
            break  # EOF reached
        if not isinstance(data, bytes):
            raise ValueError("read() must return 'bytes' object")
        part_data += data
        size -= len(data)
        if progress:
            progress.update(len(data))
    return part_data


def makedirs(path: str):
    """Wrapper of os.makedirs() ignores errno.EEXIST."""
    try:
        if path:
            os.makedirs(path)
    except OSError as exc:  # Python >2.5
        if exc.errno != errno.EEXIST:
            raise

        if not os.path.isdir(path):
            raise ValueError(f"path {path} is not a directory") from exc


def check_bucket_name(
        bucket_name: str,
        strict: bool = False,
        s3_check: bool = False,
):
    """Check whether bucket name is valid optional with strict check or not."""

    if strict:
        if not _BUCKET_NAME_REGEX.match(bucket_name):
            raise ValueError(f'invalid bucket name {bucket_name}')
    else:
        if not _OLD_BUCKET_NAME_REGEX.match(bucket_name):
            raise ValueError(f'invalid bucket name {bucket_name}')

    if _IPV4_REGEX.match(bucket_name):
        raise ValueError(f'bucket name {bucket_name} must not be formatted '
                         'as an IP address')

    unallowed_successive_chars = ['..', '.-', '-.']
    if any(x in bucket_name for x in unallowed_successive_chars):
        raise ValueError(f'bucket name {bucket_name} contains invalid '
                         'successive characters')

    if (
            s3_check and
            bucket_name.startswith("xn--") or
            bucket_name.endswith("-s3alias") or
            bucket_name.endswith("--ol-s3")
    ):
        raise ValueError(f"bucket name {bucket_name} must not start with "
                         "'xn--' and must not end with '--s3alias' or "
                         "'--ol-s3'")


def check_non_empty_string(string: str | bytes):
    """Check whether given string is not empty."""
    try:
        if not string.strip():
            raise ValueError()
    except AttributeError as exc:
        raise TypeError() from exc


def check_object_name(object_name: str):
    """Check whether given object name is valid."""
    check_non_empty_string(object_name)
    tokens = object_name.split("/")
    if "." in tokens or ".." in tokens:
        raise ValueError(
            "object name with '.' or '..' path segment is not supported",
        )


def is_valid_policy_type(policy: str | bytes):
    """
    Validate if policy is type str

    :param policy: S3 style Bucket policy.
    :return: True if policy parameter is of a valid type, 'string'.
    Raise :exc:`TypeError` otherwise.
    """
    if not isinstance(policy, (str, bytes)):
        raise TypeError("policy must be str or bytes type")

    check_non_empty_string(policy)

    return True


def check_ssec(sse: SseCustomerKey | None):
    """Check sse is SseCustomerKey type or not."""
    if sse and not isinstance(sse, SseCustomerKey):
        raise ValueError("SseCustomerKey type is required")


def check_sse(sse: Sse | None):
    """Check sse is Sse type or not."""
    if sse and not isinstance(sse, Sse):
        raise ValueError("Sse type is required")


def md5sum_hash(data: str | bytes | None) -> str | None:
    """Compute MD5 of data and return hash as Base64 encoded value."""
    if data is None:
        return None

    # indicate md5 hashing algorithm is not used in a security context.
    # Refer https://bugs.python.org/issue9216 for more information.
    hasher = hashlib.new(  # type: ignore[call-arg]
        "md5",
        usedforsecurity=False,
    )
    hasher.update(data.encode() if isinstance(data, str) else data)
    md5sum = base64.b64encode(hasher.digest())
    return md5sum.decode() if isinstance(md5sum, bytes) else md5sum


def sha256_hash(data: str | bytes | None) -> str:
    """Compute SHA-256 of data and return hash as hex encoded value."""
    data = data or b""
    hasher = hashlib.sha256()
    hasher.update(data.encode() if isinstance(data, str) else data)
    sha256sum = hasher.hexdigest()
    if isinstance(sha256sum, bytes):
        return sha256sum.decode()
    return sha256sum


def url_replace(
        url: urllib.parse.SplitResult,
        scheme: str | None = None,
        netloc: str | None = None,
        path: str | None = None,
        query: str | None = None,
        fragment: str | None = None,
) -> urllib.parse.SplitResult:
    """Return new URL with replaced properties in given URL."""
    return urllib.parse.SplitResult(
        scheme if scheme is not None else url.scheme,
        netloc if netloc is not None else url.netloc,
        path if path is not None else url.path,
        query if query is not None else url.query,
        fragment if fragment is not None else url.fragment,
    )


def _metadata_to_headers(metadata: DictType) -> dict[str, list[str]]:
    """Convert user metadata to headers."""
    def normalize_key(key: str) -> str:
        if not key.lower().startswith("x-amz-meta-"):
            key = "X-Amz-Meta-" + key
        return key

    def to_string(value) -> str:
        value = str(value)
        try:
            value.encode("us-ascii")
        except UnicodeEncodeError as exc:
            raise ValueError(
                f"unsupported metadata value {value}; "
                f"only US-ASCII encoded characters are supported"
            ) from exc
        return value

    def normalize_value(values: str | list[str] | tuple[str]) -> list[str]:
        if not isinstance(values, (list, tuple)):
            values = [values]
        return [to_string(value) for value in values]

    return {
        normalize_key(key): normalize_value(value)
        for key, value in (metadata or {}).items()
    }


def normalize_headers(headers: DictType | None) -> DictType:
    """Normalize headers by prefixing 'X-Amz-Meta-' for user metadata."""
    headers = {str(key): value for key, value in (headers or {}).items()}

    def guess_user_metadata(key: str) -> bool:
        key = key.lower()
        return not (
            key.startswith("x-amz-") or
            key in [
                "cache-control",
                "content-encoding",
                "content-type",
                "content-disposition",
                "content-language",
            ]
        )

    user_metadata = {
        key: value for key, value in headers.items()
        if guess_user_metadata(key)
    }

    # Remove guessed user metadata.
    _ = [headers.pop(key) for key in user_metadata]

    headers.update(_metadata_to_headers(user_metadata))
    return headers


def genheaders(
        headers: DictType | None,
        sse: Sse | None,
        tags: dict[str, str] | None,
        retention,
        legal_hold: bool,
) -> DictType:
    """Generate headers for given parameters."""
    headers = normalize_headers(headers)
    headers.update(sse.headers() if sse else {})
    tagging = "&".join(
        [
            queryencode(key) + "=" + queryencode(value)
            for key, value in (tags or {}).items()
        ],
    )
    if tagging:
        headers["x-amz-tagging"] = tagging
    if retention and retention.mode:
        headers["x-amz-object-lock-mode"] = retention.mode
        headers["x-amz-object-lock-retain-until-date"] = (
            to_iso8601utc(retention.retain_until_date) or ""
        )
    if legal_hold:
        headers["x-amz-object-lock-legal-hold"] = "ON"
    return headers


def _get_aws_info(
        host: str,
        https: bool,
        region: str | None,
) -> tuple[dict | None, str | None]:
    """Extract AWS domain information. """

    if not _HOSTNAME_REGEX.match(host):
        return (None, None)

    if _AWS_ELB_ENDPOINT_REGEX.match(host):
        region_in_host = host.split(".elb.amazonaws.com", 1)[0].split(".")[-1]
        return (None, region or region_in_host)

    if not _AWS_ENDPOINT_REGEX.match(host):
        return (None, None)

    if host.startswith("ec2-"):
        return (None, None)

    if not _AWS_S3_ENDPOINT_REGEX.match(host):
        raise ValueError(f"invalid Amazon AWS host {host}")

    matcher = _AWS_S3_PREFIX_REGEX.match(host)
    end = matcher.end() if matcher else 0
    aws_s3_prefix = host[:end]

    if "s3-accesspoint" in aws_s3_prefix and not https:
        raise ValueError(f"use HTTPS scheme for host {host}")

    tokens = host[end:].split(".")
    dualstack = tokens[0] == "dualstack"
    if dualstack:
        tokens = tokens[1:]
    region_in_host = ""
    if tokens[0] not in ["vpce", "amazonaws"]:
        region_in_host = tokens[0]
        tokens = tokens[1:]
    aws_domain_suffix = ".".join(tokens)

    if host in "s3-external-1.amazonaws.com":
        region_in_host = "us-east-1"

    if host in ["s3-us-gov-west-1.amazonaws.com",
                "s3-fips-us-gov-west-1.amazonaws.com"]:
        region_in_host = "us-gov-west-1"

    if (aws_domain_suffix.endswith(".cn") and
        not aws_s3_prefix.endswith("s3-accelerate.") and
        not region_in_host and
            not region):
        raise ValueError(
            f"region missing in Amazon S3 China endpoint {host}",
        )

    return ({"s3_prefix": aws_s3_prefix,
             "domain_suffix": aws_domain_suffix,
             "region": region or region_in_host,
             "dualstack": dualstack}, None)


def _parse_url(endpoint: str) -> urllib.parse.SplitResult:
    """Parse url string."""

    url = urllib.parse.urlsplit(endpoint)
    host = url.hostname

    if url.scheme.lower() not in ["http", "https"]:
        raise ValueError("scheme in endpoint must be http or https")

    url = url_replace(url, scheme=url.scheme.lower())

    if url.path and url.path != "/":
        raise ValueError("path in endpoint is not allowed")

    url = url_replace(url, path="")

    if url.query:
        raise ValueError("query in endpoint is not allowed")

    if url.fragment:
        raise ValueError("fragment in endpoint is not allowed")

    try:
        url.port
    except ValueError as exc:
        raise ValueError("invalid port") from exc

    if url.username:
        raise ValueError("username in endpoint is not allowed")

    if url.password:
        raise ValueError("password in endpoint is not allowed")

    if (
            (url.scheme == "http" and url.port == 80) or
            (url.scheme == "https" and url.port == 443)
    ):
        url = url_replace(url, netloc=host)

    return url


class BaseURL:
    """Base URL of S3 endpoint."""
    _aws_info: dict | None
    _virtual_style_flag: bool
    _url: urllib.parse.SplitResult
    _region: str | None
    _accelerate_host_flag: bool

    def __init__(self, endpoint: str, region: str | None):
        url = _parse_url(endpoint)

        if region and not _REGION_REGEX.match(region):
            raise ValueError(f"invalid region {region}")

        hostname = url.hostname or ""
        self._aws_info, region_in_host = _get_aws_info(
            hostname, url.scheme == "https", region)
        self._virtual_style_flag = (
            self._aws_info is not None or hostname.endswith("aliyuncs.com")
        )
        self._url = url
        self._region = region or region_in_host
        self._accelerate_host_flag = False
        if self._aws_info:
            self._region = self._aws_info["region"]
            self._accelerate_host_flag = (
                self._aws_info["s3_prefix"].endswith("s3-accelerate.")
            )

    @property
    def region(self) -> str | None:
        """Get region."""
        return self._region

    @property
    def is_https(self) -> bool:
        """Check if scheme is HTTPS."""
        return self._url.scheme == "https"

    @property
    def host(self) -> str:
        """Get hostname."""
        return self._url.netloc

    @property
    def is_aws_host(self) -> bool:
        """Check if URL points to AWS host."""
        return self._aws_info is not None

    @property
    def aws_s3_prefix(self) -> str | None:
        """Get AWS S3 domain prefix."""
        return self._aws_info["s3_prefix"] if self._aws_info else None

    @aws_s3_prefix.setter
    def aws_s3_prefix(self, s3_prefix: str):
        """Set AWS s3 domain prefix."""
        if not _AWS_S3_PREFIX_REGEX.match(s3_prefix):
            raise ValueError(f"invalid AWS S3 domain prefix {s3_prefix}")
        if self._aws_info:
            self._aws_info["s3_prefix"] = s3_prefix

    @property
    def accelerate_host_flag(self) -> bool:
        """Get AWS accelerate host flag."""
        return self._accelerate_host_flag

    @accelerate_host_flag.setter
    def accelerate_host_flag(self, flag: bool):
        """Set AWS accelerate host flag."""
        self._accelerate_host_flag = flag

    @property
    def dualstack_host_flag(self) -> bool:
        """Check if URL points to AWS dualstack host."""
        return self._aws_info["dualstack"] if self._aws_info else False

    @dualstack_host_flag.setter
    def dualstack_host_flag(self, flag: bool):
        """Set AWS dualstack host."""
        if self._aws_info:
            self._aws_info["dualstack"] = flag

    @property
    def virtual_style_flag(self) -> bool:
        """Check to use virtual style or not."""
        return self._virtual_style_flag

    @virtual_style_flag.setter
    def virtual_style_flag(self, flag: bool):
        """Check to use virtual style or not."""
        self._virtual_style_flag = flag

    @classmethod
    def _build_aws_url(
            cls,
            aws_info: dict,
            url: urllib.parse.SplitResult,
            bucket_name: str | None,
            enforce_path_style: bool,
            region: str,
    ) -> urllib.parse.SplitResult:
        """Build URL for given information."""
        s3_prefix = aws_info["s3_prefix"]
        domain_suffix = aws_info["domain_suffix"]

        host = f"{s3_prefix}{domain_suffix}"
        if host in ["s3-external-1.amazonaws.com",
                    "s3-us-gov-west-1.amazonaws.com",
                    "s3-fips-us-gov-west-1.amazonaws.com"]:
            return url_replace(url, netloc=host)

        netloc = s3_prefix
        if "s3-accelerate" in s3_prefix:
            if "." in (bucket_name or ""):
                raise ValueError(
                    f"bucket name '{bucket_name}' with '.' is not allowed "
                    f"for accelerate endpoint"
                )
            if enforce_path_style:
                netloc = netloc.replace("-accelerate", "", 1)

        if aws_info["dualstack"]:
            netloc += "dualstack."
        if "s3-accelerate" not in s3_prefix:
            netloc += region + "."
        netloc += domain_suffix

        return url_replace(url, netloc=netloc)

    def _build_list_buckets_url(
            self,
            url: urllib.parse.SplitResult,
            region: str | None,
    ) -> urllib.parse.SplitResult:
        """Build URL for ListBuckets API."""
        if not self._aws_info:
            return url

        s3_prefix = self._aws_info["s3_prefix"]
        domain_suffix = self._aws_info["domain_suffix"]

        host = f"{s3_prefix}{domain_suffix}"
        if host in ["s3-external-1.amazonaws.com",
                    "s3-us-gov-west-1.amazonaws.com",
                    "s3-fips-us-gov-west-1.amazonaws.com"]:
            return url_replace(url, netloc=host)

        if s3_prefix.startswith("s3.") or s3_prefix.startswith("s3-"):
            s3_prefix = "s3."
            cn_suffix = ".cn" if domain_suffix.endswith(".cn") else ""
            domain_suffix = f"amazonaws.com{cn_suffix}"
        return url_replace(url, netloc=f"{s3_prefix}{region}.{domain_suffix}")

    def build(
            self,
            method: str,
            region: str,
            bucket_name: str | None = None,
            object_name: str | None = None,
            query_params: DictType | None = None,
    ) -> urllib.parse.SplitResult:
        """Build URL for given information."""
        if not bucket_name and object_name:
            raise ValueError(
                f"empty bucket name for object name {object_name}",
            )

        url = url_replace(self._url, path="/")

        query = []
        for key, values in sorted((query_params or {}).items()):
            values = values if isinstance(values, (list, tuple)) else [values]
            query += [
                f"{queryencode(key)}={queryencode(value)}"
                for value in sorted(values)
            ]
        url = url_replace(url, query="&".join(query))

        if not bucket_name:
            return self._build_list_buckets_url(url, region)

        enforce_path_style = (
            # CreateBucket API requires path style in Amazon AWS S3.
            (method == "PUT" and not object_name and not query_params) or

            # GetBucketLocation API requires path style in Amazon AWS S3.
            (query_params and "location" in query_params) or

            # Use path style for bucket name containing '.' which causes
            # SSL certificate validation error.
            ("." in bucket_name and self._url.scheme == "https")
        )

        if self._aws_info:
            url = BaseURL._build_aws_url(
                self._aws_info, url, bucket_name, enforce_path_style, region)

        netloc = url.netloc
        path = "/"

        if enforce_path_style or not self._virtual_style_flag:
            path = f"/{bucket_name}"
        else:
            netloc = f"{bucket_name}.{netloc}"
        if object_name:
            path += ("" if path.endswith("/") else "/") + quote(object_name)

        return url_replace(url, netloc=netloc, path=path)


class ObjectWriteResult:
    """Result class of any APIs doing object creation."""

    def __init__(
            self,
            bucket_name: str,
            object_name: str,
            version_id: str | None,
            etag: str | None,
            http_headers: HTTPHeaderDict,
            last_modified: datetime | None = None,
            location: str | None = None,
    ):
        self._bucket_name = bucket_name
        self._object_name = object_name
        self._version_id = version_id
        self._etag = etag
        self._http_headers = http_headers
        self._last_modified = last_modified
        self._location = location

    @property
    def bucket_name(self) -> str:
        """Get bucket name."""
        return self._bucket_name

    @property
    def object_name(self) -> str:
        """Get object name."""
        return self._object_name

    @property
    def version_id(self) -> str | None:
        """Get version ID."""
        return self._version_id

    @property
    def etag(self) -> str | None:
        """Get etag."""
        return self._etag

    @property
    def http_headers(self) -> HTTPHeaderDict:
        """Get HTTP headers."""
        return self._http_headers

    @property
    def last_modified(self) -> datetime | None:
        """Get last-modified time."""
        return self._last_modified

    @property
    def location(self) -> str | None:
        """Get location."""
        return self._location


class Worker(Thread):
    """ Thread executing tasks from a given tasks queue """

    def __init__(
            self,
            tasks_queue: Queue,
            results_queue: Queue,
            exceptions_queue: Queue,
    ):
        Thread.__init__(self, daemon=True)
        self._tasks_queue = tasks_queue
        self._results_queue = results_queue
        self._exceptions_queue = exceptions_queue
        self.start()

    def run(self):
        """ Continuously receive tasks and execute them """
        while True:
            task = self._tasks_queue.get()
            if not task:
                self._tasks_queue.task_done()
                break
            # No exception detected in any thread,
            # continue the execution.
            if self._exceptions_queue.empty():
                # Execute the task
                func, args, kargs, cleanup_func = task
                try:
                    result = func(*args, **kargs)
                    self._results_queue.put(result)
                except Exception as ex:  # pylint: disable=broad-except
                    self._exceptions_queue.put(ex)
                finally:
                    cleanup_func()
            # Mark this task as done, whether an exception happened or not
            self._tasks_queue.task_done()


class ThreadPool:
    """ Pool of threads consuming tasks from a queue """
    _results_queue: Queue
    _exceptions_queue: Queue
    _tasks_queue: Queue
    _sem: BoundedSemaphore
    _num_threads: int

    def __init__(self, num_threads: int):
        self._results_queue = Queue()
        self._exceptions_queue = Queue()
        self._tasks_queue = Queue()
        self._sem = BoundedSemaphore(num_threads)
        self._num_threads = num_threads

    def add_task(self, func, *args, **kargs):
        """
        Add a task to the queue. Calling this function can block
        until workers have a room for processing new tasks. Blocking
        the caller also prevents the latter from allocating a lot of
        memory while workers are still busy running their assigned tasks.
        """
        self._sem.acquire()  # pylint: disable=consider-using-with
        cleanup_func = self._sem.release
        self._tasks_queue.put((func, args, kargs, cleanup_func))

    def start_parallel(self):
        """ Prepare threads to run tasks"""
        for _ in range(self._num_threads):
            Worker(
                self._tasks_queue, self._results_queue, self._exceptions_queue,
            )

    def result(self) -> Queue:
        """ Stop threads and return the result of all called tasks """
        # Send None to all threads to cleanly stop them
        for _ in range(self._num_threads):
            self._tasks_queue.put(None)
        # Wait for completion of all the tasks in the queue
        self._tasks_queue.join()
        # Check if one of the thread raised an exception, if yes
        # raise it here in the function
        if not self._exceptions_queue.empty():
            raise self._exceptions_queue.get()
        return self._results_queue
