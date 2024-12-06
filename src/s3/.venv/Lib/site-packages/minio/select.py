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

"""Request/response of SelectObjectContent API."""

from __future__ import absolute_import

from abc import ABCMeta
from binascii import crc32
from io import BytesIO
from xml.etree import ElementTree as ET

from .error import MinioException
from .xml import Element, SubElement, findtext

COMPRESSION_TYPE_NONE = "NONE"
COMPRESSION_TYPE_GZIP = "GZIP"
COMPRESSION_TYPE_BZIP2 = "BZIP2"

FILE_HEADER_INFO_USE = "USE"
FILE_HEADER_INFO_IGNORE = "IGNORE"
FILE_HEADER_INFO_NONE = "NONE"

JSON_TYPE_DOCUMENT = "DOCUMENT"
JSON_TYPE_LINES = "LINES"

QUOTE_FIELDS_ALWAYS = "ALWAYS"
QUOTE_FIELDS_ASNEEDED = "ASNEEDED"


class InputSerialization:
    """Input serialization."""

    __metaclass__ = ABCMeta

    def __init__(self, compression_type):
        if (
                compression_type is not None and
                compression_type not in [
                    COMPRESSION_TYPE_NONE,
                    COMPRESSION_TYPE_GZIP,
                    COMPRESSION_TYPE_BZIP2,
                ]
        ):
            raise ValueError(
                f"compression type must be {COMPRESSION_TYPE_NONE}, "
                f"{COMPRESSION_TYPE_GZIP} or {COMPRESSION_TYPE_BZIP2}"
            )
        self._compression_type = compression_type

    def toxml(self, element):
        """Convert to XML."""
        if self._compression_type is not None:
            SubElement(element, "CompressionType", self._compression_type)
        return element


class CSVInputSerialization(InputSerialization):
    """CSV input serialization."""

    def __init__(self, compression_type=None,
                 allow_quoted_record_delimiter=None, comments=None,
                 field_delimiter=None, file_header_info=None,
                 quote_character=None, quote_escape_character=None,
                 record_delimiter=None):
        super().__init__(compression_type)
        self._allow_quoted_record_delimiter = allow_quoted_record_delimiter
        self._comments = comments
        self._field_delimiter = field_delimiter
        if (
                file_header_info is not None and
                file_header_info not in [
                    FILE_HEADER_INFO_USE,
                    FILE_HEADER_INFO_IGNORE,
                    FILE_HEADER_INFO_NONE,
                ]
        ):
            raise ValueError(
                f"file header info must be {FILE_HEADER_INFO_USE}, "
                f"{FILE_HEADER_INFO_IGNORE} or {FILE_HEADER_INFO_NONE}"
            )
        self._file_header_info = file_header_info
        self._quote_character = quote_character
        self._quote_escape_character = quote_escape_character
        self._record_delimiter = record_delimiter

    def toxml(self, element):
        """Convert to XML."""
        super().toxml(element)
        element = SubElement(element, "CSV")
        if self._allow_quoted_record_delimiter is not None:
            SubElement(
                element,
                "AllowQuotedRecordDelimiter",
                self._allow_quoted_record_delimiter,
            )
        if self._comments is not None:
            SubElement(element, "Comments", self._comments)
        if self._field_delimiter is not None:
            SubElement(element, "FieldDelimiter", self._field_delimiter)
        if self._file_header_info is not None:
            SubElement(element, "FileHeaderInfo", self._file_header_info)
        if self._quote_character is not None:
            SubElement(element, "QuoteCharacter", self._quote_character)
        if self._quote_escape_character is not None:
            SubElement(
                element,
                "QuoteEscapeCharacter",
                self._quote_escape_character,
            )
        if self._record_delimiter is not None:
            SubElement(element, "RecordDelimiter", self._record_delimiter)


