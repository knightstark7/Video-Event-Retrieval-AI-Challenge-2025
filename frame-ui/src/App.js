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

  // Handle item selection
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

  // Generate and download CSV
  const downloadCSV = () => {
    if (selectedItems.size === 0) {
      alert("Please select at least one item to download.");
      return;
    }

    // Convert selected items to CSV format
    const csvData = [];
    selectedItems.forEach(videoId => {
      // Parse videoId like "L00_V0035_021664" -> video: "L00_V0035.mp4", frame: "021664"
      const parts = videoId.split('_');
      if (parts.length >= 3) {
        const batch = parts[0]; // L00
        const videoNum = parts[1]; // V0035
        const frameNum = parts[2]; // 021664
        const videoFile = `${batch}_${videoNum}.mp4`;
        csvData.push(`${videoFile},${frameNum}`);
      }
    });

    // Create CSV content
    const csvContent = csvData.join('\n');
    
    // Create and download file
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
      setSelectedItems(new Set()); // Clear selections on new search
      return;
    }
    
    setIsSearching(true);
    setSearchTime(null);
    setSelectedItems(new Set()); // Clear selections on new search
    
    try {
      const startTime = performance.now();
      const data = await fetchSearchResults(query);
      const endTime = performance.now();
      const timeTaken = ((endTime - startTime) / 1000).toFixed(2);
      
      // Map search results to keyframe image paths
      const mappedResults = data.map(item => {
        const videoId = item.image.trim();
        
        // Parse video ID (e.g., "L26_V299_1356" -> batch: "L26", video: "L26_V299")
        const parts = videoId.split('_');
        const batch = parts[0];
        const videoNumber = parts[1];
        const baseVideoId = `${batch}_${videoNumber}`;
        
        // Generate keyframe path: /keyframes/{batch}/{baseVideoId}/{fullVideoId}.jpg
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
                  🔍 Tìm kiếm hoàn thành trong {searchTime}s - {results.length} kết quả ({searchMode.toUpperCase()})
                </div>
              )}
              <div className="result-box">
                {currentPageData.map((item, idx) => (
                  <div key={idx} className={`card ${selectedItems.has(item.videoId) ? 'selected' : ''}`}>
                    <div className="card-header">
                      <input 
                        type="checkbox" 
                        className="card-checkbox"
                        checked={selectedItems.has(item.videoId)}
                        onChange={() => toggleItemSelection(item.videoId)}
                      />
                      <span className="card-number">{pageIndex * pageSize + idx + 1}</span>
                    </div>
                    <img 
                      src={item.image} 
                      alt={`Keyframe for ${item.videoId}`}
                      onError={(e) => {
                        // Show placeholder if keyframe not found
                        e.target.src = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSBOb3QgRm91bmQ8L3RleHQ+PC9zdmc+";
                        e.target.style.filter = "grayscale(1)";
                      }}
                    />
                    <p className="card-caption">{item.caption}</p>
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
