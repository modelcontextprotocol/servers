from typing import Optional
from qdrant_client import AsyncQdrantClient, models


class QdrantConnector:
    """
    Encapsulates the connection to a Qdrant server and all the methods to interact with it.
    :param qdrant_url: The URL of the Qdrant server.
    :param qdrant_api_key: The API key to use for the Qdrant server.
    :param collection_name: The name of the collection to use.
    :param fastembed_model_name: The name of the FastEmbed model to use.
    """

    def __init__(
        self,
        qdrant_url: str,
        qdrant_api_key: Optional[str],
        collection_name: str,
        fastembed_model_name: str,
    ):
        self._qdrant_url = qdrant_url.rstrip("/")
        self._qdrant_api_key = qdrant_api_key
        self._collection_name = collection_name
        self._fastembed_model_name = fastembed_model_name
        # For the time being, FastEmbed models are the only supported ones.
        # A list of all available models can be found here:
        # https://qdrant.github.io/fastembed/examples/Supported_Models/
        self._client = AsyncQdrantClient(qdrant_url, api_key=qdrant_api_key)
        self._client.set_model(fastembed_model_name)

    async def store_memory(self, information: str):
        """
        Store a memory in the Qdrant collection.
        :param information: The information to store.
        """
        await self._client.add(
            self._collection_name,
            documents=[information],
        )

    async def find_memories(self, query: str) -> list[str]:
        """
        Find memories in the Qdrant collection.
        :param query: The query to use for the search.
        :return: A list of memories found.
        """
        search_results = await self._client.query(
            self._collection_name,
            query_text=query,
            limit=10,
        )
        return [result.document for result in search_results]
