import logging
import uuid
import numpy as np
from langchain_text_splitters import RecursiveCharacterTextSplitter
from qdrant_client.models import PointStruct

from app.core.qdrant import get_qdrant_client, COLLECTION_NAME

logger = logging.getLogger(__name__)

# Keep model instance in memory, but initialize lazily
_embedding_model = None

def get_embedding_model():
    global _embedding_model
    if _embedding_model is None:
        import torch
        from sentence_transformers import SentenceTransformer
        # Load intfloat/multilingual-e5-large as per spec
        device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"Loading intfloat/multilingual-e5-large on {device}...")
        _embedding_model = SentenceTransformer("intfloat/multilingual-e5-large", device=device)
    return _embedding_model

def process_and_store_document(doc_id: int, markdown_text: str):
    """
    Splits the markdown text into chunks, generates embeddings using multilingual-e5-large,
    and stores them into the Qdrant vector database.
    """
    logger.info(f"Generating embeddings for document {doc_id}...")
    
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=150,
        separators=["\n## ", "\n### ", "\n\n", "\n", " ", ""]
    )
    
    chunks = splitter.split_text(markdown_text)
    
    if not chunks:
        logger.warning(f"No text extracted for document {doc_id} to embed.")
        return
        
    # E5 models require "passage: " prefix for document chunks
    prefixed_chunks = [f"passage: {chunk}" for chunk in chunks]
    
    model = get_embedding_model()
    embeddings = model.encode(prefixed_chunks, show_progress_bar=False, convert_to_numpy=True)
    
    client = get_qdrant_client()
    points = []
    
    for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        point_id = str(uuid.uuid4())
        points.append(
            PointStruct(
                id=point_id,
                vector=embedding.tolist(),
                payload={
                    "doc_id": doc_id,
                    "text": chunk,
                    "chunk_index": i
                }
            )
        )
        
    # Batch upsert points
    batch_size = 100
    for i in range(0, len(points), batch_size):
        batch = points[i:i + batch_size]
        client.upsert(
            collection_name=COLLECTION_NAME,
            points=batch
        )
        
    logger.info(f"Successfully stored {len(points)} chunks for document {doc_id} in Qdrant.")

def get_query_embedding(query: str) -> np.ndarray:
    """
    Generates embedding for a search query. 
    E5 models require "query: " prefix.
    """
    model = get_embedding_model()
    return model.encode([f"query: {query}"], show_progress_bar=False, convert_to_numpy=True)[0]

