
from freezegun import freeze_time
from mcp.shared.exceptions import McpError
import pytest
from unittest.mock import patch
from zoneinfo import ZoneInfo

from mcp_server_time.server import TimeServer, get_local_tz


@pytest.mark.parametrize(
    "test_time,timezone,expected",
    [
        # UTC+1 non-DST
        (
            "2024-01-01 12:00:00+00:00",
            "Europe/Warsaw",
            {
                "timezone": "Europe/Warsaw",
                "datetime": "2024-01-01T13:00:00+01:00",
                "is_dst": False,
            },
        ),
        # UTC non-DST
        (
            "2024-01-01 12:00:00+00:00",
            "Europe/London",
            {
                "timezone": "Europe/London",
                "datetime": "2024-01-01T12:00:00+00:00",
                "is_dst": False,
            },
        ),
        # UTC-5 non-DST
        (
            "2024-01-01 12:00:00-00:00",
            "America/New_York",
            {
                "timezone": "America/New_York",
                "datetime": "2024-01-01T07:00:00-05:00",
                "is_dst": False,
            },
        ),
        # UTC+1 DST
        (
            "2024-03-31 12:00:00+00:00",
            "Europe/Warsaw",
            {
                "timezone": "Europe/Warsaw",
                "datetime": "2024-03-31T14:00:00+02:00",
                "is_dst": True,
            },
        ),
        # UTC DST
        (
            "2024-03-31 12:00:00+00:00",
            "Europe/London",
            {
                "timezone": "Europe/London",
                "datetime": "2024-03-31T13:00:00+01:00",
                "is_dst": True,
            },
        ),
        # UTC-5 DST
        (
            "2024-03-31 12:00:00-00:00",
            "America/New_York",
            {
                "timezone": "America/New_York",
                "datetime": "2024-03-31T08:00:00-04:00",
                "is_dst": True,
            },
        ),
    ],
)
def test_get_current_time(test_time, timezone, expected):
    with freeze_time(test_time):
        time_server = TimeServer()
        result = time_server.get_current_time(timezone)
        assert result.timezone == expected["timezone"]
        assert result.datetime == expected["datetime"]
        assert result.is_dst == expected["is_dst"]


def test_get_current_time_with_invalid_timezone():
    time_server = TimeServer()
    with pytest.raises(
        McpError,
        match=r"Invalid timezone: 'No time zone found with key Invalid/Timezone'",
    ):
        time_server.get_current_time("Invalid/Timezone")


@pytest.mark.parametrize(
    "source_tz,time_str,target_tz,expected_error",
    [
        (
            "invalid_tz",
            "12:00",
            "Europe/London",
            "Invalid timezone: 'No time zone found with key invalid_tz'",
        ),
        (
            "Europe/Warsaw",
            "12:00",
            "invalid_tz",
            "Invalid timezone: 'No time zone found with key invalid_tz'",
        ),
        (
            "Europe/Warsaw",
            "25:00",
            "Europe/London",
            "Invalid time format. Expected HH:MM [24-hour format]",
        ),
    ],
)
def test_convert_time_errors(source_tz, time_str, target_tz, expected_error):
    time_server = TimeServer()
    with pytest.raises((McpError, ValueError), match=expected_error):
        time_server.convert_time(source_tz, time_str, target_tz)


