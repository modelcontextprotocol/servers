# -*- coding: utf-8 -*-
# MinIO Python Library for Amazon S3 Compatible Cloud Storage,
# (C) 2021 MinIO, Inc.
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

# pylint: disable=too-many-public-methods

"""MinIO Admin Client to perform MinIO administration operations."""

from __future__ import absolute_import, annotations

import json
import os
from datetime import timedelta
from enum import Enum, unique
from typing import Any, TextIO, Tuple, cast
from urllib.parse import urlunsplit

import certifi
from urllib3 import Retry
from urllib3._collections import HTTPHeaderDict
from urllib3.poolmanager import PoolManager

try:
    from urllib3.response import BaseHTTPResponse  # type: ignore[attr-defined]
except ImportError:
    from urllib3.response import HTTPResponse as BaseHTTPResponse

from urllib3.util import Timeout

from . import time
from .credentials import Provider
from .crypto import decrypt, encrypt
from .datatypes import PeerInfo, PeerSite, SiteReplicationStatusOptions
from .error import MinioAdminException
from .helpers import (_DEFAULT_USER_AGENT, _REGION_REGEX, DictType, _parse_url,
                      headers_to_strings, queryencode, sha256_hash,
                      url_replace)
from .signer import sign_v4_s3


@unique
class _COMMAND(Enum):
    """Admin Command enumerations."""
    ADD_USER = "add-user"
    USER_INFO = "user-info"
    LIST_USERS = "list-users"
    REMOVE_USER = "remove-user"
    SET_USER_STATUS = "set-user-status"
    ADD_CANNED_POLICY = "add-canned-policy"
    SET_USER_OR_GROUP_POLICY = "set-user-or-group-policy"
    LIST_CANNED_POLICIES = "list-canned-policies"
    REMOVE_CANNED_POLICY = "remove-canned-policy"
    UNSET_USER_OR_GROUP_POLICY = "idp/builtin/policy/detach"
    CANNED_POLICY_INFO = "info-canned-policy"
    SET_BUCKET_QUOTA = "set-bucket-quota"
    GET_BUCKET_QUOTA = "get-bucket-quota"
    DATA_USAGE_INFO = "datausageinfo"
    ADD_UPDATE_REMOVE_GROUP = "update-group-members"
    SET_GROUP_STATUS = "set-group-status"
    GROUP_INFO = "group"
    LIST_GROUPS = "groups"
    INFO = "info"
    SERVICE = "service"
    UPDATE = "update"
    TOP_LOCKS = "top/locks"
    HELP_CONFIG = "help-config-kv"
    GET_CONFIG = "get-config-kv"
    SET_CONFIG = "set-config-kv"
    DELETE_CONFIG = "del-config-kv"
    LIST_CONFIG_HISTORY = "list-config-history-kv"
    RESOTRE_CONFIG_HISTORY = "restore-config-history-kv"
    START_PROFILE = "profile"
    CREATE_KMS_KEY = "kms/key/create"
    GET_KMS_KEY_STATUS = "kms/key/status"
    SITE_REPLICATION_ADD = "site-replication/add"
    SITE_REPLICATION_INFO = "site-replication/info"
    SITE_REPLICATION_STATUS = "site-replication/status"
    SITE_REPLICATION_EDIT = "site-replication/edit"
    SITE_REPLICATION_REMOVE = "site-replication/remove"
    SERVICE_ACCOUNT_INFO = "info-service-account"
    SERVICE_ACCOUNT_LIST = "list-service-accounts"
    SERVICE_ACCOUNT_ADD = "add-service-account"
    SERVICE_ACCOUNT_UPDATE = "update-service-account"
    SERVICE_ACCOUNT_DELETE = "delete-service-account"


def _safe_str(value: Any) -> str:
    """Convert to string safely"""
    try:
        return value.decode() if isinstance(value, bytes) else str(value)
    except UnicodeDecodeError:
        return value.hex()


