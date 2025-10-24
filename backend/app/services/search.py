from collections import defaultdict
from typing import List, Optional
import ast
import io
import torch
import open_clip
from PIL import Image
from qdrant_client import models
from app.clients.qdrant_clients import QDRANT_CLIENT_H, QDRANT_CLIENT_K
from sentence_transformers import SentenceTransformer
from transformers import AutoModel
from .translator import Translator
from .embeddings import Embedding
import math
import json


DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
VIDEO_TO_FRAMES  = defaultdict(list)
FRAME_TO_SUBTILES = defaultdict()
offset = None

search_engines = {
    "ClipSearch": (QDRANT_CLIENT_H, "Image"),
    "BGESubtitles": (QDRANT_CLIENT_H, "BGE_subtitles"),
    "GTESubtitles": (QDRANT_CLIENT_H, "GTE_subtitles"),
    "BGECaption": (QDRANT_CLIENT_K, "BGE_Caption"),
    "GTECaption":  (QDRANT_CLIENT_K, "GTE_Caption"),
}

while True:
    result, offset = search_engines["ClipSearch"][0].scroll(
        collection_name=search_engines["ClipSearch"][1],
        scroll_filter=None,
        with_payload=True,
        limit=5000,
        offset=offset
    )

    for point in result:
        fid = point.payload.get("id")
        if fid:
            vid = "_".join(fid.split("_")[:2])
            VIDEO_TO_FRAMES [vid].append(fid)

    if offset is None:
        break

while True:
    result, offset = search_engines["BGESubtitles"][0].scroll(
        collection_name=search_engines["BGESubtitles"][1],
        scroll_filter=None,
        with_payload=True,
        limit=5000,
        offset=offset
    )

    for point in result:
        fid = point.payload.get("id")

        frame_list_str = point.payload.get("frame_list", "[]")
        frame_list = ast.literal_eval(frame_list_str) if isinstance(frame_list_str, str) else frame_list_str
        for frame_id in frame_list:
            FRAME_TO_SUBTILES[frame_id] = fid

    if offset is None:
        break

# INSTALL MODEL
translator = Translator(device=DEVICE)
clip_model, _, clip_preprocess = open_clip.create_model_and_transforms(model_name="ViT-H-14-quickgelu", 
                                                                       pretrained="dfn5b", 
                                                                       device=DEVICE)
tokenizer = open_clip.get_tokenizer("ViT-H-14-quickgelu")
clip_model = clip_model.eval()
clip_embedder = Embedding(
    model=clip_model, model_name="ViT-H-14-quickgelu", device=DEVICE,
    preprocess=clip_preprocess, tokenizer=tokenizer, model_type="clip"
)

bge_model = SentenceTransformer("AITeamVN/Vietnamese_Embedding_v2", device=DEVICE)
bge_embedder = Embedding(
    model=bge_model, model_name="AITeamVN/Vietnamese_Embedding_v2",
    device=DEVICE, model_type="caption"
)

gte_model = SentenceTransformer("dangvantuan/vietnamese-document-embedding", device=DEVICE, trust_remote_code=True)
gte_embedder = Embedding(
    model=gte_model, model_name="dangvantuan/vietnamese-document-embedding",
    device=DEVICE, model_type="caption"
)

reranker_model = AutoModel.from_pretrained('jinaai/jina-reranker-v3', trust_remote_code=True,).to(DEVICE).eval()

def retrieve_with_vector(search_engine, vector_query, topK: int, frame_ids: Optional[List] = None):
    qdrant_client, collection_name = search_engine
    if "subtitles" in collection_name:
        topK = topK // 2

    query_filter = None
    if frame_ids:
        if "subtitles" in collection_name:
            temp = set([FRAME_TO_SUBTILES[fid] for fid in frame_ids if fid in FRAME_TO_SUBTILES])
            query_filter = models.Filter(
                must=[models.FieldCondition(key="id", match=models.MatchAny(any=temp))]
            )
        else:
            query_filter = models.Filter(
                must=[models.FieldCondition(key="id", match=models.MatchAny(any=frame_ids))]
            )

    nodes = qdrant_client.search(
        collection_name=collection_name, query_vector=vector_query,
        limit=topK, with_payload=True, query_filter=query_filter,
    )

    if "subtitles" in collection_name.lower():
        results = []
        for node in nodes:
            frame_list_str = node.payload.get("frame_list", "[]")
            frame_list = ast.literal_eval(frame_list_str) if isinstance(frame_list_str, str) else frame_list_str
            for frame_id in frame_list:
                results.append({"id": str(frame_id), "score": node.score})
    else:
        results = [{"id": node.payload.get("id", "").strip(), "score": node.score} for node in nodes]
    return results

