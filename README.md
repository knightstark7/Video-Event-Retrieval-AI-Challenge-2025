# Video Event Retrieval AI Challenge 2025

Multimodal search system for video content using CLIP and Vietnamese text embeddings.

## 🚀 Quick Start

### 1. Setup Backend on Kaggle
1. Upload `videoframeretrievalsystem.ipynb` to [Kaggle](https://www.kaggle.com/code)
2. Set accelerator to **GPU**
3. Run all cells sequentially
4. Copy the ngrok URL: `https://xxxxx.ngrok-free.app`

### 2. Setup Frontend
```bash
cd frame-ui
npm install
npm start
```
Frontend runs at `http://localhost:3000`

### 3. Connect & Search
1. Enter Kaggle backend URL in sidebar
2. Choose search mode: Hybrid / CLIP / Vintern
3. Enter Vietnamese query and search
4. Select results using checkboxes
5. Download selected items as CSV

## 🏗️ Architecture

**Backend:** FastAPI + CLIP + Vietnamese embeddings + Qdrant  
**Frontend:** React with search modes, CSV export, and timing display

## 🔧 API

```http
POST /search
{
  "query": "con chó màu đen",
  "topK": 10,
  "mode": "hybrid"
}
```

**Response:**
```json
{
  "results": [
    {"image": "L26_V299_1356", "caption": "L26_V299_1356 | Score: 0.85"}
  ]
}
```

## 🎯 Search Modes

- **Hybrid**: CLIP + Vintern
- **CLIP**: Visual similarity only
- **Vintern**: Vietnamese text only

## 📥 CSV Export

**Select results** using checkboxes on each image  
**Export format:** `L00_V0035.mp4,021664`  
**Controls:** Select Page / Clear All / Download CSV  
**Usage:** For submissions purpose

## 📁 Project Structure

```
├── videoframeretrievalsystem.ipynb    # Kaggle backend notebook
├── frame-ui/                          # React frontend
│   ├── public/
│   │   └── keyframes/                 # ⚠️ REQUIRED: Put keyframe images here
│   │       ├── L21/L21_V001/          # Format: /L{batch}/L{batch}_V{video}/
│   │       ├── L22/L22_V001/          #         L21_V001_1234.jpg
│   │       └── ...
│   ├── src/App.js                     # Main app
│   └── package.json
└── README.md
```

## 🖼️ Keyframes Setup

**Required Directory:** `frame-ui/public/keyframes/`

**Structure:**
```
keyframes/
├── L26/
│   └── L26_V299/
│       └── L26_V299_1356.jpg
├── L27/
│   └── L27_V001/
│       └── L27_V001_5432.jpg
```

**Without keyframes:** Images will show "Image Not Found" placeholder.

## 👥 Team: Tralalero Tralala
Trần Nguyên Huân • Trần Hải Phát • Nguyễn Bảo Tuấn • Nguyễn Phát Đạt • Doãn Anh Khoa