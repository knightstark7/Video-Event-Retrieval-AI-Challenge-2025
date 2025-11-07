from collections import defaultdict
from typing import List, Optional
import ast
import io
from PIL import Image
from qdrant_client import models
from .translator import translator
from .embeddings import CLIP_embedder, BGE_embedder, GTE_embedder, Reranker
import math
import json
from app.clients.qdrant_clients import QDRANT_CLIENT_H, QDRANT_CLIENT_K
import time
from concurrent.futures import ThreadPoolExecutor

SearchEngines = {
    "ClipSearch": (QDRANT_CLIENT_H, "Image"),
    "BGESubtitles": (QDRANT_CLIENT_H, "BGE_subtitles"),
    "GTESubtitles": (QDRANT_CLIENT_H, "GTE_subtitles"),
    "BGECaption": (QDRANT_CLIENT_K, "BGE_Caption"),
    "GTECaption":  (QDRANT_CLIENT_K, "GTE_Caption"),
}
VIDEO_TO_FRAMES = defaultdict(list)
FRAME_TO_SUBTITLES = {}
scroll_limit = 5000
offset = None

while True:
    result, offset = SearchEngines["ClipSearch"][0].scroll(
        collection_name=SearchEngines["ClipSearch"][1],
        scroll_filter=None,
        with_payload=True,
        limit=scroll_limit,
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
    result, offset = SearchEngines["BGESubtitles"][0].scroll(
        collection_name=SearchEngines["BGESubtitles"][1],
        scroll_filter=None,
        with_payload=True,
        limit=scroll_limit,
        offset=offset
    )

    for point in result:
        fid = point.payload.get("id")

        frame_list_str = point.payload.get("frame_list", "[]")
        frame_list = ast.literal_eval(frame_list_str) if isinstance(frame_list_str, str) else frame_list_str
        for frame_id in frame_list:
            FRAME_TO_SUBTITLES[frame_id] = fid

    if offset is None:
        break

def get_vector_query(query: str, mode):
    if mode == "clip":
        t1 = time.time()
        clip_query = translator.translate(query)
        print(f"Translation time: {time.time() - t1} seconds")

        t2 = time.time()
        clip_vector_query = CLIP_embedder._get_query_embedding(clip_query)
        print(f"CLIP embedding time: {time.time() - t2} seconds")
        return clip_vector_query
    elif mode == "bge":
        t3 = time.time()
        vector_query = BGE_embedder._get_query_embedding(query)
        print(f"BGE embedding time: {time.time() - t3} seconds")
        return vector_query
    else:
        t4 = time.time()
        vector_query = GTE_embedder._get_query_embedding(query)
        print(f"GTE embedding time: {time.time() - t4} seconds")
        return vector_query
    
def retrieve_with_vector(search_engine, vector_query, topK: int, frame_ids: Optional[List] = None):
    qdrant_client, collection_name = search_engine
    if "subtitles" in collection_name:
        topK = topK // 2

    query_filter = None
    if frame_ids:
        if "subtitles" in collection_name:
            temp = set([FRAME_TO_SUBTITLES[fid] for fid in frame_ids if fid in FRAME_TO_SUBTITLES])
            query_filter = models.Filter(
                must=[models.FieldCondition(key="id", match=models.MatchAny(any=temp))]
            )
        else:
            query_filter = models.Filter(
                must=[models.FieldCondition(key="id", match=models.MatchAny(any=frame_ids))]
            )

    nodes = qdrant_client.search(
        collection_name=collection_name, 
        query_vector=vector_query,
        limit=topK, 
        with_payload=True, 
        query_filter=query_filter,
    )

    if "subtitles" in collection_name:
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
    clip_vector_query = CLIP_embedder._get_image_embedding(image)
    results = retrieve_with_vector(
        search_engine=SearchEngines['ClipSearch'], 
        vector_query=clip_vector_query, 
        topK=topK, 
        frame_ids=None
    )
    return results

def rerank(query, candidates, topK, caption_mode):
    qdrant_client, collection_name = (
        SearchEngines["BGECaption"] if caption_mode == "bge" else SearchEngines["GTECaption"]
    )

    frame_ids = [val["id"] for val in candidates]
    scroll_filter = models.Filter(
        must=[models.FieldCondition(key="id", match=models.MatchAny(any=frame_ids))]
    )

    document_list, id_list = [], []
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

    start = time.time()
    top_results = Reranker.rerank(query, document_list, top_n=topK) 
    print(f"Reranking time: {time.time() - start} seconds")
    return [{"id": id_list[val["index"]], "score": val["relevance_score"]} for val in top_results]

def retrieve_frame(query: str, topK: int, mode: str = "hybrid", caption_mode: str = "bge",
                   alpha: float = 0.5, frame_ids: Optional[List] = None, use_rerank: bool = False):
    print(f"Retrieval mode: {mode}, caption model: {caption_mode}, use_rerank: {use_rerank}")
    if mode == "clip":
        clip_vector_query = get_vector_query(query, mode="clip")

        t1 = time.time()
        clip_nodes = retrieve_with_vector(
            search_engine=SearchEngines['ClipSearch'],
            vector_query=clip_vector_query, 
            topK=topK,
            frame_ids=frame_ids
        )

        print(f"Clip retrieval time: {time.time() - t1} seconds")
        return clip_nodes
    
    elif mode == "caption":
        vector_query = get_vector_query(query, mode=caption_mode)

        t2 = time.time()
        caption_nodes = retrieve_with_vector(
            search_engine=SearchEngines["BGECaption"] if caption_mode == "bge" else SearchEngines["GTECaption"],
            vector_query=vector_query,
            topK=topK,
            frame_ids=frame_ids
        )
        print(f"Caption retrieval time: {time.time() - t2} seconds")

        if use_rerank:
            top_results = rerank(query, caption_nodes, (topK // 2), caption_mode)
            return top_results

        return caption_nodes

    elif mode == "subtitles":
        vector_query = get_vector_query(query, mode=caption_mode)

        t3 = time.time()
        subtitle_nodes = retrieve_with_vector(
            search_engine=SearchEngines["BGESubtitles"] if caption_mode == "bge" else SearchEngines["GTESubtitles"],
            vector_query=vector_query, 
            topK=topK,
            frame_ids=frame_ids
        )     
        print(f"Subtitle retrieval time: {time.time() - t3} seconds")
        return subtitle_nodes
    
    elif mode == "clip+caption":
        clip_vector_query = get_vector_query(query, mode="clip")
        text_vector_query = get_vector_query(query, mode=caption_mode)

        caption_engine = SearchEngines["BGECaption"] if caption_mode == "bge" else SearchEngines["GTECaption"]
        print("Using parallel retrieval")
        start = time.time()
        with ThreadPoolExecutor(max_workers=4) as executor:
            future_clip = executor.submit(retrieve_with_vector,SearchEngines['ClipSearch'], clip_vector_query, topK, frame_ids)
            future_caption = executor.submit(retrieve_with_vector,caption_engine, text_vector_query, topK, frame_ids)


            clip_nodes = future_clip.result()

        print(f"Retrieval time: {time.time() - start} seconds")      
        combined_scores = defaultdict(float)
        weights = (0.45, 0.45,)
        for nodes, w in ((caption_nodes, weights[0]), (clip_nodes, weights[1])):
            for node in nodes:
                combined_scores[node["id"]] += node["score"] * w

        top_results = sorted(combined_scores.items(), key=lambda x: x[1], reverse=True)[:topK]
        top_results = [{"id": video_id, "score": score} for video_id, score in top_results]

        if use_rerank:
            top_results = rerank(query, top_results, (topK // 2), caption_mode)

        return top_results

    else: 
        clip_vector_query = get_vector_query(query, mode="clip")
        text_vector_query = get_vector_query(query, mode=caption_mode)

        caption_engine = SearchEngines["BGECaption"] if caption_mode == "bge" else SearchEngines["GTECaption"]
        subtitle_engine = SearchEngines["BGESubtitles"] if caption_mode == "bge" else SearchEngines["GTESubtitles"]

        # if alpha > 0.5:
        print("Using parallel retrieval")
        start = time.time()
        with ThreadPoolExecutor(max_workers=4) as executor:
            future_clip = executor.submit(retrieve_with_vector,SearchEngines['ClipSearch'], clip_vector_query, topK, frame_ids)
            future_caption = executor.submit(retrieve_with_vector,caption_engine, text_vector_query, topK, frame_ids)
            future_subtitle = executor.submit(retrieve_with_vector,subtitle_engine, text_vector_query, topK, frame_ids)

            clip_nodes = future_clip.result()
            caption_nodes = future_caption.result()
            subtitle_nodes = future_subtitle.result()

        print(f"Retrieval time: {time.time() - start} seconds")
        # else:
        #     print("Using sequential retrieval")
        #     t4 = time.time()
        #     clip_nodes = retrieve_with_vector(
        #         search_engine=SearchEngines['ClipSearch'],
        #         vector_query=clip_vector_query, 
        #         topK=topK,
        #         frame_ids=frame_ids
        #     )
        #     print(f"Clip retrieval time: {time.time() - t4} seconds")

        #     t5 = time.time()
        #     caption_nodes = retrieve_with_vector(
        #         search_engine=caption_engine,
        #         vector_query=text_vector_query,
        #         topK=topK,
        #         frame_ids=frame_ids
        #     )
        #     print(f"Caption retrieval time: {time.time() - t5} seconds")
        #     t6 = time.time()
        #     subtitle_nodes = retrieve_with_vector(
        #         search_engine=subtitle_engine,
        #         vector_query=text_vector_query, 
        #         topK=topK,
        #         frame_ids=frame_ids
        #     ) 
        #     print(f"Subtitle retrieval time: {time.time() - t6} seconds")    
        #     print(f"Retrieval time: {time.time() - t4} seconds")        
        combined_scores = defaultdict(float)
        weights = (0.45, 0.45, 0.1)
        for nodes, w in ((caption_nodes, weights[0]), (clip_nodes, weights[1]), (subtitle_nodes, weights[2])):
            for node in nodes:
                combined_scores[node["id"]] += node["score"] * w

        top_results = sorted(combined_scores.items(), key=lambda x: x[1], reverse=True)[:topK]
        top_results = [{"id": video_id, "score": score} for video_id, score in top_results]

        if use_rerank:
            top_results = rerank(query, top_results, (topK // 2), caption_mode)
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
                    alpha: float = 0.5, use_rerank: bool = False, search_mode: str = "progressive"):
    final_results = []  

    if search_mode == "progressive":
        frame_ids = None
        for event in events:
            results = retrieve_frame(query=event, topK=topK, mode=mode, caption_mode=caption_mode,
                                     alpha=alpha, frame_ids=frame_ids, use_rerank=use_rerank)
            final_results.append(results)
            video_ids = {parse_image_name(item['id'])[0] for item in results}
            frame_ids = [f for vid in video_ids for f in VIDEO_TO_FRAMES[vid]]

    else: #consolidated
        for event in events:
            results = retrieve_frame(query=event, topK=topK, mode=mode, caption_mode=caption_mode,
                                     alpha=alpha, frame_ids=None, use_rerank=use_rerank)
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