def retrieve_from_image(contents: bytes, topK: int):
    image = Image.open(io.BytesIO(contents)).convert("RGB")
    clip_vector_query = clip_embedder._get_image_embedding(image)
    results = retrieve_with_vector(search_engine=search_engines['ClipSearch'], vector_query=clip_vector_query, 
                                   topK=topK, frame_ids=None)
    return results

def retrieve_by_clip(query: str, topK: int, frame_ids: Optional[List] = None): 
    clip_query = translator.translate(query)
    clip_vector_query = clip_embedder._get_query_embedding(clip_query)
    clip_nodes = retrieve_with_vector(
        search_engine=search_engines['ClipSearch'],
        vector_query=clip_vector_query, 
        topK=topK,
        frame_ids=frame_ids
    )
    return clip_nodes

def retrieve_by_captions(query: str, caption_mode: str, topK: int,
                           frame_ids: Optional[List] = None, 
                           use_caption=True, use_subtitles=False):
    if caption_mode == "bge":
        vector_query = bge_embedder._get_query_embedding(query)
        caption_engine = search_engines["BGECaption"]
        subtitle_engine = search_engines["BGESubtitles"]
    else:
        vector_query = gte_embedder._get_query_embedding(query)
        caption_engine = search_engines["GTECaption"]
        subtitle_engine = search_engines["GTESubtitles"]

    results = {}
    if use_caption:
        results["caption"] = retrieve_with_vector(search_engine=caption_engine, vector_query=vector_query,
                                                  topK=topK, frame_ids=frame_ids)
    if use_subtitles:
        results["subtitles"] = retrieve_with_vector(search_engine=subtitle_engine, vector_query=vector_query,
                                                    topK=topK, frame_ids=frame_ids)
    return results

def rerank(query, candidates, topK, search_engine):
    qdrant_client, collection_name = search_engine
    frame_ids = [val["id"] for val in candidates]
    print(frame_ids)

    scroll_filter = models.Filter(
        must=[models.FieldCondition(key="id", match=models.MatchAny(any=frame_ids))]
    )

    document_list = []
    id_list = []
    offset = None
    while True:
        res, offset = qdrant_client.scroll(
            collection_name=collection_name,
            scroll_filter=scroll_filter,
            with_payload=True,
            limit=5000,
            offset=offset
        )

        for point in res:
            text = json.loads(point.payload.get("_node_content", "{}")).get("text", "")
            document_list.append(text)
            id_list.append(point.payload.get("id", ""))

        if offset is None:
            break
    print(id_list)
    print(document_list)
    top_results = reranker_model.rerank(query, document_list, top_n=topK)
    return [{"id": id_list[i], "score": score} for i, score in enumerate(top_results)]

