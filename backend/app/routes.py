from fastapi import APIRouter, Form, UploadFile, File
from typing import Optional
import json, time
from app.services.search_engine import SearchEngine
from typing import List, Optional
from app.config import DEVICE, CLIP_collection, BGE_collection, GTE_collection
from qdrant_client import QdrantClient
from collections import defaultdict
import torch

QDRANT_CLIENT_H = QdrantClient(
    url="https://9f245a4f-e67c-4e7f-8293-4b99091d126a.eu-west-2-0.aws.cloud.qdrant.io:6333",
    api_key="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2Nlc3MiOiJtIn0.5UOClUqt7Udsgljfww2VLkZkDdz_6LV9O91Sw4YVYQM"
) # Image


QDRANT_CLIENT_K = QdrantClient(
    url="https://09a6d049-00c4-4b77-8e95-1dcc9ea5df34.eu-west-1-0.aws.cloud.qdrant.io:6333",
    api_key="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2Nlc3MiOiJtIn0.-ZPZib9FxehqbTuqxsk7QdVjBQd0LlQEq7dpjF1b4PI",
) # Catpion


FRAME_NAMES = []
offset = None
batch_count = 0

while True:
    result, offset = QDRANT_CLIENT_H.scroll(
        collection_name=CLIP_collection,
        scroll_filter=None,
        with_payload=True,
        limit=1000,
        offset=offset
    )

    batch_count += 1
    if batch_count % 100 == 0:
        print(f"  Processed {batch_count} batches...")

    for point in result:
        if "id" in point.payload:
            FRAME_NAMES.append(point.payload["id"])

    if offset is None:
        break

FRAME_NAMES = sorted(set(FRAME_NAMES))

VIDEO_TO_FRAMES = defaultdict(list)
for f in FRAME_NAMES:
    vid = "_".join(f.split("_")[:2])
    VIDEO_TO_FRAMES[vid].append(f)
router = APIRouter()

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

router = APIRouter()

@router.post("/search")
async def api_search(query: Optional[str] = Form(None), topK: int = Form(...), 
                     mode: str = Form("hybrid"), caption_mode: str = Form("bge"), 
                     alpha: float = Form(0.5), file: UploadFile = File(None)):
    """
    Enhanced search API with caption mode support
    - mode: hybrid, clip, vintern, image
    - caption_mode: bge, gte (for vintern and hybrid modes)
    - alpha: text/visual balance for hybrid mode (0.1-0.9)
    """
    try:
        start_time = time.time()
        if mode == "image":
            if file is None:
                return {"error": "No file uploaded for image mode"}
            contents = await file.read()
            results = ClipSearch.retrieve_from_image(contents=contents, topK=topK)
            search_info = f"IMAGE search"
        else:
            if query is None or query.strip() == "":
                return {"error": "No query provided for text mode"}
            results = retrieve_frame(query=query, topK=topK, mode=mode,
                                    caption_mode=caption_mode, alpha=alpha)
            search_info = f"{mode.upper()} mode with {caption_mode.upper()} model"

        duration = time.time() - start_time
        formatted_results = [{"image": r["id"], "caption": f"{r['id']} | Score: {r['score']:.2f}"} for r in results]
        return {
            "results": formatted_results,
            "search_info": {
                "mode": mode,
                "caption_mode": caption_mode if mode in ["hybrid", "vintern"] else None,
                "alpha": alpha if mode == "hybrid" else None,
                "duration": round(duration, 3),
                "count": len(results),
                "description": search_info
            }
        }
    except Exception as e:
        return {"error": f"Search failed: {str(e)}"}

@router.post("/temporal_search")
async def api_temporal_search(events: str = Form(...), topK: int = Form(100), 
                              mode: str = Form("hybrid"), caption_mode: str = Form("bge"), 
                              alpha: float = Form(0.5), search_mode: str = Form("progressive")):
    """
    Enhanced Temporal search API for TRAKE mode
    - events: JSON array of sequential event descriptions
    - search_mode: "progressive" (frontend compatible) or "consolidated" (TRAKE visualization)
    - Returns different result formats based on search_mode
    """
    try:
        events_list = json.loads(events)
        if not isinstance(events_list, list) or len(events_list) == 0:
            return {"error": "Events must be a non-empty list"}

        valid_events = [e.strip() for e in events_list if e.strip()]
        if len(valid_events) == 0:
            return {"error": "No valid events provided"}

        start_time = time.time()
        results = temporal_search(events=valid_events, topK=topK, mode=mode, 
                                  caption_mode=caption_mode, alpha=alpha, search_mode=search_mode)

        duration = time.time() - start_time
        final_count = len(results)
        result_type = "video_timelines"

        return {
            "results": results,
            "search_info": {
                "mode": mode,
                "caption_mode": caption_mode,
                "alpha": alpha if mode == "hybrid" else None,
                "search_mode": search_mode,
                "duration": round(duration, 3),
                "events_processed": len(valid_events),
                "final_count": final_count,
                "result_type": result_type,
                "description": f"{search_mode.title()} temporal search through {len(valid_events)} events"
            }
        }
    except json.JSONDecodeError:
        return {"error": "Invalid JSON format for events"}
    except Exception as e:
        return {"error": f"Temporal search failed: {str(e)}"}

@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "device": DEVICE,
        "models_loaded": {
            "clip": ClipSearch is not None,
            "bge": BGECaptionSearch is not None,
            "gte": GTECaptionSearch is not None,
            "translator": ClipSearch.translator is not None
        },
        "collections": {
            "clip": CLIP_collection,
            "bge": BGE_collection,
            "gte": GTE_collection
        },
        "frame_count": len(FRAME_NAMES),
        "video_count": len(VIDEO_TO_FRAMES),
        "supported_search_modes": ["progressive", "consolidated"]
    }
