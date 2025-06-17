import pytest

from mcp_server_time.server import TimeServer


class TestDateOperations:
    """Test date calculation and day of week operations"""

    @pytest.mark.parametrize(
        "date_str,days,timezone,expected",
        [
            # Basic date addition
            (
                "May 25, 2025",
                5,
                "America/New_York",
                {
                    "input_date": "May 25, 2025",
                    "days_added": 5,
                    "result_date": "May 30, 2025",
                    "day_of_week": "Friday",
                    "calculation_details": "Added 5 days to May 25, 2025",
                },
            ),
            # Date subtraction
            (
                "2025-05-25",
                -10,
                "Europe/London",
                {
                    "input_date": "May 25, 2025",
                    "days_added": -10,
                    "result_date": "May 15, 2025",
                    "day_of_week": "Thursday",
                    "calculation_details": "Subtracted 10 days from May 25, 2025",
                },
            ),
            # Month boundary crossing
            (
                "05/31/2025",
                1,
                "Asia/Tokyo",
                {
                    "input_date": "May 31, 2025",
                    "days_added": 1,
                    "result_date": "June 01, 2025",
                    "day_of_week": "Sunday",
                    "calculation_details": "Added 1 days to May 31, 2025",
                },
            ),
            # Year boundary crossing
            (
                "2024-12-31",
                1,
                "UTC",
                {
                    "input_date": "December 31, 2024",
                    "days_added": 1,
                    "result_date": "January 01, 2025",
                    "day_of_week": "Wednesday",
                    "calculation_details": "Added 1 days to December 31, 2024",
                },
            ),
            # Leap year handling
            (
                "February 28, 2024",
                1,
                "America/Los_Angeles",
                {
                    "input_date": "February 28, 2024",
                    "days_added": 1,
                    "result_date": "February 29, 2024",
                    "day_of_week": "Thursday",
                    "calculation_details": "Added 1 days to February 28, 2024",
                },
            ),
        ],
    )
    def test_calculate_date(self, date_str, days, timezone, expected):
        time_server = TimeServer()
        result = time_server.calculate_date(date_str, days, timezone)

        assert result.input_date == expected["input_date"]
        assert result.days_added == expected["days_added"]
        assert result.result_date == expected["result_date"]
        assert result.day_of_week == expected["day_of_week"]
        assert result.calculation_details == expected["calculation_details"]

    def test_calculate_date_invalid_date_format(self):
        time_server = TimeServer()
        with pytest.raises(ValueError, match="Could not parse date"):
            time_server.calculate_date("invalid date", 5, "UTC")

    @pytest.mark.parametrize(
        "date_str,expected",
        [
            (
                "May 25, 2025",
                {
                    "date": "May 25, 2025",
                    "day_of_week": "Sunday",
                    "day_number": 6,  # 0=Monday, 6=Sunday
                },
            ),
            (
                "2025-01-01",
                {
                    "date": "January 01, 2025",
                    "day_of_week": "Wednesday",
                    "day_number": 2,
                },
            ),
            (
                "12/25/2024",
                {
                    "date": "December 25, 2024",
                    "day_of_week": "Wednesday",
                    "day_number": 2,
                },
            ),
            (
                "February 29, 2024",  # Leap year
                {
                    "date": "February 29, 2024",
                    "day_of_week": "Thursday",
                    "day_number": 3,
                },
            ),
        ],
    )
    def test_get_day_of_week(self, date_str, expected):
        time_server = TimeServer()
        result = time_server.get_day_of_week(date_str)

        assert result.date == expected["date"]
        assert result.day_of_week == expected["day_of_week"]
        assert result.day_number == expected["day_number"]

    def test_get_day_of_week_invalid_date(self):
        time_server = TimeServer()
        with pytest.raises(ValueError, match="Could not parse date"):
            time_server.get_day_of_week("not a valid date")

    @pytest.mark.parametrize(
        "date_format,date_str",
        [
            ("%Y-%m-%d", "2025-05-25"),
            ("%B %d, %Y", "May 25, 2025"),
            ("%b %d, %Y", "May 25, 2025"),
            ("%d/%m/%Y", "25/05/2025"),
            ("%m/%d/%Y", "05/25/2025"),
            ("%Y/%m/%d", "2025/05/25"),
        ],
    )
    def test_date_format_support(self, date_format, date_str):
        """Test that various date formats are supported"""
        time_server = TimeServer()

        # Test calculate_date
        result = time_server.calculate_date(date_str, 1, "UTC")
        assert result.result_date == "May 26, 2025"

        # Test get_day_of_week
        result = time_server.get_day_of_week(date_str)
        assert result.day_of_week == "Sunday"
