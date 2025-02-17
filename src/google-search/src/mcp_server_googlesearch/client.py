from typing import Any, Dict, List, Optional, TypedDict, Unpack

from pydantic import BaseModel, ConfigDict, Field, SecretStr, model_validator


class CustomSearchParamsDict(TypedDict):
    """
    Extra parameters for Custom Search Engine.

    Refer to https://developers.google.com/custom-search/v1/reference/rest/v1/cse/list for possible parameters.
    """

    num: Optional[int]  # Number of search results to return
    start: Optional[int]  # The index of the first result to return
    gl: Optional[str]  # Geolocation of the search
    hl: Optional[str]  # Interface language (host language)
    cr: Optional[str]  # Country restrict to narrow search
    dateRestrict: Optional[str]  # Restricts results to URLs based on date
    exactTerms: Optional[str]  # Identifies a phrase that all documents must contain
    excludeTerms: Optional[
        str
    ]  # Identifies a word or phrase that should not appear in any documents
    fileType: Optional[str]  # Returns only results of specified filetype
    filter: Optional[str]  # Controls turning on or off the duplicate content filter
    googlehost: Optional[str]  # The Google domain to use to search
    highRange: Optional[str]  # Specifies the ending value for a range search
    linkSite: Optional[
        str
    ]  # Specifies that all search results should contain a link to a particular URL
    lowRange: Optional[str]  # Specifies the starting value for a range search
    lr: Optional[str]  # The language restriction for the search
    orTerms: Optional[
        str
    ]  # Provides additional search terms to check for in a document
    relatedSite: Optional[
        str
    ]  # Specifies that all search results should be pages that are related to the specified URL
    safe: Optional[str]  # Search safety level
    siteSearch: Optional[
        str
    ]  # Specifies a given site which should always be included or excluded from results
    siteSearchFilter: Optional[
        str
    ]  # Controls whether to include or exclude results from the site named in the siteSearch parameter
    sort: Optional[str]  # The sort expression to use to sort the results


class SearchMetadataResult(BaseModel):
    """A search result from Google Custom Search Engine."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(description="The title of the search result.")
    link: str = Field(description="The link to the search result.")
    snippet: str = Field(description="The snippet of the search result.")


class CustomGoogleSearchClient(BaseModel):
    """Wrapper for Google Search API.

    Adapted from: Instructions adapted from https://stackoverflow.com/questions/37083058/programmatically-searching-google-in-python-using-custom-search

    TODO: DOCS for using it
    1. Install google-api-python-client
    - If you don't already have a Google account, sign up.
    - If you have never created a Google APIs Console project,
    read the Managing Projects page and create a project in the Google API Console.
    - Install the library using pip install google-api-python-client

    2. Enable the Custom Search API
    - Navigate to the APIs & Services→Dashboard panel in Cloud Console.
    - Click Enable APIs and Services.
    - Search for Custom Search API and click on it.
    - Click Enable.
    URL for it: https://console.cloud.google.com/apis/library/customsearch.googleapis
    .com

    3. To create an API key:
    - Navigate to the APIs & Services → Credentials panel in Cloud Console.
    - Select Create credentials, then select API key from the drop-down menu.
    - The API key created dialog box displays your newly created key.
    - You now have an API_KEY

    Alternatively, you can just generate an API key here:
    https://developers.google.com/custom-search/docs/paid_element#api_key

    4. Setup Custom Search Engine so you can search the entire web
    - Create a custom search engine here: https://programmablesearchengine.google.com/.
    - In `What to search` to search, pick the `Search the entire Web` option.
    After search engine is created, you can click on it and find `Search engine ID`
      on the Overview page.

    """

    service: Any = None  #: :meta private:
    google_api_key: Optional[SecretStr] = Field(
        ..., description="The API key for the Google Search API."
    )
    google_cse_id: Optional[SecretStr] = Field(
        ..., description="The Custom Search Engine ID for the Google Search API."
    )
    siterestrict: bool = False

    model_config = ConfigDict(
        extra="forbid",
    )

    def _google_search_results(
        self, search_term: str, **kwargs: Any
    ) -> List[dict]:
        cse = self.service.cse()
        if self.siterestrict:
            cse = cse.siterestrict()
        res = cse.list(
            q=search_term, cx=self.google_cse_id.get_secret_value(), **kwargs
        ).execute()
        return res.get("items", [])

    @model_validator(mode="before")
    @classmethod
    def set_service(cls, values: Dict) -> Any:
        """Set the service for the GoogleSearchAPIWrapper."""
        # Get the google_api_key
        google_api_key = values.get("google_api_key")
        if isinstance(google_api_key, SecretStr):
            google_api_key = google_api_key.get_secret_value()
        # Check if google-api-python-client is installed
        try:
            from googleapiclient.discovery import build  # type: ignore[import]

        except ImportError:
            raise ImportError(
                "google-api-python-client is not installed. "
                "Please install it with `pip install google-api-python-client`"
            )
        # Set the service
        service = build("customsearch", "v1", developerKey=google_api_key)
        values["service"] = service
        return values

    async def search(
        self,
        query: str,
        **search_params: Unpack[CustomSearchParamsDict],
    ) -> Optional[List[SearchMetadataResult]]:
        """Run query through GoogleSearch and return metadata.

        Args:
            query: The query to search for.
            num_results: The number of results to return.
            **search_params: Parameters to be passed on search.
                Refer to `CustomSearchParamsDict` for possible parameters.

        Returns:
            A list of `SearchMetadataResult` or None if no results are found.
        """
        results = self._google_search_results(query, **(search_params or {}))
        # If no results, return None
        if len(results) == 0:
            return None
        # If there are results, parse them
        metadata_results = []
        for result in results:
            metadata_result = SearchMetadataResult(
                title=result["title"],
                link=result["link"],
                snippet=result.get("snippet", ""),
            )
            metadata_results.append(metadata_result)
        return metadata_results