@pytest.mark.parametrize(
    "test_time,source_tz,time_str,target_tz,expected",
    [
        # Basic case: Standard time conversion between Warsaw and London (1 hour difference)
        # Warsaw is UTC+1, London is UTC+0
        (
            "2024-01-01 00:00:00+00:00",
            "Europe/Warsaw",
            "12:00",
            "Europe/London",
            {
                "source": {
                    "timezone": "Europe/Warsaw",
                    "datetime": "2024-01-01T12:00:00+01:00",
                    "is_dst": False,
                },
                "target": {
                    "timezone": "Europe/London",
                    "datetime": "2024-01-01T11:00:00+00:00",
                    "is_dst": False,
                },
                "time_difference": "-1.0h",
            },
        ),
        # Reverse case of above: London to Warsaw conversion
        # Shows how time difference is positive when going east
        (
            "2024-01-01 00:00:00+00:00",
            "Europe/London",
            "12:00",
            "Europe/Warsaw",
            {
                "source": {
                    "timezone": "Europe/London",
                    "datetime": "2024-01-01T12:00:00+00:00",
                    "is_dst": False,
                },
                "target": {
                    "timezone": "Europe/Warsaw",
                    "datetime": "2024-01-01T13:00:00+01:00",
                    "is_dst": False,
                },
                "time_difference": "+1.0h",
            },
        ),
        # Edge case: Different DST periods between Europe and USA
        # Europe ends DST on Oct 27, while USA waits until Nov 3
        # This creates a one-week period where Europe is in standard time but USA still observes DST
        (
            "2024-10-28 00:00:00+00:00",
            "Europe/Warsaw",
            "12:00",
            "America/New_York",
            {
                "source": {
                    "timezone": "Europe/Warsaw",
                    "datetime": "2024-10-28T12:00:00+01:00",
                    "is_dst": False,
                },
                "target": {
                    "timezone": "America/New_York",
                    "datetime": "2024-10-28T07:00:00-04:00",
                    "is_dst": True,
                },
                "time_difference": "-5.0h",
            },
        ),
        # Follow-up to previous case: After both regions end DST
        # Shows how time difference increases by 1 hour when USA also ends DST
        (
            "2024-11-04 00:00:00+00:00",
            "Europe/Warsaw",
            "12:00",
            "America/New_York",
            {
                "source": {
                    "timezone": "Europe/Warsaw",
                    "datetime": "2024-11-04T12:00:00+01:00",
                    "is_dst": False,
                },
                "target": {
                    "timezone": "America/New_York",
                    "datetime": "2024-11-04T06:00:00-05:00",
                    "is_dst": False,
                },
                "time_difference": "-6.0h",
            },
        ),
        # Edge case: Nepal's unusual UTC+5:45 offset
        # One of the few time zones using 45-minute offset
        (
            "2024-01-01 00:00:00+00:00",
            "Europe/Warsaw",
            "12:00",
            "Asia/Kathmandu",
            {
                "source": {
                    "timezone": "Europe/Warsaw",
                    "datetime": "2024-01-01T12:00:00+01:00",
                    "is_dst": False,
                },
                "target": {
                    "timezone": "Asia/Kathmandu",
                    "datetime": "2024-01-01T16:45:00+05:45",
                    "is_dst": False,
                },
                "time_difference": "+4.75h",
            },
        ),
        # Reverse case for Nepal
        # Demonstrates how 45-minute offset works in opposite direction
        (
            "2024-01-01 00:00:00+00:00",
            "Asia/Kathmandu",
            "12:00",
            "Europe/Warsaw",
            {
                "source": {
                    "timezone": "Asia/Kathmandu",
                    "datetime": "2024-01-01T12:00:00+05:45",
                    "is_dst": False,
                },
                "target": {
                    "timezone": "Europe/Warsaw",
                    "datetime": "2024-01-01T07:15:00+01:00",
                    "is_dst": False,
                },
                "time_difference": "-4.75h",
            },
        ),
        # Edge case: Lord Howe Island's unique DST rules
        # One of the few places using 30-minute DST shift
        # During summer (DST), they use UTC+11
        (
            "2024-01-01 00:00:00+00:00",
            "Europe/Warsaw",
            "12:00",
            "Australia/Lord_Howe",
            {
                "source": {
                    "timezone": "Europe/Warsaw",
                    "datetime": "2024-01-01T12:00:00+01:00",
                    "is_dst": False,
                },
                "target": {
                    "timezone": "Australia/Lord_Howe",
                    "datetime": "2024-01-01T22:00:00+11:00",
                    "is_dst": True,
                },
                "time_difference": "+10.0h",
            },
        ),
        # Second Lord Howe Island case: During their standard time
        # Shows transition to UTC+10:30 after DST ends
        (
            "2024-04-07 00:00:00+00:00",
            "Europe/Warsaw",
            "12:00",
            "Australia/Lord_Howe",
            {
                "source": {
                    "timezone": "Europe/Warsaw",
                    "datetime": "2024-04-07T12:00:00+02:00",
                    "is_dst": True,
                },
                "target": {
                    "timezone": "Australia/Lord_Howe",
                    "datetime": "2024-04-07T20:30:00+10:30",
                    "is_dst": False,
                },
                "time_difference": "+8.5h",
            },
        ),
        # Edge case: Date line crossing with Samoa
        # Demonstrates how a single time conversion can result in a date change
        # Samoa is UTC+13, creating almost a full day difference with Warsaw
        (
            "2024-01-01 00:00:00+00:00",
            "Europe/Warsaw",
            "23:00",
            "Pacific/Apia",
            {
                "source": {
                    "timezone": "Europe/Warsaw",
                    "datetime": "2024-01-01T23:00:00+01:00",
                    "is_dst": False,
                },
                "target": {
                    "timezone": "Pacific/Apia",
                    "datetime": "2024-01-02T11:00:00+13:00",
                    "is_dst": False,
                },
                "time_difference": "+12.0h",
            },
        ),
        # Edge case: Iran's unusual half-hour offset
        # Demonstrates conversion with Iran's UTC+3:30 timezone
        (
            "2024-03-21 00:00:00+00:00",
            "Europe/Warsaw",
            "12:00",
            "Asia/Tehran",
            {
                "source": {
                    "timezone": "Europe/Warsaw",
                    "datetime": "2024-03-21T12:00:00+01:00",
                    "is_dst": False,
                },
                "target": {
                    "timezone": "Asia/Tehran",
                    "datetime": "2024-03-21T14:30:00+03:30",
                    "is_dst": False,
                },
                "time_difference": "+2.5h",
            },
        ),
        # Edge case: Venezuela's unusual -4:30 offset (historical)
        # In 2016, Venezuela moved from -4:30 to -4:00
        # Useful for testing historical dates
        (
            "2016-04-30 00:00:00+00:00",  # Just before the change
            "Europe/Warsaw",
            "12:00",
            "America/Caracas",
            {
                "source": {
                    "timezone": "Europe/Warsaw",
                    "datetime": "2016-04-30T12:00:00+02:00",
                    "is_dst": True,
                },
                "target": {
                    "timezone": "America/Caracas",
                    "datetime": "2016-04-30T05:30:00-04:30",
                    "is_dst": False,
                },
                "time_difference": "-6.5h",
            },
        ),
        # Edge case: Israel's variable DST
        # Israel's DST changes don't follow a fixed pattern
        # They often change dates year-to-year based on Hebrew calendar
        (
            "2024-10-27 00:00:00+00:00",
            "Europe/Warsaw",
            "12:00",
            "Asia/Jerusalem",
            {
                "source": {
                    "timezone": "Europe/Warsaw",
                    "datetime": "2024-10-27T12:00:00+01:00",
                    "is_dst": False,
                },
                "target": {
                    "timezone": "Asia/Jerusalem",
                    "datetime": "2024-10-27T13:00:00+02:00",
                    "is_dst": False,
                },
                "time_difference": "+1.0h",
            },
        ),
        # Edge case: Antarctica/Troll station
        # Only timezone that uses UTC+0 in winter and UTC+2 in summer
        # One of the few zones with exactly 2 hours DST difference
        (
            "2024-03-31 00:00:00+00:00",
            "Europe/Warsaw",
            "12:00",
            "Antarctica/Troll",
            {
                "source": {
                    "timezone": "Europe/Warsaw",
                    "datetime": "2024-03-31T12:00:00+02:00",
                    "is_dst": True,
                },
                "target": {
                    "timezone": "Antarctica/Troll",
                    "datetime": "2024-03-31T12:00:00+02:00",
                    "is_dst": True,
                },
                "time_difference": "+0.0h",
            },
        ),
        # Edge case: Kiribati date line anomaly
        # After skipping Dec 31, 1994, eastern Kiribati is UTC+14
        # The furthest forward timezone in the world
        (
            "2024-01-01 00:00:00+00:00",
            "Europe/Warsaw",
            "23:00",
            "Pacific/Kiritimati",
            {
                "source": {
                    "timezone": "Europe/Warsaw",
                    "datetime": "2024-01-01T23:00:00+01:00",
                    "is_dst": False,
                },
                "target": {
                    "timezone": "Pacific/Kiritimati",
                    "datetime": "2024-01-02T12:00:00+14:00",
                    "is_dst": False,
                },
                "time_difference": "+13.0h",
            },
        ),
        # Edge case: Chatham Islands, New Zealand
        # Uses unusual 45-minute offset AND observes DST
        # UTC+12:45 in standard time, UTC+13:45 in DST
        (
            "2024-01-01 00:00:00+00:00",
            "Europe/Warsaw",
            "12:00",
            "Pacific/Chatham",
            {
                "source": {
                    "timezone": "Europe/Warsaw",
                    "datetime": "2024-01-01T12:00:00+01:00",
                    "is_dst": False,
                },
                "target": {
                    "timezone": "Pacific/Chatham",
                    "datetime": "2024-01-02T00:45:00+13:45",
                    "is_dst": True,
                },
                "time_difference": "+12.75h",
            },
        ),
    ],
)
def test_convert_time(test_time, source_tz, time_str, target_tz, expected):
    with freeze_time(test_time):
        time_server = TimeServer()
        result = time_server.convert_time(source_tz, time_str, target_tz)

        assert result.source.timezone == expected["source"]["timezone"]
        assert result.target.timezone == expected["target"]["timezone"]
        assert result.source.datetime == expected["source"]["datetime"]
        assert result.target.datetime == expected["target"]["datetime"]
        assert result.source.is_dst == expected["source"]["is_dst"]
        assert result.target.is_dst == expected["target"]["is_dst"]
        assert result.time_difference == expected["time_difference"]


