import logging
import os
from typing import Optional, Dict, List

import spotipy
from dotenv import load_dotenv
from spotipy.cache_handler import CacheFileHandler
from spotipy.oauth2 import SpotifyOAuth

from . import utils

load_dotenv()

CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")
REDIRECT_URI = os.getenv("SPOTIFY_REDIRECT_URI")

SCOPES = ["user-read-currently-playing", "user-read-playback-state", "user-read-currently-playing",  # spotify connect
          "app-remote-control", "streaming",  # playback
          "playlist-read-private", "playlist-read-collaborative", "playlist-modify-private", "playlist-modify-public",
          # playlists
          "user-read-playback-position", "user-top-read", "user-read-recently-played",  # listening history
          "user-library-modify", "user-library-read",  # library
          ]


class Client:
    def __init__(self, logger: logging.Logger):
        """Initialize Spotify client with necessary permissions"""
        self.logger = logger

        scope = "user-library-read,user-read-playback-state,user-modify-playback-state,user-read-currently-playing"

        try:
            self.sp = spotipy.Spotify(auth_manager=SpotifyOAuth(
                scope=scope,
                client_id=CLIENT_ID,
                client_secret=CLIENT_SECRET,
                redirect_uri=REDIRECT_URI))

            self.auth_manager: SpotifyOAuth = self.sp.auth_manager
            self.cache_handler: CacheFileHandler = self.auth_manager.cache_handler
        except Exception as e:
            self.logger.error(f"Failed to initialize Spotify client: {str(e)}", exc_info=True)
            raise

    def search(self, query: str, qtype: str = 'track', limit=10):
        """
        Searches based of query term.
        - query: query term
        - qtype: the types of items to return. One or more of 'artist', 'album',  'track', 'playlist'.
                 If multiple types are desired, pass in a comma separated string; e.g. 'track,album'
        - limit: max # items to return
        """
        results = self.sp.search(q=query, limit=limit, type=qtype)
        return utils.parse_search_results(results, qtype)


    def recommendations(self, artists: Optional[List] = None, tracks: Optional[List] = None, limit=20):
        recs = self.sp.recommendations(seed_artists=artists, seed_tracks=tracks, limit=limit)
        return recs


    def get_info(self, item_id: str, qtype: str = 'track') -> dict:
        """
        Returns more info about item.
        - item_id: id.
        - qtype: Either 'track', 'album', 'artist', or 'playlist'.
        """
        match qtype:
            case 'track':
                return utils.parse_track(self.sp.track(item_id), detailed=True)
            case 'album':
                album_info = utils.parse_album(self.sp.album(item_id), detailed=True)
                return album_info

            case 'artist':
                artist_info = utils.parse_artist(self.sp.artist(item_id), detailed=True)
                albums = self.sp.artist_albums(item_id)
                top_tracks = self.sp.artist_top_tracks(item_id)['tracks']
                albums_and_tracks = {
                    'albums': albums,
                    'tracks': {'items': top_tracks}
                }
                parsed_info = utils.parse_search_results(albums_and_tracks, qtype="album,track")
                artist_info['top_tracks'] = parsed_info['tracks']
                artist_info['albums'] = parsed_info['albums']

                return artist_info
            case 'playlist':
                playlist = self.sp.playlist(item_id)
                playlist_info = utils.parse_playlist(playlist, detailed=True)

                return playlist_info

        raise ValueError(f"uknown qtype {qtype}")

    def get_current_track(self) -> Optional[Dict]:
        """Get information about the currently playing track"""
        try:
            # current_playback vs current_user_playing_track?
            current = self.sp.current_user_playing_track()
            if not current:
                self.logger.info("No playback session found")
                return None
            if current.get('currently_playing_type') != 'track':
                self.logger.info("Current playback is not a track")
                return None

            track_info = utils.parse_track(current['item'])
            self.logger.info(
                f"Current track: {track_info.get('name', 'Unknown')} by {track_info.get('artist', 'Unknown')}")
            return track_info
        except Exception as e:
            self.logger.error("Error getting current track info", exc_info=True)
            raise

    @utils.validate
    def start_playback(self, track_id=None, device=None):
        """
        Starts track playback. If track_id is omitted, resumes current playback.
        - track_id: ID of track to play, or None.
        """
        try:
            if not track_id and self.is_track_playing():
                self.logger.info("No track_id ID provided and playback already active.")
                return

            uris = [f'spotify:track:{track_id}'] if track_id else None
            device_id = device.get('id') if device else None

            result = self.sp.start_playback(uris=uris, device_id=device_id)
            self.logger.info(f"Playback started successfully{' for track_id: ' + track_id if track_id else ''}")
            return result
        except Exception as e:
            self.logger.error(f"Error starting playback: {str(e)}", exc_info=True)
            raise

    @utils.validate
    def pause_playback(self, device=None):
        """Pauses playback."""
        playback = self.sp.current_playback()
        if playback and playback.get('is_playing'):
            self.sp.pause_playback(device.get('id') if device else None)

    @utils.validate
    def add_to_queue(self, track_id: str, device=None):
        """
        Adds track to queue.
        - track_id: ID of track to play.
        """
        self.sp.add_to_queue(track_id, device.get('id') if device else None)

    def get_queue(self):
        """Returns the current queue of tracks."""
        return self.sp.queue()

    def get_liked_songs(self):
        # todo
        results = self.sp.current_user_saved_tracks()
        for idx, item in enumerate(results['items']):
            track = item['track']
            print(idx, track['artists'][0]['name'], " – ", track['name'])

    def is_track_playing(self) -> bool:
        """Returns if a track is actively playing."""
        curr_track = self.get_current_track()
        if not curr_track:
            return False
        if curr_track.get('is_playing'):
            return True
        return False

    def get_devices(self) -> dict:
        return self.sp.devices()['devices']

    def is_active_device(self):
        return any([device.get('is_active') for device in self.get_devices()])

    def _get_candidate_device(self):
        devices = self.get_devices()
        for device in devices:
            if device.get('is_active'):
                return device
        self.logger.info(f"No active device, assigning {devices[0]['name']}.")
        return devices[0]

    def auth_ok(self) -> bool:
        try:
            result = self.auth_manager.is_token_expired(self.cache_handler.get_cached_token())
            self.logger.info(f"Auth check result: {'valid' if not result else 'expired'}")
            return result
        except Exception as e:
            self.logger.error(f"Error checking auth status: {str(e)}", exc_info=True)
            raise

    def auth_refresh(self):
        self.auth_manager.validate_token(self.cache_handler.get_cached_token())

    def skip_track(self, n=1):
        for _ in range(n):
            self.sp.next_track()

    def previous_track(self):
        self.sp.previous_track()

    def seek_to_position(self, position_ms):
        self.sp.seek_track(position_ms=position_ms)

    def set_volume(self, volume_percent):
        self.sp.volume(volume_percent)
