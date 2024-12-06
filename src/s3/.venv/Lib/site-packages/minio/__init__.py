# -*- coding: utf-8 -*-
# MinIO Python Library for Amazon S3 Compatible Cloud Storage,
# (C) 2015, 2016, 2017 MinIO, Inc.
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
minio - MinIO Python SDK for Amazon S3 Compatible Cloud Storage

    >>> from minio import Minio
    >>> client = Minio(
    ...     "play.min.io",
    ...     access_key="Q3AM3UQ867SPQQA43P2F",
    ...     secret_key="zuf+tfteSlswRu7BJ86wekitnifILbZam1KYY3TG",
    ... )
    >>> buckets = client.list_buckets()
    >>> for bucket in buckets:
    ...     print(bucket.name, bucket.creation_date)

:copyright: (C) 2015-2020 MinIO, Inc.
:license: Apache 2.0, see LICENSE for more details.
"""

__title__ = "minio-py"
__author__ = "MinIO, Inc."
__version__ = "7.2.10"
__license__ = "Apache 2.0"
__copyright__ = "Copyright 2015, 2016, 2017, 2018, 2019, 2020 MinIO, Inc."

# pylint: disable=unused-import,useless-import-alias
from .api import Minio as Minio
from .error import InvalidResponseError as InvalidResponseError
from .error import S3Error as S3Error
from .error import ServerError as ServerError
from .minioadmin import MinioAdmin as MinioAdmin