class JSONInputSerialization(InputSerialization):
    """JSON input serialization."""

    def __init__(self, compression_type=None, json_type=None):
        super().__init__(compression_type)
        if (
                json_type is not None and
                json_type not in [JSON_TYPE_DOCUMENT, JSON_TYPE_LINES]
        ):
            raise ValueError(
                f"json type must be {JSON_TYPE_DOCUMENT} or {JSON_TYPE_LINES}"
            )
        self._json_type = json_type

    def toxml(self, element):
        """Convert to XML."""
        super().toxml(element)
        element = SubElement(element, "JSON")
        if self._json_type is not None:
            SubElement(element, "Type", self._json_type)


class ParquetInputSerialization(InputSerialization):
    """Parquet input serialization."""

    def __init__(self):
        super().__init__(None)

    def toxml(self, element):
        """Convert to XML."""
        super().toxml(element)
        return SubElement(element, "Parquet")


class CSVOutputSerialization:
    """CSV output serialization."""

    def __init__(self, field_delimiter=None, quote_character=None,
                 quote_escape_character=None, quote_fields=None,
                 record_delimiter=None):
        self._field_delimiter = field_delimiter
        self._quote_character = quote_character
        self._quote_escape_character = quote_escape_character
        if (
                quote_fields is not None and
                quote_fields not in [
                    QUOTE_FIELDS_ALWAYS, QUOTE_FIELDS_ASNEEDED,
                ]
        ):
            raise ValueError(
                f"quote fields must be {QUOTE_FIELDS_ALWAYS} or "
                f"{QUOTE_FIELDS_ASNEEDED}"
            )
        self._quote_fields = quote_fields
        self._record_delimiter = record_delimiter

    def toxml(self, element):
        """Convert to XML."""
        element = SubElement(element, "CSV")
        if self._field_delimiter is not None:
            SubElement(element, "FieldDelimiter", self._field_delimiter)
        if self._quote_character is not None:
            SubElement(element, "QuoteCharacter", self._quote_character)
        if self._quote_escape_character is not None:
            SubElement(
                element,
                "QuoteEscapeCharacter",
                self._quote_escape_character,
            )
        if self._quote_fields is not None:
            SubElement(element, "QuoteFields", self._quote_fields)
        if self._record_delimiter is not None:
            SubElement(element, "RecordDelimiter", self._record_delimiter)


class JSONOutputSerialization:
    """JSON output serialization."""

    def __init__(self, record_delimiter=None):
        self._record_delimiter = record_delimiter

    def toxml(self, element):
        """Convert to XML."""
        element = SubElement(element, "JSON")
        if self._record_delimiter is not None:
            SubElement(element, "RecordDelimiter", self._record_delimiter)


class SelectRequest:
    """Select object content request."""

    def __init__(self, expression, input_serialization, output_serialization,
                 request_progress=False, scan_start_range=None,
                 scan_end_range=None):
        self._expression = expression
        if not isinstance(
                input_serialization,
                (
                    CSVInputSerialization,
                    JSONInputSerialization,
                    ParquetInputSerialization,
                ),
        ):
            raise ValueError(
                "input serialization must be CSVInputSerialization, "
                "JSONInputSerialization or ParquetInputSerialization type",
            )
        self._input_serialization = input_serialization
        if not isinstance(
                output_serialization,
                (CSVOutputSerialization, JSONOutputSerialization),
        ):
            raise ValueError(
                "output serialization must be CSVOutputSerialization or "
                "JSONOutputSerialization type",
            )
        self._output_serialization = output_serialization
        self._request_progress = request_progress
        self._scan_start_range = scan_start_range
        self._scan_end_range = scan_end_range

    def toxml(self, element):
        """Convert to XML."""
        element = Element("SelectObjectContentRequest")
        SubElement(element, "Expression", self._expression)
        SubElement(element, "ExpressionType", "SQL")
        self._input_serialization.toxml(
            SubElement(element, "InputSerialization"),
        )
        self._output_serialization.toxml(
            SubElement(element, "OutputSerialization"),
        )
        if self._request_progress:
            SubElement(
                SubElement(element, "RequestProgress"), "Enabled", "true",
            )
        if self._scan_start_range or self._scan_end_range:
            tag = SubElement(element, "ScanRange")
            if self._scan_start_range:
                SubElement(tag, "Start", self._scan_start_range)
            if self._scan_end_range:
                SubElement(tag, "End", self._scan_end_range)
        return element


