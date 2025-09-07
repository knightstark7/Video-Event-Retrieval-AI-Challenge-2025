import io
from PIL import Image
from typing import List, Optional
from llama_index.vector_stores.qdrant import QdrantVectorStore
from llama_index.core import VectorStoreIndex
from qdrant_client import models
from .embeddings import CLIPEmbedding, CaptionEmbedding
from .translator import Translator


class SearchEngine:
    def __init__(self, qdrant_client, collection_name, device, model=None):
        self.qdrant_client = qdrant_client
        self.collection_name = collection_name
        self.device = device
        self.model = model
        self.translator = None

        if self.collection_name == "Image":
            self.translator = Translator(device=self.device)
            self.embed_model = CLIPEmbedding(device=self.device)

        elif self.collection_name == "BGE_Caption":
            self.embed_model = CaptionEmbedding(model_name=self.model, device=self.device)

        else:
            self.embed_model = CaptionEmbedding(model_name=self.model, device=self.device, trust_remote_code=True)

        self.vector_store = QdrantVectorStore(client=self.qdrant_client, 
                                              collection_name=self.collection_name)
        self.index = VectorStoreIndex.from_vector_store(vector_store=self.vector_store, 
                                                        embed_model=self.embed_model)

    def retrieve_from_image(self, contents: bytes, topK: int):
        image = Image.open(io.BytesIO(contents)).convert("RGB")
        vector_query = self.embed_model._get_image_embedding(image)

        clip_nodes = self.qdrant_client.search(
            collection_name=self.collection_name,
            query_vector=vector_query,
            limit=topK,
            with_payload=True
        )

        results = [
            {"id": node.payload.get("id", "").strip(), "score": node.score}
            for node in clip_nodes
        ]
        return results

    def retrieve(self, query: str, topK: int, frame_ids: Optional[List] = None):
        query_text = query
        if self.translator:
            query_text = self.translator.translate(query, source_lang="vi")

        vector_query = self.embed_model._get_text_embedding(query_text)
        query_filter = None
        if frame_ids:
            query_filter = models.Filter(
                must=[models.FieldCondition(key="id", match=models.MatchAny(any=frame_ids))]
            )

        nodes = self.qdrant_client.search(collection_name=self.collection_name, query_vector=vector_query,
                                          limit=topK, with_payload=True, query_filter=query_filter)
        results = [{"id": node.payload["id"].strip(), "score": node.score} for node in nodes]
        return results