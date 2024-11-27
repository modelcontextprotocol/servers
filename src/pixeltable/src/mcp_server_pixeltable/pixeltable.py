import logging
from datetime import datetime

import pixeltable as pxt
from pixeltable.functions.huggingface import clip_text

logger = logging.getLogger(__name__)

class PixeltableConnector:
    def __init__(self):
        try:
            pxt.drop_dir('mcp_store', force=True)
            pxt.create_dir('mcp_store')

            self.table = pxt.create_table(
                'mcp_store.memories',
                {
                    'text': pxt.String,
                    'timestamp': pxt.Timestamp
                }
            )

            self.table.add_embedding_index(
                'text',
                string_embed=clip_text.using(model_id='openai/clip-vit-base-patch32')
            )

            logger.info("Pixeltable initialized successfully")

        except Exception as e:
            logger.error(f"Failed to initialize Pixeltable: {str(e)}")
            raise

    async def store_memory(self, text: str):
        """
        Store a memory in the related Pixeltable table.

        :param text: The text information to store.
        """
        try:
            logger.debug(f"Storing memory: {text}")
            self.table.insert([{
                'text': text,
                'timestamp': datetime.now()
            }])
            logger.info("Memory stored successfully")

        except Exception as e:
            logger.error(f"Failed to store memory: {str(e)}")
            raise

    async def find_memories(self, query: str, limit: int = 5) -> list[str]:
        """
        Find memories using semantic search.

        Args:
            query: Search query text
            limit: Maximum number of results

        Returns:
            List of relevant memory texts

        Raises:
            Exception: If search operation fails
        """
        try:
            logger.debug(f"Searching memories with query: {query}")
            sim = self.table.text.similarity(query)
            results = (
                self.table
                .order_by(sim, asc=False)
                .select(self.table.text)
                .limit(limit)
                .collect()
            )
            return [row['text'] for row in results]

        except Exception as e:
            logger.error(f"Failed to search memories: {str(e)}")
            raise