def _read(reader, size):
    """Wrapper to RawIOBase.read() to error out on short reads."""
    data = reader.read(size)
    if len(data) != size:
        raise IOError("insufficient data")
    return data


def _int(data):
    """Convert byte data to big-endian int."""
    return int.from_bytes(data, byteorder="big")


def _crc32(data):
    """Wrapper to binascii.crc32()."""
    return crc32(data) & 0xffffffff


def _decode_header(data):
    """Decode header data."""
    reader = BytesIO(data)
    headers = {}
    while True:
        length = reader.read(1)
        if not length:
            break
        name = _read(reader, _int(length))
        if _int(_read(reader, 1)) != 7:
            raise IOError("header value type is not 7")
        value = _read(reader, _int(_read(reader, 2)))
        headers[name.decode()] = value.decode()
    return headers


class Stats:
    """Progress/Stats information."""

    def __init__(self, data):
        element = ET.fromstring(data.decode())
        self._bytes_scanned = findtext(element, "BytesScanned")
        self._bytes_processed = findtext(element, "BytesProcessed")
        self._bytes_returned = findtext(element, "BytesReturned")

    @property
    def bytes_scanned(self):
        """Get bytes scanned."""
        return self._bytes_scanned

    @property
    def bytes_processed(self):
        """Get bytes processed."""
        return self._bytes_processed

    @property
    def bytes_returned(self):
        """Get bytes returned."""
        return self._bytes_returned


class SelectObjectReader:
    """
    BufferedIOBase compatible reader represents response data of
    Minio.select_object_content() API.
    """

    def __init__(self, response):
        self._response = response
        self._stats = None
        self._payload = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, exc_traceback):
        return self.close()

    def readable(self):  # pylint: disable=no-self-use
        """Return this is readable."""
        return True

    def writeable(self):  # pylint: disable=no-self-use
        """Return this is not writeable."""
        return False

    def close(self):
        """Close response and release network resources."""
        self._response.close()
        self._response.release_conn()

    def stats(self):
        """Get stats information."""
        return self._stats

    def _read(self):
        """Read and decode response."""
        if self._response.isclosed():
            return 0

        prelude = _read(self._response, 8)
        prelude_crc = _read(self._response, 4)
        if _crc32(prelude) != _int(prelude_crc):
            raise IOError(
                f"prelude CRC mismatch; expected: {_crc32(prelude)}, "
                f"got: {_int(prelude_crc)}"
            )

        total_length = _int(prelude[:4])
        data = _read(self._response, total_length - 8 - 4 - 4)
        message_crc = _int(_read(self._response, 4))
        if _crc32(prelude + prelude_crc + data) != message_crc:
            raise IOError(
                f"message CRC mismatch; "
                f"expected: {_crc32(prelude + prelude_crc + data)}, "
                f"got: {message_crc}"
            )

        header_length = _int(prelude[4:])
        headers = _decode_header(data[:header_length])

        if headers.get(":message-type") == "error":
            raise MinioException(
                f"{headers.get(':error-code')}: "
                f"{headers.get(':error-message')}"
            )

        if headers.get(":event-type") == "End":
            return 0

        payload_length = total_length - header_length - 16
        if headers.get(":event-type") == "Cont" or payload_length < 1:
            return self._read()

        payload = data[header_length:header_length+payload_length]

        if headers.get(":event-type") in ["Progress", "Stats"]:
            self._stats = Stats(payload)
            return self._read()

        if headers.get(":event-type") == "Records":
            self._payload = payload
            return len(payload)

        raise MinioException(
            f"unknown event-type {headers.get(':event-type')}",
        )

    def stream(self, num_bytes=32*1024):
        """
        Stream extracted payload from response data. Upon completion, caller
        should call self.close() to release network resources.
        """
        while self._read() > 0:
            while self._payload:
                result = self._payload
                if num_bytes < len(self._payload):
                    result = self._payload[:num_bytes]
                self._payload = self._payload[len(result):]
                yield result
