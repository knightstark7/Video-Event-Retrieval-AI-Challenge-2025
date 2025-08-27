# Video Event Retrieval AI Challenge 2025

Multimodal search system for video content using CLIP and Vietnamese text embeddings.

## 🆕 Latest Updates

### **Dual Search Types**
- **Text Search**: Vietnamese queries with hybrid embeddings (CLIP + BGE)
- **Image Search**: Upload images to find similar frames using CLIP

### **Three App Modes**
- **Textual KIS**: Basic frame selection → CSV: `videoFile, frameNum`
- **Q&A**: Frame selection + answers → CSV: `videoFile, frameNum, "answer"`  
- **TRAKE**: Event sequences → CSV: `L21_V008, 1200, 1850, 2100`

### **Interactive Features**
- **Video Player**: Click any frame → Opens YouTube at exact timestamp
- **TRAKE Workflow**: Select video → Browse all frames → Create sequences
- **FPS**: Reads actual FPS from metadata

## 🚀 Quick Start

### 1. Backend Setup
1. Upload `videoframeretrievalsystem.ipynb` to Kaggle
2. Enable GPU + Internet → Run all cells
3. Copy ngrok URL: `https://xxxxx.ngrok-free.app`

### 2. Frontend Setup
```bash
cd frame-ui
npm install
npm start
```

### 3. Usage
1. **Settings**: Enter backend URL
2. **Search Type**: Text or Image
3. **App Mode**: Textual KIS / Q&A / TRAKE
4. **Search**: Enter query or upload image
5. **Export**: Select frames → Download CSV

## 🔧 API

Both search types use FormData:

**Text Search:**
```
query: "con chó màu đen"
topK: 10
mode: "hybrid"
```

**Image Search:**
```
file: [image file]
topK: 10
mode: "image"
```

## 🎯 Search Modes

- **Hybrid**: CLIP + Vietnamese text
- **CLIP Only**: Visual similarity
- **Vintern Only**: Vietnamese text

## 📁 Required Structure

```
frame-ui/public/
├── keyframes/
│   ├── L21/L21_V001/L21_V001_1234.jpg
│   └── L22/L22_V001/L22_V001_5678.jpg
└── media-info-aic25-b1/media-info/
    ├── L21_V001.json    # Video metadata with FPS
    └── keyframes_index.json  # Auto-generated
```

## 🎬 TRAKE Mode Usage

1. Click **"🎬 Select Video"** on any search result
2. Browse all keyframes from that video (10 per page)
3. Select multiple frames using checkboxes
4. Click **"💾 Save Sequence"** 
5. Repeat for more sequences
6. Export all sequences as CSV

## 🎥 Video Player

- **Click any keyframe** → YouTube video opens at timestamp
- **ESC key** or **X button** to close
- **Auto-calculated timing** based on FPS metadata

## 🔧 Data Setup

### Video Metadata Format
```json
{
  "title": "Video Title",
  "watch_url": "https://youtube.com/watch?v=...",
  "fps": 30,
  "length": 1262
}
```

## 🚨 Common Issues

- **Images not loading**: Check `public/keyframes/` structure
- **Video won't open**: Verify JSON metadata exists
- **Search fails**: Verify backend URL connection

## 👥 Team: Tralalero Tralala
Trần Nguyên Huân • Trần Hải Phát • Nguyễn Bảo Tuấn • Nguyễn Phát Đạt • Doãn Anh Khoa