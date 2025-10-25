# Video Event Retrieval AI Challenge 2025

Multimodal search system for video content using CLIP and Vietnamese text embeddings.

## 🆕 **NEW: Dual-Batch Support**

### **Multi-Dataset**
- **Batch 1 (L-Series)**: L21_V001, L22_V002... → `keyframes/` + `media-info-aic25-b1/`
- **Batch 2 (K-Series)**: K01_V001, K02_V002... → `keyframes-b2/` + `media-info-aic25-b2/`

## 🚀 Quick Start

### 1. Frontend (React + Vite)

The frontend uses **Vite** for fast development and optimized builds.

```bash
cd frontend
npm install
npm run dev    # Opens http://localhost:5173 (Vite default port)
```

**Available Scripts:**
- `npm run dev` - Start development server with Hot Module Replacement (HMR)
- `npm run build` - Build for production (outputs to `dist/`)
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint for code quality

**Why Vite?**
- ⚡ Lightning-fast Hot Module Replacement (HMR)
- 📦 Optimized production builds with Rollup
- 🔧 Zero config for React + JSX
- 🚀 Faster startup than Create React App

**Development Server:**
- Default port: `http://localhost:5173`
- To change port: Edit `vite.config.js` or add `--port 3000` flag

**Project Structure:**
```
frontend/
├── src/
│   ├── App.jsx          # Main application component
│   ├── App.css          # Styling
│   ├── main.jsx         # Vite entry point
│   └── index.css        # Global styles
├── public/              # Static assets (keyframes, metadata)
├── vite.config.js       # Vite configuration
└── package.json         # Dependencies and scripts
```

### 2. Backend (Kaggle)
1. Upload `videoframeretrievalsystem.ipynb` to Kaggle
2. Enable GPU + Internet → Run all cells
3. Copy ngrok URL: `https://xxxxx.ngrok-free.app`
4. Paste URL in React UI settings (top-left input field)

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

## 📁 Required Data Structure

**Place keyframes and metadata in `frontend/public/`:**

```
frontend/public/
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

**Note:** Vite serves files from `public/` directory at the root path `/`

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

## 🚀 Production Deployment

### Build Frontend
```bash
cd frontend
npm run build    # Creates optimized build in dist/
```

The build outputs to `frontend/dist/` and can be served with any static file server:

```bash
# Preview production build locally
npm run preview

# Or serve with any static server
npx serve dist
```

### Deploy Options
- **Netlify/Vercel**: Drop `dist/` folder or connect Git repo
- **GitHub Pages**: Push `dist/` to `gh-pages` branch
- **Traditional Server**: Copy `dist/` to web server root

**Note:** Ensure backend URL is configured correctly in production build.

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

### Frontend (Vite)
- **Port already in use**: Change port in `vite.config.js` or use `npm run dev -- --port 3000`
- **Images not loading**: Ensure keyframes are in `frontend/public/keyframes/`
- **Hot reload not working**: Check if Vite dev server is running on correct port
- **Build errors**: Run `npm run lint` to check for code issues
- **Module not found**: Delete `node_modules` and run `npm install` again

### General
- **Video won't open**: Verify JSON metadata exists in `public/media-info-aic25-*/`
- **Search fails**: Verify backend URL connection and ngrok tunnel is active
- **CORS errors**: Backend must include proper CORS headers (already configured)

## 👥 Team: Tralalero Tralala
Trần Nguyên Huân • Trần Hải Phát • Nguyễn Bảo Tuấn • Nguyễn Phát Đạt • Doãn Anh Khoa