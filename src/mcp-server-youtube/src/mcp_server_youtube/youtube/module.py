import json
import logging
from functools import lru_cache
from typing import Any

# --- Third-party Imports ---
from googleapiclient.discovery import Resource, build
from googleapiclient.errors import HttpError
from mcp_server_youtube.youtube.config import (YouTubeApiError,
                                               YouTubeClientError,
                                               YouTubeConfig,
                                               YouTubeTranscriptError)
from mcp_server_youtube.youtube.models import YouTubeVideo
from youtube_transcript_api import (NoTranscriptFound, TranscriptsDisabled,
                                    YouTubeTranscriptApi)

# --- Setup Logger ---
logger = logging.getLogger(__name__)


# --- YouTubeSearcher Class ---
class YouTubeSearcher:
    """
    Searches YouTube for videos based on a query and fetches their transcripts.

    Handles interaction with the YouTube Data API v3 and YouTube Transcript API.
    """

    def __init__(self, config: YouTubeConfig):
        """
        Initializes the YouTubeSearcher.

        Args:
            config: The YouTube configuration settings

        Raises:
            YouTubeClientError: If the API service initialization fails.
        """
        self.config = config
        self.youtube_service: Resource = self._initialize_yt_service()
        self.max_transcript_preview = 500

    def _initialize_yt_service(self) -> Resource:
        """
        Initialize the YouTube Data API service.

        Returns:
            The initialized YouTube Data API service.

        Raises:
            YouTubeClientError: If the API service initialization fails.
        """
        try:
            # Build the YouTube Data API service object
            service = build("youtube", "v3", developerKey=self.config.api_key)
            logger.debug("YouTube Data API service initialized successfully.")
            return service
        except Exception as e:
            msg = f"Failed to initialize YouTube Data API service: {e}"
            logger.exception(msg)
            raise YouTubeClientError(msg) from e

    def search_videos(
        self, query: str, max_results: int = 15, language: str = "en"
    ) -> list[YouTubeVideo]:
        """
        Performs the video search using the YouTube Data API and fetches transcripts.

        Args:
            query: The search term for YouTube videos.
            max_results: Maximum number of results to return.
            language: The preferred language code for the transcript.

        Returns:
            A list of YouTubeVideo objects with video details and transcripts.

        Raises:
            YouTubeApiError: If a YouTube Data API error occurs.
            YouTubeTranscriptError: If a transcript retrieval error occurs.
            YouTubeClientError: For other unexpected errors during the search.
        """
        try:
            logger.info(
                f"Searching YouTube for query: '{query}' with max_results={max_results}"
            )
            search_response = (
                self.youtube_service.search()
                .list(q=query, part="id,snippet", maxResults=max_results, type="video")
                .execute()
            )

            found_videos = []
            if "items" in search_response:
                for search_item in search_response.get("items", []):
                    # Double-check kind just in case API behavior changes
                    if search_item.get("id", {}).get("kind") == "youtube#video":
                        snippet = search_item.get("snippet", {})
                        video_id = search_item.get("id", {}).get("videoId")

                        if video_id:
                            video = YouTubeVideo(
                                video_id=video_id,
                                title=snippet.get("title", "N/A"),
                                description=snippet.get("description", ""),
                                channel=snippet.get("channelTitle", "N/A"),
                                published_at=snippet.get("publishedAt", "N/A"),
                                thumbnail=snippet.get("thumbnails", {})
                                .get("default", {})
                                .get("url", "N/A"),
                                transcript=self._get_transcript_by_id(
                                    video_id, language
                                ),
                            )
                            found_videos.append(video)
                        else:
                            logger.warning(
                                f"Search item found without a videoId: {search_item}"
                            )

            logger.info(f"Found {len(found_videos)} video(s) for query: '{query}'")
            return found_videos

        except HttpError as e:
            error_details = {}
            try:
                error_content = e.content.decode("utf-8")
                error_details = json.loads(error_content)
                error_message = error_details.get("error", {}).get(
                    "message", error_content
                )
            except (json.JSONDecodeError, UnicodeDecodeError):
                error_message = str(e)

            status_code = e.resp.status
            msg = f"YouTube API search failed: {error_message}"
            logger.error(f"{msg} (HTTP Status: {status_code})", exc_info=True)
            raise YouTubeApiError(
                msg, status_code=status_code, details=error_details
            ) from e

        except Exception as e:
            # Catch-all for other unexpected errors during search/transcript process
            msg = f"An unexpected error occurred during YouTube search or transcript retrieval: {e}"
            logger.exception(msg)
            raise YouTubeClientError(msg) from e

    def _get_transcript_by_id(self, video_id: str, language: str) -> str:
        """
        Fetches the transcript for a given YouTube video ID.

        Args:
            video_id: The unique ID of the YouTube video.
            language: The preferred language code for the transcript.

        Returns:
            A string containing the transcript data.

        Raises:
            YouTubeTranscriptError: If the transcript cannot be fetched.
        """
        logger.debug(
            f"Attempting to fetch transcript for video ID: {video_id} in language: {language}"
        )
        try:
            # Fetch the transcript list and try the specified language
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
            transcript = transcript_list.find_transcript([language])

            # Fetch the actual transcript data
            transcript_entries = transcript.fetch()

            transcript_text = "\n".join([entry["text"] for entry in transcript_entries])
            logger.info(f"Successfully fetched transcript for video ID: {video_id}")
            return transcript_text

        except TranscriptsDisabled as e:
            msg = f"Transcripts are disabled for video ID: {video_id}"
            logger.warning(msg)
            raise YouTubeTranscriptError(video_id=video_id, message=msg) from e

        except NoTranscriptFound as e:
            msg = (
                f"No transcript found for video ID {video_id} in language '{language}'."
            )
            logger.warning(msg)
            raise YouTubeTranscriptError(video_id=video_id, message=msg) from e

        except Exception as e:
            msg = f"Could not retrieve transcript for video ID {video_id}: {e}"
            logger.exception(msg)
            raise YouTubeTranscriptError(video_id=video_id, message=msg) from e


@lru_cache(maxsize=1)
def get_youtube_searcher() -> YouTubeSearcher:
    """Get a cached instance of YouTubeSearcher."""
    config = YouTubeConfig()
    searcher = YouTubeSearcher(config)
    return searcher
