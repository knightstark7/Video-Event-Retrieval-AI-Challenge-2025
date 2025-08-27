import React, { useState, useEffect } from "react";
import { FaArrowUp, FaSearch } from "react-icons/fa";
import { FiSettings } from "react-icons/fi";
import "./App.css";

const resizeObserverErrHandler = e => {
  if (e.message === "ResizeObserver loop completed with undelivered notifications.") {
    return;
  }
  console.error(e);
};
window.addEventListener("error", resizeObserverErrHandler);

function App() {
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(10);
  const [results, setResults] = useState([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [backendUrl, setBackendUrl] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [searchTime, setSearchTime] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMode, setSearchMode] = useState("hybrid");
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [csvFileName, setCsvFileName] = useState("selected_results");
  const [loadingVideo, setLoadingVideo] = useState(null);
  const [videoPlayer, setVideoPlayer] = useState(null); // { videoId, timestamp, title }
  const pageSize = 8;
  
  async function fetchSearchResults(query) {
    if (!backendUrl.trim()) {
      alert("Please enter the Kaggle backend URL first!");
      return [];
    }
    
    try {
      const response = await fetch(`${backendUrl}/search`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({
          query: query,
          topK: topK,
          mode: searchMode
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setIsConnected(true);
      return data.results;
    } catch (error) {
      setIsConnected(false);
      alert(`Search failed: ${error.message}\nPlease check your backend URL.`);
      return [];
    }
  }

  const toggleItemSelection = (videoId) => {
    const newSelection = new Set(selectedItems);
    if (newSelection.has(videoId)) {
      newSelection.delete(videoId);
    } else {
      newSelection.add(videoId);
    }
    setSelectedItems(newSelection);
  };

  const selectAllCurrentPage = () => {
    const newSelection = new Set(selectedItems);
    currentPageData.forEach(item => {
      newSelection.add(item.videoId);
    });
    setSelectedItems(newSelection);
  };

  const clearAllSelection = () => {
    setSelectedItems(new Set());
  };

  const handleKeyframeClick = async (videoId) => {
    setLoadingVideo(videoId);
    try {
      const parts = videoId.split('_');
      if (parts.length < 3) {
        alert('Invalid video ID format');
        return;
      }
      
      const batch = parts[0];
      const videoNum = parts[1];
      const keyframeOrder = parseInt(parts[2]);
      const videoFile = `${batch}_${videoNum}`;
      
      const mediaInfoPath = `/media-info-aic25-b1/media-info/${videoFile}.json`;
      const response = await fetch(mediaInfoPath);
      if (!response.ok) {
        throw new Error(`Could not load video info for ${videoFile}`);
      }
      
      const videoInfo = await response.json();
      const youtubeUrl = videoInfo.watch_url;
      const videoDuration = videoInfo.length;
      const videoFPS = videoInfo.fps || 25;
      
      let finalTimestamp = Math.floor(keyframeOrder / videoFPS);
      console.log(`${videoFile}: ${videoFPS} FPS - keyframe ${keyframeOrder} → ${finalTimestamp}s (${Math.floor(finalTimestamp/60)}:${String(finalTimestamp%60).padStart(2,'0')})`);
      finalTimestamp = Math.max(0, Math.min(finalTimestamp, videoDuration - 1));
      
      const videoIdMatch = youtubeUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/);
      const youtubeVideoId = videoIdMatch ? videoIdMatch[1] : null;
      
      if (youtubeVideoId) {
        setVideoPlayer({
          videoId: youtubeVideoId,
          timestamp: finalTimestamp,
          title: videoInfo.title || `Video ${videoFile}`,
          keyframe: videoId
        });
      } else {
        throw new Error('Could not extract YouTube video ID');
      }
      
    } catch (error) {
      console.error('Error opening video:', error);
      alert(`Error opening video: ${error.message}`);
    } finally {
      setLoadingVideo(null);
    }
  };

  const downloadCSV = () => {
    if (selectedItems.size === 0) {
      alert("Please select at least one item to download.");
      return;
    }

    const csvData = [];
    selectedItems.forEach(videoId => {
      const parts = videoId.split('_');
      if (parts.length >= 3) {
        const batch = parts[0];
        const videoNum = parts[1];
        const frameNum = parts[2];
        const videoFile = `${batch}_${videoNum}.mp4`;
        csvData.push(`${videoFile},${frameNum}`);
      }
    });

    const csvContent = csvData.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${csvFileName || 'selected_results'}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  async function search() {
    if (!query.trim()) {
      setResults([]);
      setSearchTime(null);
      setSelectedItems(new Set());
      return;
    }
    
    setIsSearching(true);
    setSearchTime(null);
    setSelectedItems(new Set());
    
    try {
      const startTime = performance.now();
      const data = await fetchSearchResults(query);
      const endTime = performance.now();
      const timeTaken = ((endTime - startTime) / 1000).toFixed(2);
      
      const mappedResults = data.map(item => {
        const videoId = item.image.trim();
        const parts = videoId.split('_');
        const batch = parts[0];
        const videoNumber = parts[1];
        const baseVideoId = `${batch}_${videoNumber}`;
        const imagePath = `/keyframes/${batch}/${baseVideoId}/${videoId}.jpg`;
        
        return {
          ...item,
          videoId: videoId,
          image: imagePath
        };
      });
      
      setResults(mappedResults);
      setSearchTime(timeTaken);
      setPageIndex(0);
    } finally {
      setIsSearching(false);
    }
  }

  useEffect(() => {
    document.title = "AIC";
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && videoPlayer) {
        setVideoPlayer(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [videoPlayer]);

  const totalPages = Math.max(Math.ceil(results.length / pageSize), 1);

  const currentPageData = results.slice(
    pageIndex * pageSize,
    (pageIndex + 1) * pageSize
  );

  const goToPage = (newPageIndex) => {
    if (newPageIndex < 0) newPageIndex = 0;
    else if (newPageIndex >= totalPages) newPageIndex = totalPages - 1;
    setPageIndex(newPageIndex);
  };

  const missingCount = pageSize - currentPageData.length;

  return (
      <div className="container">
        <div className="sidebar">
          <div className="logo">AI CHALLENGE 2025</div>
          <div className="team-info">
            <h2> GROUP: Tralalero Tralala </h2>
            <ul>
              <li>Trần Nguyên Huân</li>
              <li>Trần Hải Phát</li>
              <li>Nguyễn Bảo Tuấn</li>
              <li>Nguyễn Phát Đạt</li>
              <li>Doãn Anh Khoa</li>
            </ul>
          </div>
          <div className="settings-title"> <FiSettings /> SETTINGS </div>
          <div className="sidebar-content">
            <div className="url-section">
              <label className="url-label">
                Backend URL:
                <input 
                  className="url-input" 
                  type="text" 
                  placeholder="https://xxxxxxx.ngrok-free.app"
                  value={backendUrl} 
                  onChange={(e) => setBackendUrl(e.target.value.trim())}
                />
              </label>
              <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
                <span className="status-dot"></span>
                {isConnected ? 'Connected' : 'Not Connected'}
              </div>
            </div>
            
            <label className="topk-label" >
              Top K: <input className="topk-input" type="number" min="10" max="100" step="1" 
              value={topK} onChange={(e) => setTopK(Number(e.target.value))}/>
            </label>
            
            <div className="search-mode-section">
              <label className="search-mode-label">Search Mode:</label>
              <select 
                className="search-mode-select" 
                value={searchMode} 
                onChange={(e) => setSearchMode(e.target.value)}
              >
                <option value="hybrid">🔗 Hybrid (CLIP + Vintern)</option>
                <option value="clip">🖼️ CLIP Only</option>
                <option value="vintern">📝 Vintern Only</option>
              </select>
            </div>

            {results.length > 0 && (
              <div className="csv-export-section">
                <label className="csv-label">Export Selected:</label>
                <input 
                  className="csv-filename-input" 
                  type="text" 
                  placeholder="CSV filename"
                  value={csvFileName} 
                  onChange={(e) => setCsvFileName(e.target.value)}
                />
                <div className="csv-controls">
                  <div className="selection-info">
                    {selectedItems.size} selected
                  </div>
                  <div className="csv-buttons">
                    <button className="csv-btn select-all" onClick={selectAllCurrentPage}>
                      Select Page
                    </button>
                    <button className="csv-btn clear-all" onClick={clearAllSelection}>
                      Clear All
                    </button>
                    <button 
                      className="csv-btn download" 
                      onClick={downloadCSV}
                      disabled={selectedItems.size === 0}
                    >
                      📥 Download CSV
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="main-content">
          {isSearching ? (
            <div className="empty-state" style={{ textAlign: "center", marginTop: 50 }}>
              <FaSearch size={80} color="#999" />
              <p>Đang tìm kiếm...</p>
            </div>
          ) : results.length === 0 ? (
            <div className="empty-state" style={{ textAlign: "center", marginTop: 50 }}>
              <FaSearch size={80} color="#999" />
              <p>Chưa có kết quả để hiển thị</p>
            </div>
          ) : (
            <>
              {searchTime && (
                <div style={{ 
                  textAlign: "center", 
                  margin: "10px 0", 
                  color: "#666", 
                  fontSize: "14px" 
                }}>
                  🔍 Search completed in {searchTime}s - {results.length} results ({searchMode.toUpperCase()})
                </div>
              )}
              <div className="result-box">
                {currentPageData.map((item, idx) => (
                  <div key={idx} className={`card ${selectedItems.has(item.videoId) ? 'selected' : ''}`}>
                    <div className="card-header-new">
                      <div className="checkbox-caption-row">
                        <input 
                          type="checkbox" 
                          className="card-checkbox-new"
                          checked={selectedItems.has(item.videoId)}
                          onChange={() => toggleItemSelection(item.videoId)}
                        />
                        <span className="card-caption-new">{item.caption}</span>
                      </div>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <img 
                        src={item.image} 
                        alt={`Keyframe for ${item.videoId}`}
                        onClick={() => handleKeyframeClick(item.videoId)}
                        style={{ 
                          cursor: loadingVideo === item.videoId ? 'wait' : 'pointer',
                          opacity: loadingVideo === item.videoId ? 0.7 : 1
                        }}
                        title={`🎥 Click to open video at timestamp ${item.videoId.split('_')[2]}`}
                        onError={(e) => {
                          // Show placeholder if keyframe not found
                          e.target.src = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSBOb3QgRm91bmQ8L3RleHQ+PC9zdmc+";
                          e.target.style.filter = "grayscale(1)";
                        }}
                      />
                      {loadingVideo === item.videoId && (
                        <div style={{
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          background: 'rgba(0, 0, 0, 0.8)',
                          color: 'white',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          pointerEvents: 'none'
                        }}>
                          Opening video...
                        </div>
                      )}
                      <div style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        background: 'rgba(0, 0, 0, 0.7)',
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 'bold'
                      }}>
                        🎥 CLICK
                      </div>
                    </div>
                  </div>
                ))}
                {Array.from({ length: missingCount }).map((_, idx) => (
                  <div key={"empty-" + idx} className="card-empty"></div>
                ))}
              </div>
              <div className="pagination">
                <button onClick={() => goToPage(pageIndex - 1)} disabled={pageIndex === 0}>
                  Previous
                </button>

                <span>
                  Page {pageIndex + 1} of {totalPages}
                </span>

                <button
                  onClick={() => goToPage(pageIndex + 1)}
                  disabled={pageIndex === totalPages - 1}
                >
                  Next
                </button>
              </div>
            </>
          )}

          {/* Embedded Video Player */}
          {videoPlayer && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <div style={{
                position: 'relative',
                width: '90%',
                maxWidth: '800px',
                backgroundColor: '#000',
                borderRadius: '8px',
                padding: '20px'
              }}>
                {/* Close button */}
                <button
                  onClick={() => setVideoPlayer(null)}
                  style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    background: '#ff4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: '40px',
                    height: '40px',
                    fontSize: '20px',
                    cursor: 'pointer',
                    zIndex: 1001
                  }}
                >
                  ×
                </button>
                
                {/* Video title and keyframe info */}
                <div style={{
                  color: 'white',
                  marginBottom: '10px',
                  fontSize: '16px',
                  fontWeight: 'bold'
                }}>
                  {videoPlayer.title}
                </div>
                <div style={{
                  color: '#ccc',
                  marginBottom: '15px',
                  fontSize: '14px'
                }}>
                  Keyframe: {videoPlayer.keyframe} → {Math.floor(videoPlayer.timestamp/60)}:{String(videoPlayer.timestamp%60).padStart(2,'0')}
                </div>
                
                {/* YouTube iframe */}
                <iframe
                  width="100%"
                  height="450"
                  src={`https://www.youtube.com/embed/${videoPlayer.videoId}?start=${videoPlayer.timestamp}&autoplay=1&rel=0&modestbranding=1`}
                  title={videoPlayer.title}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  style={{
                    borderRadius: '8px'
                  }}
                ></iframe>
                
                {/* Instructions */}
                <div style={{
                  color: '#999',
                  marginTop: '10px',
                  fontSize: '12px',
                  textAlign: 'center'
                }}>
                  Video will start at the keyframe timestamp. Press ESC or click × to close.
                </div>
              </div>
            </div>
          )}

          <div className="search-row">
            <input
              type="text"
              placeholder="Enter text query..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  search();
                }
              }}
            />
            <button id="search-btn" onClick={search} disabled={isSearching}>
              {isSearching ? "..." : <FaArrowUp />}
            </button>
          </div>
        </div>
      </div>
  );
}

export default App;
