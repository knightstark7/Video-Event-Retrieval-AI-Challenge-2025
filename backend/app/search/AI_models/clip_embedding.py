from pydantic import PrivateAttr
from llama_index.core.embeddings import BaseEmbedding
from typing import List
import torch
import open_clip

class CLIPEmbedding(BaseEmbedding):
    _model = PrivateAttr()
    _preprocess = PrivateAttr()
    _tokenizer = PrivateAttr()
    _device = PrivateAttr()

    def __init__(self, device: str = "cpu"):
        super().__init__()
        self._device = device
        self._model, _, self._preprocess = open_clip.create_model_and_transforms(
            model_name='ViT-H-14-quickgelu',
            pretrained='dfn5b',
            device=self._device
        )
        self._tokenizer = open_clip.get_tokenizer('ViT-H-14-quickgelu')
        self._model = self._model.eval()

    def _encode_text(self, text: str) -> List[float]:
        tokens = self._tokenizer([text]).to(self._device)
        with torch.no_grad():
            emb = self._model.encode_text(tokens) 
        return emb[0].cpu().numpy().tolist()

    def _get_query_embedding(self, query: str) -> List[float]:
        return self._encode_text(query)

    def _get_text_embedding(self, text: str) -> List[float]:
        return self._encode_text(text)

    async def _aget_query_embedding(self, query: str) -> List[float]:
        return self._get_query_embedding(query)

    async def _aget_text_embedding(self, text: str) -> List[float]:
        return self._get_text_embedding(text)