def retrieve_frame(query: str, topK: int, mode: str = "hybrid", caption_mode: str = "bge",
                   alpha: float = 0.5, frame_ids: Optional[List] = None):
    if mode == "clip":
        clip_nodes = retrieve_by_clip(query=query, topK=topK, frame_ids=frame_ids)
        return clip_nodes
    
    elif mode == "caption":
        results = retrieve_by_captions(query=query, caption_mode=caption_mode, topK=topK,
                                         frame_ids=frame_ids, use_caption=True, use_subtitles=False)
        return results['caption']

    elif mode == "subtitles":
        results = retrieve_by_captions(query=query, caption_mode=caption_mode, topK=topK,
                                         frame_ids=frame_ids, use_caption=False, use_subtitles=True)        
        return results['subtitles']
    
    else: 
        clip_nodes = retrieve_by_clip(query=query, topK=topK, frame_ids=frame_ids)

        results = retrieve_by_captions(query=query, caption_mode=caption_mode, topK=topK,
                                         frame_ids=frame_ids, use_caption=True, use_subtitles=True)
        
        caption_nodes = results['caption']
        subtitle_nodes = results['subtitles']

        combined_scores = defaultdict(float)
        # weights= (alpha, 1 - alpha)
        weights = (0.4, 0.4, 0.2)
        for nodes, w in ((caption_nodes, weights[0]), (clip_nodes, weights[1]), (subtitle_nodes, weights[2])):
            for node in nodes:
                combined_scores[node["id"]] += node["score"] * w

        top_results = sorted(combined_scores.items(), key=lambda x: x[1], reverse=True)[:topK]
        top_results = [{"id": video_id, "score": score} for video_id, score in top_results]
        
        if alpha > 0.5:
            print(alpha)
            top_results = rerank(query, top_results, topK // 2, search_engines['BGECaption'])
            
        return top_results

def parse_image_name(image_name: str):
    parts = image_name.split("_", 2)
    vid = f"{parts[0]}_{parts[1]}"
    frame_idx = int(parts[2])
    return vid, frame_idx

def group_by_video(final_results, num_events):
    video_event_data = {}
    for e_idx, results in enumerate(final_results):
        for item in results:
            vid, _ = parse_image_name(item["id"])
            ev_list = video_event_data.setdefault(vid, [[] for _ in range(num_events)])
            ev_list[e_idx].append(item)

    filtered_data = {
        vid: {i: frames for i, frames in enumerate(ev_list)}
        for vid, ev_list in video_event_data.items()
        if all(ev_list)
    }
    return filtered_data

def compute_video_score(video_events):
    event_lengths = []
    event_avgs = []

    for frames in video_events.values():
        if not frames:
            continue
        scores = [f["score"] for f in frames]
        event_avgs.append(sum(scores) / len(scores))
        event_lengths.append(len(frames))

    if not event_avgs:
        return 0.0

    event_scores_sum = 0.0
    log_lengths_sum = 0.0

    for avg, length in zip(event_avgs, event_lengths):
        log_len = math.log1p(length)
        event_scores_sum += avg * log_len
        log_lengths_sum += log_len

    video_score = event_scores_sum / (log_lengths_sum + 1e-12)
    return video_score


def beam_search(video_event, beam_size=3, length_norm=True):
    num_events = len(video_event)
    for frames in video_event.values():
        for f in frames:
            if "frame_index" not in f:
                _, idx = parse_image_name(f["id"])
                f["frame_index"] = idx

    sequences = [([f], f["score"]) for f in video_event.get(0, [])]
    if not sequences:
        return []

    for e_idx in range(1, num_events):
        next_frames = video_event.get(e_idx, [])
        if not next_frames:
            break

        candidates = [
            (seq + [f], seq_score + f["score"])
            for seq, seq_score in sequences
            for f in next_frames
            if f["frame_index"] > seq[-1]["frame_index"]
        ]

        if not candidates:
            break
            
        sequences = sorted(candidates, key=lambda x: x[1], reverse=True)[:beam_size]
        
    if length_norm and sequences:
        sequences = [(seq, score / len(seq)) for seq, score in sequences]

    return [
        [{"id": f["id"], "score": f["score"]} for f in seq]
        for seq, score in sequences
        if len(seq) == num_events
    ]
    
def temporal_search(events: List[str], topK: int = 100,
                    mode: str = "hybrid", caption_mode: str = "bge",
                    alpha: float = 0.5, search_mode: str = "progressive"):
    final_results = []  

    if search_mode == "progressive":
        frame_ids = None
        for event in events:
            results = retrieve_frame(query=event, topK=topK, mode=mode, caption_mode=caption_mode, 
                                     alpha=alpha, frame_ids=frame_ids)
            print(results)
            final_results.append(results)
            video_ids = {parse_image_name(item['id'])[0] for item in results}
            frame_ids = [f for vid in video_ids for f in VIDEO_TO_FRAMES[vid]]
            
    else: #consolidated
        for event in events:
            results = retrieve_frame(query=event, topK=topK, mode=mode, caption_mode=caption_mode, 
                                     alpha=alpha, frame_ids=None)
            final_results.append(results)

    video_event_data = group_by_video(final_results, len(events))

    results_list = []
    for vid, events_dict in video_event_data.items():
        score = compute_video_score(events_dict)
        sequences = beam_search(events_dict, length_norm=True)
    
        if sequences:
            results_list.append({
                "video": vid,
                "score": score,
                "frame_sequence": sequences
            })

    results_list = sorted(results_list, key=lambda x: x["score"], reverse=True)
    return results_list