def test_get_local_tz_with_override():
    """Test that timezone override works correctly."""
    result = get_local_tz("America/New_York")
    assert str(result) == "America/New_York"
    assert isinstance(result, ZoneInfo)


def test_get_local_tz_with_invalid_override():
    """Test that invalid timezone override raises an error."""
    with pytest.raises(Exception):  # ZoneInfo will raise an exception
        get_local_tz("Invalid/Timezone")


@patch('mcp_server_time.server.get_localzone_name')
def test_get_local_tz_with_valid_iana_name(mock_get_localzone):
    """Test that valid IANA timezone names from tzlocal work correctly."""
    mock_get_localzone.return_value = "Europe/London"
    result = get_local_tz()
    assert str(result) == "Europe/London"
    assert isinstance(result, ZoneInfo)


@patch('mcp_server_time.server.get_localzone_name')
def test_get_local_tz_when_none_returned(mock_get_localzone):
    """Test default to UTC when tzlocal returns None."""
    mock_get_localzone.return_value = None
    result = get_local_tz()
    assert str(result) == "UTC"


@patch('mcp_server_time.server.get_localzone_name')
def test_get_local_tz_handles_windows_timezones(mock_get_localzone):
    """Test that tzlocal properly handles Windows timezone names.
    
    Note: tzlocal should convert Windows names like 'Pacific Standard Time'
    to proper IANA names like 'America/Los_Angeles'.
    """
    # tzlocal should return IANA names even on Windows
    mock_get_localzone.return_value = "America/Los_Angeles"
    result = get_local_tz()
    assert str(result) == "America/Los_Angeles"
    assert isinstance(result, ZoneInfo)


@pytest.mark.parametrize(
    "timezone_name",
    [
        "America/New_York",
        "Europe/Paris", 
        "Asia/Tokyo",
        "Australia/Sydney",
        "Africa/Cairo",
        "America/Sao_Paulo",
        "Pacific/Auckland",
        "UTC",
    ],
)
@patch('mcp_server_time.server.get_localzone_name')
def test_get_local_tz_various_timezones(mock_get_localzone, timezone_name):
    """Test various timezone names that tzlocal might return."""
    mock_get_localzone.return_value = timezone_name
    result = get_local_tz()
    assert str(result) == timezone_name
    assert isinstance(result, ZoneInfo)