class MinioAdmin:
    """Client to perform MinIO administration operations."""

    def __init__(
            self,
            endpoint: str,
            credentials: Provider,
            region: str = "",
            secure: bool = True,
            cert_check: bool = True,
            http_client: PoolManager | None = None,
    ):
        url = _parse_url(("https://" if secure else "http://") + endpoint)
        if not isinstance(credentials, Provider):
            raise ValueError("valid credentials must be provided")
        if region and not _REGION_REGEX.match(region):
            raise ValueError(f"invalid region {region}")
        if http_client:
            if not isinstance(http_client, PoolManager):
                raise ValueError(
                    "HTTP client should be instance of "
                    "`urllib3.poolmanager.PoolManager`"
                )
        else:
            timeout = timedelta(minutes=5).seconds
            http_client = PoolManager(
                timeout=Timeout(connect=timeout, read=timeout),
                maxsize=10,
                cert_reqs='CERT_REQUIRED' if cert_check else 'CERT_NONE',
                ca_certs=os.environ.get('SSL_CERT_FILE') or certifi.where(),
                retries=Retry(
                    total=5,
                    backoff_factor=0.2,
                    status_forcelist=[500, 502, 503, 504]
                )
            )

        self._url = url
        self._provider = credentials
        self._region = region
        self._secure = secure
        self._cert_check = cert_check
        self._http = http_client
        self._user_agent = _DEFAULT_USER_AGENT
        self._trace_stream: TextIO | None = None

    def __del__(self):
        self._http.clear()

    def _url_open(
            self,
            method: str,
            command: _COMMAND,
            query_params: DictType | None = None,
            body: bytes | None = None,
            preload_content: bool = True,
    ) -> BaseHTTPResponse:
        """Execute HTTP request."""
        creds = self._provider.retrieve()

        url = url_replace(self._url, path="/minio/admin/v3/"+command.value)
        query = []
        for key, values in sorted((query_params or {}).items()):
            values = values if isinstance(values, (list, tuple)) else [values]
            query += [
                f"{queryencode(key)}={queryencode(value)}"
                for value in sorted(values)
            ]
        url = url_replace(url, query="&".join(query))

        content_sha256 = sha256_hash(body)
        date = time.utcnow()
        headers: DictType = {
            "Host": url.netloc,
            "User-Agent": self._user_agent,
            "x-amz-date": time.to_amz_date(date),
            "x-amz-content-sha256": content_sha256,
            "Content-Type": "application/octet-stream"
        }
        if creds.session_token:
            headers["X-Amz-Security-Token"] = creds.session_token
        if body:
            headers["Content-Length"] = str(len(body))

        headers = sign_v4_s3(
            method,
            url,
            self._region,
            headers,
            creds,
            content_sha256,
            date,
        )

        if self._trace_stream:
            self._trace_stream.write("---------START-HTTP---------\n")
            query_string = ("?" + url.query) if url.query else ""
            self._trace_stream.write(
                f"{method} {url.path}{query_string} HTTP/1.1\n",
            )
            self._trace_stream.write(
                headers_to_strings(headers, titled_key=True),
            )
            self._trace_stream.write("\n")
            if body is not None:
                self._trace_stream.write("\n")
                self._trace_stream.write(_safe_str(body))
                self._trace_stream.write("\n")
            self._trace_stream.write("\n")

        http_headers = HTTPHeaderDict()
        for key, value in headers.items():
            if isinstance(value, (list, tuple)):
                for val in value:
                    http_headers.add(key, val)
            else:
                http_headers.add(key, value)

        response = self._http.urlopen(
            method,
            urlunsplit(url),
            body=body,
            headers=http_headers,
            preload_content=preload_content,
        )

        if self._trace_stream:
            self._trace_stream.write(f"HTTP/1.1 {response.status}\n")
            self._trace_stream.write(
                headers_to_strings(response.headers),
            )
            self._trace_stream.write("\n")
            if preload_content:
                self._trace_stream.write("\n")
                self._trace_stream.write(_safe_str(response.data))
                self._trace_stream.write("\n")
            self._trace_stream.write("----------END-HTTP----------\n")

        if response.status in [200, 204, 206]:
            return response

        raise MinioAdminException(
            str(response.status),
            _safe_str(response.data),
        )

    def set_app_info(self, app_name: str, app_version: str):
        """
        Set your application name and version to user agent header.

        :param app_name: Application name.
        :param app_version: Application version.

        Example::
            client.set_app_info('my_app', '1.0.2')
        """
        if not (app_name and app_version):
            raise ValueError("Application name/version cannot be empty.")
        self._user_agent = f"{_DEFAULT_USER_AGENT} {app_name}/{app_version}"

    def trace_on(self, stream: TextIO):
        """
        Enable http trace.

        :param stream: Stream for writing HTTP call tracing.
        """
        if not stream:
            raise ValueError('Input stream for trace output is invalid.')
        # Save new output stream.
        self._trace_stream = stream

    def trace_off(self):
        """
        Disable HTTP trace.
        """
        self._trace_stream = None

    def service_restart(self) -> str:
        """Restart MinIO service."""
        response = self._url_open(
            "POST",
            _COMMAND.SERVICE,
            query_params={"action": "restart"}
        )
        return response.data.decode()

    def service_stop(self) -> str:
        """Stop MinIO service."""
        response = self._url_open(
            "POST",
            _COMMAND.SERVICE,
            query_params={"action": "stop"}
        )
        return response.data.decode()

    def update(self) -> str:
        """Update MinIO."""
        response = self._url_open(
            "POST",
            _COMMAND.UPDATE,
            query_params={"updateURL": ""}
        )
        return response.data.decode()

    def info(self) -> str:
        """Get MinIO server information."""
        response = self._url_open(
            "GET",
            _COMMAND.INFO,
        )
        return response.data.decode()

    def user_add(self, access_key: str, secret_key: str) -> str:
        """Create user with access and secret keys"""
        body = json.dumps(
            {"status": "enabled", "secretKey": secret_key}).encode()
        response = self._url_open(
            "PUT",
            _COMMAND.ADD_USER,
            query_params={"accessKey": access_key},
            body=encrypt(body, self._provider.retrieve().secret_key),
        )
        return response.data.decode()

    def user_disable(self, access_key: str) -> str:
        """Disable user."""
        response = self._url_open(
            "PUT",
            _COMMAND.SET_USER_STATUS,
            query_params={"accessKey": access_key, "status": "disabled"}
        )
        return response.data.decode()

    def user_enable(self, access_key: str) -> str:
        """Enable user."""
        response = self._url_open(
            "PUT",
            _COMMAND.SET_USER_STATUS,
            query_params={"accessKey": access_key, "status": "enabled"}
        )
        return response.data.decode()

    def user_remove(self, access_key: str) -> str:
        """Delete user"""
        response = self._url_open(
            "DELETE",
            _COMMAND.REMOVE_USER,
            query_params={"accessKey": access_key},
        )
        return response.data.decode()

    def user_info(self, access_key: str) -> str:
        """Get information about user"""
        response = self._url_open(
            "GET",
            _COMMAND.USER_INFO,
            query_params={"accessKey": access_key},
        )
        return response.data.decode()

    def user_list(self) -> str:
        """List all users"""
        response = self._url_open(
            "GET", _COMMAND.LIST_USERS, preload_content=False,
        )
        plain_data = decrypt(
            response, self._provider.retrieve().secret_key,
        )
        return plain_data.decode()

    def group_add(self, group_name: str, members: str) -> str:
        """Add users a new or existing group."""
        body = json.dumps({
            "group": group_name,
            "members": members,
            "isRemove": False
        }).encode()
        response = self._url_open(
            "PUT",
            _COMMAND.ADD_UPDATE_REMOVE_GROUP,
            body=body,
        )
        return response.data.decode()

    def group_disable(self, group_name: str) -> str:
        """Disable group."""
        response = self._url_open(
            "PUT",
            _COMMAND.SET_GROUP_STATUS,
            query_params={"group": group_name, "status": "disabled"}
        )
        return response.data.decode()

    def group_enable(self, group_name: str) -> str:
        """Enable group."""
        response = self._url_open(
            "PUT",
            _COMMAND.SET_GROUP_STATUS,
            query_params={"group": group_name, "status": "enabled"}
        )
        return response.data.decode()

    def group_remove(self, group_name: str, members: str | None = None) -> str:
        """Remove group or members from a group."""
        data = {
            "group": group_name,
            "isRemove": True
        }
        if members is not None:
            data["members"] = members

        response = self._url_open(
            "PUT",
            _COMMAND.ADD_UPDATE_REMOVE_GROUP,
            body=json.dumps(data).encode(),
        )
        return response.data.decode()

    def group_info(self, group_name: str) -> str:
        """Get group information."""
        response = self._url_open(
            "GET",
            _COMMAND.GROUP_INFO,
            query_params={"group": group_name},
        )
        return response.data.decode()

    def group_list(self) -> str:
        """List groups."""
        response = self._url_open("GET", _COMMAND.LIST_GROUPS)
        return response.data.decode()

    def policy_add(self, policy_name: str, policy_file: str) -> str:
        """Add new policy."""
        with open(policy_file, encoding='utf-8') as file:
            response = self._url_open(
                "PUT",
                _COMMAND.ADD_CANNED_POLICY,
                query_params={"name": policy_name},
                body=file.read().encode(),
            )
            return response.data.decode()

    def policy_remove(self, policy_name: str) -> str:
        """Remove policy."""
        response = self._url_open(
            "DELETE",
            _COMMAND.REMOVE_CANNED_POLICY,
            query_params={"name": policy_name},
        )
        return response.data.decode()

    def policy_info(self, policy_name: str) -> str:
        """Get policy information."""
        response = self._url_open(
            "GET",
            _COMMAND.CANNED_POLICY_INFO,
            query_params={"name": policy_name},
        )
        return response.data.decode()

    def policy_list(self) -> str:
        """List policies."""
        response = self._url_open("GET", _COMMAND.LIST_CANNED_POLICIES)
        return response.data.decode()

    def policy_set(
            self,
            policy_name: str | list[str],
            user: str | None = None,
            group: str | None = None,
    ) -> str:
        """Set IAM policy on a user or group."""
        if (user is not None) ^ (group is not None):
            response = self._url_open(
                "PUT",
                _COMMAND.SET_USER_OR_GROUP_POLICY,
                query_params={"userOrGroup": cast(str, user or group),
                              "isGroup": "true" if group else "false",
                              "policyName": policy_name},
            )
            return response.data.decode()
        raise ValueError("either user or group must be set")

    def policy_unset(
            self,
            policy_name: str | list[str],
            user: str | None = None,
            group: str | None = None,
    ) -> str:
        """Unset an IAM policy for a user or group."""
        if (user is not None) ^ (group is not None):
            policies = (
                policy_name if isinstance(policy_name, list) else [policy_name]
            )
            data: dict[str, str | list[str]] = {"policies": policies}
            if user:
                data["user"] = user
            if group:
                data["group"] = group
            response = self._url_open(
                "POST",
                _COMMAND.UNSET_USER_OR_GROUP_POLICY,
                body=encrypt(
                    json.dumps(data).encode(),
                    self._provider.retrieve().secret_key,
                ),
                preload_content=False,
            )
            plain_data = decrypt(
                response, self._provider.retrieve().secret_key,
            )
            return plain_data.decode()
        raise ValueError("either user or group must be set")

    def config_get(self, key: str | None = None) -> str:
        """Get configuration parameters."""
        try:
            response = self._url_open(
                "GET",
                _COMMAND.GET_CONFIG,
                query_params={"key": key or "", "subSys": ""},
                preload_content=False,
            )
            if key is None:
                return response.read().decode()
            return decrypt(
                response, self._provider.retrieve().secret_key,
            ).decode()
        finally:
            if response:
                response.close()
                response.release_conn()

    def config_set(
            self,
            key: str,
            config: dict[str, str] | None = None,
    ) -> str:
        """Set configuration parameters."""
        data = [key]
        if config:
            data += [f"{name}={value}" for name, value in config.items()]
        body = " ".join(data).encode()
        response = self._url_open(
            "PUT",
            _COMMAND.SET_CONFIG,
            body=encrypt(body, self._provider.retrieve().secret_key),
        )
        return response.data.decode()

    def config_reset(self, key: str, name: str | None = None) -> str:
        """Reset configuration parameters."""
        if name:
            key += ":" + name
        body = key.encode()
        response = self._url_open(
            "DELETE",
            _COMMAND.DELETE_CONFIG,
            body=encrypt(body, self._provider.retrieve().secret_key),
        )
        return response.data.decode()

    def config_history(self) -> str:
        """Get historic configuration changes."""
        try:
            response = self._url_open(
                "GET",
                _COMMAND.LIST_CONFIG_HISTORY,
                query_params={"count": "10"},
                preload_content=False,
            )
            plain_text = decrypt(
                response, self._provider.retrieve().secret_key,
            )
            return plain_text.decode()
        finally:
            if response:
                response.close()
                response.release_conn()

    def config_restore(self, restore_id: str) -> str:
        """Restore to a specific configuration history."""
        response = self._url_open(
            "PUT",
            _COMMAND.RESOTRE_CONFIG_HISTORY,
            query_params={"restoreId": restore_id}
        )
        return response.data.decode()

    def profile_start(
            self,
            profilers: tuple[str] = cast(Tuple[str], ()),
    ) -> str:
        """Runs a system profile"""
        response = self._url_open(
            "POST",
            _COMMAND.START_PROFILE,
            query_params={"profilerType;": ",".join(profilers)},
        )
        return response.data.decode()

    def top_locks(self) -> str:
        """Get a list of the 10 oldest locks on a MinIO cluster."""
        response = self._url_open(
            "GET",
            _COMMAND.TOP_LOCKS,
        )
        return response.data.decode()

    def kms_key_create(self, key: str | None = None) -> str:
        """Create a new KMS master key."""
        response = self._url_open(
            "POST",
            _COMMAND.CREATE_KMS_KEY,
            query_params={"key-id": key or ""},
        )
        return response.data.decode()

    def kms_key_status(self, key: str | None = None) -> str:
        """Get status information of a KMS master key."""
        response = self._url_open(
            "GET",
            _COMMAND.GET_KMS_KEY_STATUS,
            query_params={"key-id": key or ""}
        )
        return response.data.decode()

    def add_site_replication(self, peer_sites: list[PeerSite]) -> str:
        """Add peer sites to site replication."""
        body = json.dumps(
            [peer_site.to_dict() for peer_site in peer_sites]).encode()
        response = self._url_open(
            "PUT",
            _COMMAND.SITE_REPLICATION_ADD,
            query_params={"api-version": "1"},
            body=encrypt(body, self._provider.retrieve().secret_key),
        )
        return response.data.decode()

    def get_site_replication_info(self) -> str:
        """Get site replication information."""
        response = self._url_open("GET", _COMMAND.SITE_REPLICATION_INFO)
        return response.data.decode()

    def get_site_replication_status(
            self,
            options: SiteReplicationStatusOptions,
    ) -> str:
        """Get site replication information."""
        response = self._url_open(
            "GET",
            _COMMAND.SITE_REPLICATION_STATUS,
            query_params=cast(DictType, options.to_query_params()),
        )
        return response.data.decode()

    def edit_site_replication(self, peer_info: PeerInfo) -> str:
        """Edit site replication with given peer information."""
        body = json.dumps(peer_info.to_dict()).encode()
        response = self._url_open(
            "PUT",
            _COMMAND.SITE_REPLICATION_EDIT,
            query_params={"api-version": "1"},
            body=encrypt(body, self._provider.retrieve().secret_key),
        )
        return response.data.decode()

    def remove_site_replication(
            self,
            sites: str | None = None,
            all_sites: bool = False,
    ) -> str:
        """Remove given sites or all sites from site replication."""
        data = {}
        if all_sites:
            data.update({"all": "True"})
        elif sites:
            data.update({"sites": sites or ""})
        else:
            raise ValueError("either sites or all flag must be given")
        body = json.dumps(data).encode()
        response = self._url_open(
            "PUT",
            _COMMAND.SITE_REPLICATION_REMOVE,
            query_params={"api-version": "1"},
            body=encrypt(body, self._provider.retrieve().secret_key),
        )
        return response.data.decode()

    def bucket_quota_set(self, bucket: str, size: int) -> str:
        """Set bucket quota configuration."""
        body = json.dumps({"quota": size, "quotatype": "hard"}).encode()
        response = self._url_open(
            "PUT",
            _COMMAND.SET_BUCKET_QUOTA,
            query_params={"bucket": bucket},
            body=body
        )
        return response.data.decode()

    def bucket_quota_clear(self, bucket: str) -> str:
        """Clear bucket quota configuration."""
        return self.bucket_quota_set(bucket, 0)

    def bucket_quota_get(self, bucket: str) -> str:
        """Get bucket quota configuration."""
        response = self._url_open(
            "GET",
            _COMMAND.GET_BUCKET_QUOTA,
            query_params={"bucket": bucket}
        )
        return response.data.decode()

    def get_data_usage_info(self):
        """Get data usage info"""
        response = self._url_open(
            "GET",
            _COMMAND.DATA_USAGE_INFO,
        )
        return response.data.decode()

    def get_service_account(self, access_key: str) -> str:
        """Get information about service account"""
        response = self._url_open(
            "GET",
            _COMMAND.SERVICE_ACCOUNT_INFO,
            query_params={"accessKey": access_key},
            preload_content=False,
        )
        plain_data = decrypt(
            response, self._provider.retrieve().secret_key,
        )
        return plain_data.decode()

    def list_service_account(self, user: str) -> str:
        """List service accounts of user"""
        response = self._url_open(
            "GET",
            _COMMAND.SERVICE_ACCOUNT_LIST,
            query_params={"user": user},
            preload_content=False,
        )
        plain_data = decrypt(
            response, self._provider.retrieve().secret_key,
        )
        return plain_data.decode()

    def add_service_account(self,
                            access_key: str | None = None,
                            secret_key: str | None = None,
                            name: str | None = None,
                            description: str | None = None,
                            policy_file: str | None = None,
                            expiration: str | None = None,
                            status: str | None = None) -> str:
        """
        Add a new service account with the given access key and secret key
        """
        if (access_key is None) ^ (secret_key is None):
            raise ValueError("both access key and secret key must be provided")
        if access_key == "" or secret_key == "":
            raise ValueError("access key or secret key must not be empty")
        data = {
            "status": "enabled",
            "accessKey": access_key,
            "secretKey": secret_key,
        }
        if name:
            data["name"] = name
        if description:
            data["description"] = description
        if policy_file:
            with open(policy_file, encoding="utf-8") as file:
                data["policy"] = json.load(file)
        if expiration:
            data["expiration"] = expiration
        if status:
            data["status"] = status

        body = json.dumps(data).encode()
        response = self._url_open(
            "PUT",
            _COMMAND.SERVICE_ACCOUNT_ADD,
            body=encrypt(body, self._provider.retrieve().secret_key),
            preload_content=False,
        )
        plain_data = decrypt(
            response, self._provider.retrieve().secret_key,
        )
        return plain_data.decode()

    def update_service_account(self,
                               access_key: str,
                               secret_key: str | None = None,
                               name: str | None = None,
                               description: str | None = None,
                               policy_file: str | None = None,
                               expiration: str | None = None,
                               status: str | None = None) -> str:
        """Update an existing service account"""
        args = [secret_key, name, description, policy_file, expiration, status]
        if not any(arg for arg in args):
            raise ValueError("at least one of secret_key, name, description, "
                             "policy_file, expiration or status must be "
                             "specified")
        data = {}
        if secret_key:
            data["newSecretKey"] = secret_key
        if name:
            data["newName"] = name
        if description:
            data["newDescription"] = description
        if policy_file:
            with open(policy_file, encoding="utf-8") as file:
                data["newPolicy"] = json.load(file)
        if expiration:
            data["newExpiration"] = expiration
        if status:
            data["newStatus"] = status

        body = json.dumps(data).encode()
        response = self._url_open(
            "POST",
            _COMMAND.SERVICE_ACCOUNT_UPDATE,
            query_params={"accessKey": access_key},
            body=encrypt(body, self._provider.retrieve().secret_key),
        )
        return response.data.decode()

    def delete_service_account(self, access_key: str) -> str:
        """Delete a service account"""
        response = self._url_open(
            "DELETE",
            _COMMAND.SERVICE_ACCOUNT_DELETE,
            query_params={"accessKey": access_key},
        )
        return response.data.decode()
