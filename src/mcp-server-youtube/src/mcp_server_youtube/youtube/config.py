from pydantic_settings import BaseSettings, SettingsConfigDict

# --- Configuration and Error Classes --- #


class YouTubeClientError(Exception):
    """Base exception for YouTube client errors."""

    pass


class YouTubeApiError(YouTubeClientError):
    """Exception raised for errors during YouTube Data API calls."""

    def __init__(
        self, message: str, status_code: int | None = None, details: dict | None = None
    ):
        super().__init__(message)
        self.status_code = status_code
        self.details = details or {}

    def __str__(self) -> str:
        base = super().__str__()
        if self.status_code:
            return f"{base} (HTTP Status: {self.status_code})"
        return base


class YouTubeTranscriptError(YouTubeClientError):
    """Exception raised for errors during transcript retrieval."""

    def __init__(self, video_id: str, message: str):
        self.video_id = video_id
        super().__init__(f"Transcript error for video {video_id}: {message}")


class YouTubeConfig(BaseSettings):
    """
    Configuration for connecting to YouTube Data API services.
    Reads from environment variables prefixed with YOUTUBE_.
    """

    model_config = SettingsConfigDict(
        env_prefix="YOUTUBE_",
        env_file=".env",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
    )

    # API configuration
    api_key: str

    # Service configuration
    default_language: str = "en"
