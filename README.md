# Video Event Retrieval AI Challenge 2025

Multimodal search system for video content using CLIP and Vietnamese text embeddings.

## 🆕 **NEW: Dual-Batch Support**

### **Multi-Dataset**
- **Batch 1 (L-Series)**: L21_V001, L22_V002... → `keyframes/` + `media-info-aic25-b1/`
- **Batch 2 (K-Series)**: K01_V001, K02_V002... → `keyframes-b2/` + `media-info-aic25-b2/`

## 🚀 Quick Start

### 1. Frontend (React UI)
```bash
cd frame-ui
npm install
npm start    # Opens http://localhost:3000
```

### 2. Backend (Kaggle)
1. Upload `videoframeretrievalsystem.ipynb` to Kaggle
2. Enable GPU + Internet → Run all cells
3. Copy ngrok URL: `https://xxxxx.ngrok-free.app`
4. Paste URL in React UI settings

### 3. MPC Integration (Optional)
```bash
cd mpc-launcher
npm install
npm start    # Starts MPC service on port 3001
```

## 🎬 MPC Configuration

### Prerequisites
- **Install MPC**:
  - MPC-HC: https://mpc-hc.org/
  - MPC-BE: https://sourceforge.net/projects/mpcbe/
  - K-Lite Codec Pack (includes MPC-HC64)

- **Install yt-dlp**:
  - Download: https://github.com/yt-dlp/yt-dlp/releases
  - Place `yt-dlp.exe` in MPC folder or add to PATH

### UI Configuration
1. **Start MPC Service**: `cd mpc-launcher && npm start`
2. **Open React UI**: http://localhost:3000
3. **Settings** → **Video Player**: Select **"🎬 MPC-HC/BE (External)"**
4. **Click any frame** → MPC opens automatically at exact timestamp!


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

## 📁 Required Structure (Updated for Batch 2)

```
frame-ui/public/
├── keyframes/                    # Batch 1 (L-Series)
│   ├── L21/L21_V001/L21_V001_1234.jpg
│   └── L22/L22_V001/L22_V001_5678.jpg
├── keyframes-b2/                 # Batch 2 (K-Series)
│   ├── K01/K01_V001/K01_V001_1000.jpg
│   └── K02/K02_V003/K02_V003_2500.jpg
├── media-info-aic25-b1/media-info/   # Batch 1 metadata
│   ├── L21_V001.json
│   └── keyframes_index.json
└── media-info-aic25-b2/media-info/   # Batch 2 metadata
    ├── K01_V001.json
    └── keyframes_index.json
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