import os
import logging
from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, VectorParams

logger = logging.getLogger(__name__)

QDRANT_HOST = os.getenv("QDRANT_HOST", "qdrant")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))
COLLECTION_NAME = "documentarno_chunks"
# Dimension for intfloat/multilingual-e5-large is 1024
# For intfloat/multilingual-e5-base it's 768
VECTOR_SIZE = 1024 

def get_qdrant_client() -> QdrantClient:
    return QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

def init_qdrant_collection():
    client = get_qdrant_client()
    try:
        collections = client.get_collections().collections
        if not any(c.name == COLLECTION_NAME for c in collections):
            logger.info(f"Creating Qdrant collection: {COLLECTION_NAME}")
            client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
            )
            logger.info("Qdrant collection created successfully.")
        else:
            logger.info(f"Qdrant collection {COLLECTION_NAME} already exists.")
    except Exception as e:
        logger.error(f"Failed to initialize Qdrant collection: {e}")

if __name__ == "__main__":
    init_qdrant_collection()
