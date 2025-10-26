import torch
from llama_index.core.embeddings import BaseEmbedding
from sentence_transformers import SentenceTransformer
from transformers import AutoModel
import open_clip
from pydantic import PrivateAttr
from PIL import Image
from typing import List

class Embedding(BaseEmbedding):
    _model = PrivateAttr()
    _preprocess = PrivateAttr(default=None)
    _tokenizer = PrivateAttr(default=None)
    _device = PrivateAttr()

    def __init__(self, model, model_name, device: str = "cpu", preprocess=None, 
                 tokenizer=None, model_type: str = "text"):
        super().__init__()
        self._model_name = model_name
        self._device = device
        self._model = model
        self._preprocess = preprocess
        self._tokenizer = tokenizer
        self._model_type = model_type

    # --- Text embeddings ---
    def _encode_text(self, text: str) -> List[float]:
        if self._model_type == "clip":
            tokens = self._tokenizer([text]).to(self._device)
            with torch.no_grad():
                emb = self._model.encode_text(tokens)
                emb = emb / emb.norm(dim=-1, keepdim=True)
            return emb[0].cpu().numpy().tolist()

        elif self._model_type == "caption":
            return self._model.encode(
                text,
                convert_to_numpy=True,
                normalize_embeddings=True,
                show_progress_bar=False,
            ).tolist()

        else:
            raise ValueError(f"Unsupported model_type={self._model_type}")

    def _get_query_embedding(self, query: str) -> List[float]:
        if self._model_name == "google/embeddinggemma-300m":
            query = f"task: search result | query: {query}"
        return self._encode_text(query)

    def _get_text_embedding(self, text: str) -> List[float]:
        if self._model_name == "google/embeddinggemma-300m":
            text = f"title: none | text: {text}"
        return self._encode_text(text)
    
    async def _aget_query_embedding(self, query: str) -> List[float]:
        return self._get_query_embedding(query)

    async def _aget_text_embedding(self, text: str) -> List[float]:
        return self._get_text_embedding(text)

    # --- Image embeddings ---
    def _encode_image(self, image: Image.Image) -> List[float]:
        image_tensor = self._preprocess(image).unsqueeze(0).to(self._device)
        with torch.no_grad():
            emb = self._model.encode_image(image_tensor)
            emb = emb / emb.norm(dim=-1, keepdim=True)
        return emb[0].cpu().numpy().tolist()

    def _get_image_embedding(self, image: Image.Image) -> List[float]:
        return self._encode_image(image)

    async def _aget_image_embedding(self, image: Image.Image) -> List[float]:
        return self._get_image_embedding(image)
    
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

CLIP_model, _, CLIP_preprocess = open_clip.create_model_and_transforms(
    model_name="ViT-H-14-quickgelu", 
    pretrained="dfn5b",
    device=DEVICE
)
tokenizer = open_clip.get_tokenizer("ViT-H-14-quickgelu")
CLIP_model = CLIP_model.eval()
CLIP_embedder = Embedding(
    model=CLIP_model, model_name="ViT-H-14-quickgelu", device=DEVICE,
    preprocess=CLIP_preprocess, tokenizer=tokenizer, model_type="clip"
)

BGE_model = SentenceTransformer("AITeamVN/Vietnamese_Embedding_v2", device=DEVICE)
BGE_embedder = Embedding(
    model=BGE_model, model_name="AITeamVN/Vietnamese_Embedding_v2",
    device=DEVICE, model_type="caption"
)

GTE_model = SentenceTransformer("dangvantuan/vietnamese-document-embedding", device=DEVICE, trust_remote_code=True)
GTE_embedder = Embedding(
    model=GTE_model, model_name="dangvantuan/vietnamese-document-embedding",
    device=DEVICE, model_type="caption"
)

Reranker = AutoModel.from_pretrained(
    'jinaai/jina-reranker-v3', 
    trust_remote_code=True,
).half().to(DEVICE).eval()