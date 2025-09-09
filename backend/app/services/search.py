from typing import Optional
from app.services.search_engine import SearchEngine
from typing import List, Optional
from app.config import DEVICE, CLIP_collection, BGE_collection, GTE_collection
from app.clients.qdrant_clients import QDRANT_CLIENT_H, QDRANT_CLIENT_K
from collections import defaultdict
import torch


VIDEO_TO_FRAMES  = defaultdict(list)
offset = None

while True:
    result, offset = QDRANT_CLIENT_H.scroll(
        collection_name=CLIP_collection,
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


ClipSearch = SearchEngine(QDRANT_CLIENT_H, CLIP_collection, DEVICE)
BGECaptionSearch = SearchEngine(QDRANT_CLIENT_K, BGE_collection, DEVICE, model="AITeamVN/Vietnamese_Embedding_v2")
GTECaptionSearch = SearchEngine(QDRANT_CLIENT_K, GTE_collection, DEVICE, model="dangvantuan/vietnamese-document-embedding")

def retrieve_frame(query: str, topK: int, mode: str = "hybrid", caption_mode: str = "bge",
                   alpha: float = 0.5, frame_ids: Optional[List] = None):
    if mode == "clip":
        clip_nodes = ClipSearch.retrieve(query=query, topK=topK, frame_ids=frame_ids)
        return clip_nodes
    
    elif mode == "vintern":
        if caption_mode == "bge":
            caption_nodes = BGECaptionSearch.retrieve(query=query, topK=topK, frame_ids=frame_ids)
        else: 
            caption_nodes = GTECaptionSearch.retrieve(query=query, topK=topK, frame_ids=frame_ids)
        return caption_nodes

    else: 
        clip_nodes = ClipSearch.retrieve(query=query, topK=topK, frame_ids=frame_ids)

        if caption_mode == "bge":
            caption_nodes = BGECaptionSearch.retrieve(query=query, topK=topK, frame_ids=frame_ids)
        else: 
            caption_nodes = GTECaptionSearch.retrieve(query=query, topK=topK, frame_ids=frame_ids)
        
        combined_scores = defaultdict(float)
        for node in caption_nodes:
            combined_scores[node["id"]] += node["score"] * alpha

        for node in clip_nodes:
            combined_scores[node["id"]] += node["score"] * (1 - alpha)

        top_results = sorted(combined_scores.items(), key=lambda x: x[1], reverse=True)[:topK]

        return [{"id": video_id, "score": score} for video_id, score in top_results]

def retrieve_from_image(contents: bytes, topK: int):
    """
    Image-based search using CLIP embeddings
    """
    results = ClipSearch.retrieve_from_image(contents=contents, topK=topK)
    return results

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

def compute_video_score(video_events, device=DEVICE):
    event_lengths = []
    event_avgs = []

    for frames in video_events.values():
        if not frames:
            continue
        scores = torch.tensor([f["score"] for f in frames], device=device)
        event_avgs.append(torch.mean(scores))
        event_lengths.append(len(frames))

    if not event_avgs:
        return 0.0
        
    lengths_tensor = torch.tensor(event_lengths, dtype=torch.float32, device=device)
    avgs_tensor = torch.stack(event_avgs)

    event_scores = avgs_tensor * torch.log1p(lengths_tensor)
    max_possible = torch.sum(torch.log1p(lengths_tensor))
    video_score = torch.sum(event_scores) / (max_possible + 1e-12)

    return video_score.item()


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
        score = compute_video_score(events_dict, device=DEVICE)
        sequences = beam_search(events_dict, length_norm=True)
    
        if sequences:
            results_list.append({
                "video": vid,
                "score": score,
                "frame_sequence": sequences
            })

    results_list = sorted(results_list, key=lambda x: x["score"], reverse=True)
    return results_list