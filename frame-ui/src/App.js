/**
 * Video Event Retrieval AI Challenge 2025
 * Multimodal search interface with text and image search capabilities
 * Supports TRAKE, Q&A, and Textual KIS modes
 */

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
  // Search State
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState("text");
  const [searchMode, setSearchMode] = useState("hybrid");
  const [captionMode, setCaptionMode] = useState("bge");
  const [alpha, setAlpha] = useState(0.5);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTime, setSearchTime] = useState(null);
  const [topK, setTopK] = useState(10);

  // Results State
  const [results, setResults] = useState([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedItems, setSelectedItems] = useState(new Set());

  // Backend State
  const [backendUrl, setBackendUrl] = useState("");
  const [isConnected, setIsConnected] = useState(false);

  // Image Search State
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  // App Modes State
  const [appMode, setAppMode] = useState("textual-kis");
  const [frameAnswers, setFrameAnswers] = useState({});
  const [csvFileName, setCsvFileName] = useState("selected_results");

  // Video Player State
  const [loadingVideo, setLoadingVideo] = useState(null);
  const [videoPlayer, setVideoPlayer] = useState(null);
  
  // Zoom State for TRAKE frames
  const [zoomedFrame, setZoomedFrame] = useState(null);
  // Temporal Search State (available for all modes)
  const [temporalSearch, setTemporalSearch] = useState({
    events: [""],
    results: [],
    currentPage: 0,
    isActive: false
  });

  // TRAKE Mode State (original design)
  const [trakeMode, setTrakeMode] = useState({
    selectedVideo: null,
    videoFrames: [],
    eventSequences: [],
    currentSequence: [],
    currentPage: 0,
    framesPerPage: 10
  });
  // Constants
  const pageSize = 8;

  async function fetchSearchResults(query, imageFile = null) {
    if (!backendUrl.trim()) {
      alert("Please enter the Kaggle backend URL first!");
      return [];
    }

    try {
      let response;

      if (searchType === "image" && imageFile) {
        // Image search using FormData
        const formData = new FormData();
        formData.append('file', imageFile);
        formData.append('topK', topK.toString());
        formData.append('mode', 'image');
        formData.append('query', '');

        response = await fetch(`${backendUrl}/search`, {
          method: "POST",
          headers: {
            "ngrok-skip-browser-warning": "true"
          },
          body: formData,
        });
      } else {
        // Text search using FormData (backend expects Form parameters)
        const formData = new FormData();
        formData.append('query', query);
        formData.append('topK', topK.toString());
        formData.append('mode', searchMode);
        formData.append('caption_mode', captionMode);
        formData.append('alpha', alpha.toString());

        response = await fetch(`${backendUrl}/search`, {
          method: "POST",
          headers: {
            "ngrok-skip-browser-warning": "true"
          },
          body: formData,
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      const data = await response.json();
      setIsConnected(true);
      return data.results;
    } catch (error) {
      setIsConnected(false);
      alert(`Search failed: ${error.message}\nPlease check your backend URL.`);
      return [];
    }
  }

  async function fetchTemporalSearchResults(events) {
    if (!backendUrl.trim()) {
      alert("Please enter the Kaggle backend URL first!");
      return [];
    }

    try {
      const formData = new FormData();
      formData.append('events', JSON.stringify(events));
      formData.append('topK', topK.toString());
      formData.append('mode', searchMode);
      formData.append('caption_mode', captionMode);
      formData.append('alpha', alpha.toString());

      const response = await fetch(`${backendUrl}/temporal_search`, {
        method: "POST",
        headers: {
          "ngrok-skip-browser-warning": "true"
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      const data = await response.json();
      setIsConnected(true);
      return data.results;
    } catch (error) {
      setIsConnected(false);
      alert(`Temporal search failed: ${error.message}\nPlease check your backend URL.`);
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

  const updateFrameAnswer = (videoId, answer) => {
    setFrameAnswers(prev => ({
      ...prev,
      [videoId]: answer
    }));
  };

  const fetchVideoFrames = async (videoId) => {
    const parts = videoId.split('_');
    const batch = parts[0];
    const videoNum = parts[1];
    const baseVideoId = `${batch}_${videoNum}`;

    try {
      // Load the keyframes index
      const indexResponse = await fetch('/media-info-aic25-b1/media-info/keyframes_index.json');

      if (indexResponse.ok) {
        const keyframesIndex = await indexResponse.json();
        const imagePaths = keyframesIndex[baseVideoId];

        if (imagePaths && imagePaths.length > 0) {
          // Convert image paths to frame objects
          const frames = imagePaths.map(imagePath => {
            // Extract frame number from path (e.g., /keyframes/L21/L21_V008/L21_V008_1200.jpg -> 1200)
            const filename = imagePath.split('/').pop();
            const frameMatch = filename.match(/_(\d+)\.jpg$/);
            const frameNum = frameMatch ? parseInt(frameMatch[1]) : 0;

            return {
              videoId: `${baseVideoId}_${frameNum}`,
              frameNum: frameNum,
              imagePath: imagePath
            };
          });

          // Sort by frame number
          frames.sort((a, b) => a.frameNum - b.frameNum);
          return frames;
        }
      }
    } catch (error) {
      console.error('Error loading keyframes index:', error);
    }

    return [];
  };

  const selectVideoForTrake = async (videoId) => {
    const parts = videoId.split('_');
    const baseVideoId = `${parts[0]}_${parts[1]}`;

    setTrakeMode(prev => ({
      ...prev,
      selectedVideo: baseVideoId,
      videoFrames: [],
      currentSequence: [],
      currentPage: 0
    }));

    const frames = await fetchVideoFrames(videoId);

    setTrakeMode(prev => ({
      ...prev,
      videoFrames: frames
    }));
  };

  const goToTrakePage = (pageIndex) => {
    const totalPages = Math.ceil(trakeMode.videoFrames.length / 10);
    let newPage = pageIndex;

    if (newPage < 0) newPage = 0;
    if (newPage >= totalPages) newPage = totalPages - 1;

    setTrakeMode(prev => ({
      ...prev,
      currentPage: newPage
    }));
  };

  const addFrameToSequence = (frameNum) => {
    setTrakeMode(prev => ({
      ...prev,
      currentSequence: [...prev.currentSequence, frameNum].sort((a, b) => a - b)
    }));
  };

  const removeFrameFromSequence = (frameNum) => {
    setTrakeMode(prev => ({
      ...prev,
      currentSequence: prev.currentSequence.filter(f => f !== frameNum)
    }));
  };

  const saveEventSequence = () => {
    if (trakeMode.currentSequence.length === 0) {
      alert("Please select at least one frame for the event sequence.");
      return;
    }

    setTrakeMode(prev => ({
      ...prev,
      eventSequences: [
        ...prev.eventSequences,
        {
          videoId: prev.selectedVideo,
          frames: [...prev.currentSequence]
        }
      ],
      currentSequence: []
    }));
  };

  // Temporal Search Functions (available for all modes)
  const handleTemporalEventChange = (index, value) => {
    setTemporalSearch(prev => ({
      ...prev,
      events: prev.events.map((event, i) => 
        i === index ? value : event
      )
    }));
  };

  const addTemporalEvent = () => {
    setTemporalSearch(prev => ({
      ...prev,
      events: [...prev.events, ""]
    }));
  };

  const removeTemporalEvent = (index) => {
    if (temporalSearch.events.length <= 1) return;
    setTemporalSearch(prev => ({
      ...prev,
      events: prev.events.filter((_, i) => i !== index)
    }));
  };


  const handleTemporalSearch = async () => {
    const validEvents = temporalSearch.events.filter(event => event.trim() !== "");
    if (validEvents.length === 0) {
      alert("Please enter at least one temporal event to search.");
      return;
    }

    setIsSearching(true);
    const startTime = Date.now();
    
    try {
      const results = await fetchTemporalSearchResults(validEvents);
      const endTime = Date.now();
      const searchDuration = ((endTime - startTime) / 1000).toFixed(2);
      
      // Map temporal results to standard format
      const finalResults = results[results.length - 1] || [];
      const mappedResults = finalResults.map(item => {
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

      setTemporalSearch(prev => ({
        ...prev,
        results: mappedResults,
        currentPage: 0,
        isActive: true
      }));
      setResults(mappedResults);
      setPageIndex(0);
      setSearchTime(searchDuration);
    } catch (error) {
      console.error('Temporal search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const exitTemporalSearch = () => {
    setTemporalSearch(prev => ({
      ...prev,
      isActive: false,
      results: []
    }));
    setResults([]);
    setPageIndex(0);
  };

  const deleteEventSequence = (index) => {
    setTrakeMode(prev => ({
      ...prev,
      eventSequences: prev.eventSequences.filter((_, i) => i !== index)
    }));
  };

  const downloadCSV = () => {
    // Handle temporal search results for all modes
    if (temporalSearch.isActive && temporalSearch.results.length > 0) {
      const csvData = [];
      temporalSearch.results.forEach(result => {
        const parts = result.videoId.split('_');
        if (parts.length >= 3) {
          const videoFile = `${parts[0]}_${parts[1]}`;
          const frameNum = parts[2];
          
          if (appMode === "qa") {
            const answer = frameAnswers[result.videoId] || "";
            csvData.push(`${videoFile}, ${frameNum}, "${answer.replace(/"/g, '""')}"`);  
          } else {
            csvData.push(`${videoFile}, ${frameNum}`);
          }
        }
      });
      
      const csvContent = csvData.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${csvFileName || 'temporal_search_results'}.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
      return;
    }

    if (appMode === "trake") {
      if (trakeMode.eventSequences.length === 0) {
        alert("Please create at least one event sequence to download.");
        return;
      }

      const csvData = [];
      trakeMode.eventSequences.forEach(sequence => {
        const framesList = sequence.frames.join(', ');
        csvData.push(`${sequence.videoId}, ${framesList}`);
      });

      const csvContent = csvData.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${csvFileName || 'trake_event_sequences'}.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
      return;
    }

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
        const videoFile = `${batch}_${videoNum}`;

        if (appMode === "qa") {
          const answer = frameAnswers[videoId] || "";
          csvData.push(`${videoFile}, ${frameNum}, "${answer.replace(/"/g, '""')}"`);
        } else {
          csvData.push(`${videoFile}, ${frameNum}`);
        }
      }
    });

    const csvContent = csvData.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const defaultName = appMode === "qa" ? "qa_selected_results" : "textual_kis_selected_results";
    link.download = `${csvFileName || defaultName}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const handleImageUpload = (file) => {
    if (file && file.type.startsWith('image/')) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target.result);
      };
      reader.readAsDataURL(file);
    } else {
      alert('Please select a valid image file.');
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    handleImageUpload(file);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  async function search() {
    // Validation based on search type
    if (searchType === "text" && !query.trim()) {
      setResults([]);
      setSearchTime(null);
      setSelectedItems(new Set());
      setFrameAnswers({});
      return;
    }

    if (searchType === "image" && !imageFile) {
      alert("Please upload an image for image search.");
      return;
    }

    setIsSearching(true);
    setSearchTime(null);
    setSelectedItems(new Set());
    setFrameAnswers({});
    setTrakeMode({
      selectedVideo: null,
      videoFrames: [],
      eventSequences: [],
      currentSequence: []
    });

    try {
      const startTime = performance.now();
      const data = await fetchSearchResults(query, imageFile);
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
      if (event.key === 'Escape') {
        if (zoomedFrame) {
          setZoomedFrame(null);
        } else if (videoPlayer) {
          setVideoPlayer(null);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [videoPlayer, zoomedFrame]);

  // Pagination logic - separate for temporal search and regular search
  const temporalFrameSize = 8;
  const currentDataSource = temporalSearch.isActive ? temporalSearch.results : results;
  const currentPageSize = temporalSearch.isActive ? temporalFrameSize : pageSize;
  
  const totalPages = Math.max(Math.ceil(currentDataSource.length / currentPageSize), 1);

  const currentPageData = currentDataSource.slice(
    (temporalSearch.isActive ? temporalSearch.currentPage : pageIndex) * currentPageSize,
    ((temporalSearch.isActive ? temporalSearch.currentPage : pageIndex) + 1) * currentPageSize
  );

  const goToPage = (newPageIndex) => {
    if (newPageIndex < 0) newPageIndex = 0;
    else if (newPageIndex >= totalPages) newPageIndex = totalPages - 1;
    
    if (temporalSearch.isActive) {
      setTemporalSearch(prev => ({
        ...prev,
        currentPage: newPageIndex
      }));
    } else {
      setPageIndex(newPageIndex);
    }
  };

  const missingCount = currentPageSize - currentPageData.length;

  return (
    <div className="container">
      <div className="sidebar">
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
              value={topK} onChange={(e) => setTopK(Number(e.target.value))} />
          </label>

          <div className="mode-selection-section">
            <label className="mode-label">App Mode:</label>
            <select
              className="mode-select"
              value={appMode}
              onChange={(e) => {
                setAppMode(e.target.value);
                setSelectedItems(new Set());
                setFrameAnswers({});
              }}
            >
              <option value="textual-kis">📋 Textual KIS</option>
              <option value="qa">❓ Q&A</option>
              <option value="trake">🎬 TRAKE</option>
            </select>
          </div>

          <div className="search-type-section">
            <label className="search-type-label">Search Type:</label>
            <select
              className="search-type-select"
              value={searchType}
              onChange={(e) => {
                setSearchType(e.target.value);
                if (e.target.value === "image") {
                  setQuery("");
                } else {
                  clearImage();
                }
              }}
            >
              <option value="text">📝 Text Search</option>
              <option value="image">🖼️ Image Search</option>
            </select>
          </div>

          {searchType === "text" && (
            <>
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

              {(searchMode === "hybrid" || searchMode === "vintern") && (
                <div className="caption-mode-section">
                  <label className="caption-mode-label">Caption Model:</label>
                  <select
                    className="caption-mode-select"
                    value={captionMode}
                    onChange={(e) => setCaptionMode(e.target.value)}
                  >
                    <option value="bge">🇻🇳 Vietnamese_Embedding_v2</option>
                    <option value="gte">📄 vietnamese-document-embedding</option>
                  </select>
                </div>
              )}

              {searchMode === "hybrid" && (
                <div className="alpha-section">
                  <label className="alpha-label">
                    Text/Visual Balance: {(alpha * 100).toFixed(0)}% text
                    <input
                      className="alpha-slider"
                      type="range"
                      min="0.1"
                      max="0.9"
                      step="0.1"
                      value={alpha}
                      onChange={(e) => setAlpha(parseFloat(e.target.value))}
                    />
                  </label>
                </div>
              )}
            </>
          )}

          {searchType === "image" && (
            <div className="image-upload-section">
              <label className="image-upload-label">Drag and Drop Image:</label>
              <div
                className="image-drop-area"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                style={{
                  border: '2px dashed #ccc',
                  padding: '20px',
                  textAlign: 'center',
                  backgroundColor: '#121212',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                <p>Drop an image here or click to select</p>
                <input
                  id="image-upload-input"
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e.target.files[0])}
                  style={{ display: 'none' }}
                />
                <button
                  onClick={() => document.getElementById('image-upload-input').click()}
                  className="select-image-btn"
                  type="button"
                >
                  Select Image
                </button>
              </div>
              {imagePreview && (
                <div className="image-preview">
                  <img
                    src={imagePreview}
                    alt="Upload preview"
                    className="preview-image"
                  />
                  <button
                    onClick={clearImage}
                    className="clear-image-btn"
                    type="button"
                  >
                    ✕ Clear
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Temporal Search Section - Available for all modes */}
          <div className="temporal-search-sidebar">
            <div className="temporal-header">
              <h4>⏰ Temporal Search</h4>
              <p className="temporal-description">Search sequential events</p>
            </div>

            <div className="temporal-events">
              {temporalSearch.events.map((event, index) => (
                <div key={index} className="temporal-event-row">
                  <label className="event-label">E{index + 1}:</label>
                  <input
                    type="text"
                    className="temporal-event-input"
                    placeholder="Describe event..."
                    value={event}
                    onChange={(e) => handleTemporalEventChange(index, e.target.value)}
                  />
                  {temporalSearch.events.length > 1 && (
                    <button
                      className="remove-event-btn"
                      onClick={() => removeTemporalEvent(index)}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="temporal-controls">
              <button
                className="add-event-btn"
                onClick={addTemporalEvent}
                disabled={temporalSearch.events.length >= 5}
              >
                + Add Event
              </button>
              <button
                className="temporal-search-btn"
                onClick={handleTemporalSearch}
                disabled={isSearching || temporalSearch.events.every(e => !e.trim())}
              >
                {isSearching ? "Searching..." : "🔍 Search"}
              </button>
              {temporalSearch.isActive && (
                <button
                  className="exit-temporal-btn"
                  onClick={exitTemporalSearch}
                >
                  ✕ Exit
                </button>
              )}
            </div>
          </div>

          {((results.length > 0 && appMode !== "trake") || (appMode === "trake" && trakeMode.eventSequences.length > 0) || temporalSearch.isActive) && (
            <div className="csv-export-section">
              <label className="csv-label">
                Export Selected ({
                  temporalSearch.isActive ? "Temporal Results" :
                  appMode === "qa" ? "Q&A Format" :
                    appMode === "trake" ? "TRAKE Format" :
                      "Textual KIS"
                }):
              </label>
              <input
                className="csv-filename-input"
                type="text"
                placeholder="CSV filename"
                value={csvFileName}
                onChange={(e) => setCsvFileName(e.target.value)}
              />
              <div className="csv-controls">
                <div className="selection-info">
                  {temporalSearch.isActive ? (
                    <>
                      {temporalSearch.results.length} temporal results
                      <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>
                        From {temporalSearch.events.filter(e => e.trim()).length} events
                      </div>
                    </>
                  ) : appMode === "trake" ? (
                    <>
                      {trakeMode.eventSequences.length} event sequences
                      <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>
                        Current sequence: {trakeMode.currentSequence.length} frames
                      </div>
                    </>
                  ) : (
                    <>
                      {selectedItems.size} selected
                      {appMode === "qa" && (
                        <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>
                          {Object.keys(frameAnswers).filter(id => selectedItems.has(id) && frameAnswers[id]).length} with answers
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="csv-buttons">
                  {appMode !== "trake" && (
                    <>
                      <button className="csv-btn select-all" onClick={selectAllCurrentPage}>
                        Select Page
                      </button>
                      <button className="csv-btn clear-all" onClick={clearAllSelection}>
                        Clear All
                      </button>
                    </>
                  )}
                  <button
                    className="csv-btn download"
                    onClick={downloadCSV}
                    disabled={
                      temporalSearch.isActive ? temporalSearch.results.length === 0 :
                      appMode === "trake" ? trakeMode.eventSequences.length === 0 : 
                      selectedItems.size === 0
                    }
                  >
                    📥 Download CSV
                  </button>
                </div>
              </div>
              {appMode === "qa" && (
                <div style={{ fontSize: "11px", color: "#666", marginTop: "5px" }}>
                  Format: videoFile,frameNum,answer
                </div>
              )}
              {appMode === "trake" && (
                <div style={{ fontSize: "11px", color: "#666", marginTop: "5px" }}>
                  Format: L10_V001, 1200, 1850, 2100, 2450
                </div>
              )}
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
                {temporalSearch.isActive ? (
                  `🔍 Temporal search completed in ${searchTime}s - ${results.length} results from ${temporalSearch.events.filter(e => e.trim()).length} events`
                ) : (
                  `🔍 Search completed in ${searchTime}s - ${results.length} results (${searchType === "image" ? "IMAGE SEARCH" : searchMode.toUpperCase()})`
                )}
              </div>
            )}
            <div className="result-box">
              {currentPageData.map((item, idx) => (
                <div key={idx} className={`card ${selectedItems.has(item.videoId) ? 'selected' : ''}`}>
                  <div className="card-header-new">
                    <div className="checkbox-caption-row">
                      {appMode === "trake" && !temporalSearch.isActive ? (
                        <button
                          className="trake-select-btn"
                          onClick={() => selectVideoForTrake(item.videoId)}
                        >
                          🎬 Select Video
                        </button>
                      ) : (
                        <input
                          type="checkbox"
                          className="card-checkbox-new"
                          checked={selectedItems.has(item.videoId)}
                          onChange={() => toggleItemSelection(item.videoId)}
                        />
                      )}
                      <span className="card-caption-new">{item.caption}</span>
                    </div>
                    {appMode === "qa" && selectedItems.has(item.videoId) && (
                      <div className="qa-input-section">
                        <textarea
                          className="qa-answer-input"
                          placeholder="Enter your answer for this frame..."
                          value={frameAnswers[item.videoId] || ""}
                          onChange={(e) => updateFrameAnswer(item.videoId, e.target.value)}
                          rows={2}
                        />
                      </div>
                    )}
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
              <button onClick={() => goToPage((temporalSearch.isActive ? temporalSearch.currentPage : pageIndex) - 1)} disabled={(temporalSearch.isActive ? temporalSearch.currentPage : pageIndex) === 0}>
                Previous
              </button>

              <span>
                Page {(temporalSearch.isActive ? temporalSearch.currentPage : pageIndex) + 1} of {totalPages}
                {temporalSearch.isActive && (
                  <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>
                    Temporal Search Results ({temporalFrameSize} per page)
                  </div>
                )}
              </span>

              <button
                onClick={() => goToPage((temporalSearch.isActive ? temporalSearch.currentPage : pageIndex) + 1)}
                disabled={(temporalSearch.isActive ? temporalSearch.currentPage : pageIndex) === totalPages - 1}
              >
                Next
              </button>
            </div>
          </>
        )}

        {/* TRAKE Mode Video Frames Viewer */}
        {appMode === "trake" && trakeMode.selectedVideo && trakeMode.videoFrames.length > 0 && (
          <div className="trake-video-section">
            <div className="trake-header">
              <h3>🎬 Video Frames: {trakeMode.selectedVideo}</h3>
              <div className="trake-controls">
                <div className="sequence-info">
                  Current Sequence: [{trakeMode.currentSequence.join(', ')}]
                </div>
                <button
                  className="save-sequence-btn"
                  onClick={saveEventSequence}
                  disabled={trakeMode.currentSequence.length === 0}
                >
                  💾 Save Sequence
                </button>
              </div>
            </div>

            <div className="trake-pagination-info">
              Showing {trakeMode.currentPage * 10 + 1}-{Math.min((trakeMode.currentPage + 1) * 10, trakeMode.videoFrames.length)} of {trakeMode.videoFrames.length} frames
            </div>

            <div className="trake-frames-grid">
              {trakeMode.videoFrames
                .slice(trakeMode.currentPage * 10, (trakeMode.currentPage + 1) * 10)
                .map((frame, idx) => (
                  <div key={frame.videoId} className={`trake-frame ${trakeMode.currentSequence.includes(frame.frameNum) ? 'selected' : ''}`}>
                    <div className="trake-frame-controls">
                      <input
                        type="checkbox"
                        checked={trakeMode.currentSequence.includes(frame.frameNum)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            addFrameToSequence(frame.frameNum);
                          } else {
                            removeFrameFromSequence(frame.frameNum);
                          }
                        }}
                      />
                      <span className="frame-number">Frame {frame.frameNum}</span>
                    </div>
                    <div className="trake-frame-image-container">
                      <img
                        src={frame.imagePath}
                        alt={`Frame ${frame.frameNum}`}
                        className="trake-frame-image"
                        onClick={() => setZoomedFrame(frame)}
                        onError={(e) => {
                          e.target.src = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5GcmFtZSBOb3QgRm91bmQ8L3RleHQ+PC9zdmc+";
                          e.target.style.filter = "grayscale(1)";
                        }}
                      />
                      <div className="zoom-indicator">🔍</div>
                    </div>
                  </div>
                ))}
            </div>

            {trakeMode.videoFrames.length > 10 && (
              <div className="trake-pagination">
                <button
                  onClick={() => goToTrakePage(trakeMode.currentPage - 1)}
                  disabled={trakeMode.currentPage === 0}
                  className="trake-page-btn"
                >
                  Previous
                </button>

                <span className="trake-page-info">
                  Page {trakeMode.currentPage + 1} of {Math.ceil(trakeMode.videoFrames.length / 10)}
                </span>

                <button
                  onClick={() => goToTrakePage(trakeMode.currentPage + 1)}
                  disabled={trakeMode.currentPage >= Math.ceil(trakeMode.videoFrames.length / 10) - 1}
                  className="trake-page-btn"
                >
                  Next
                </button>
              </div>
            )}

            {trakeMode.eventSequences.length > 0 && (
              <div className="saved-sequences">
                <h4>💾 Saved Event Sequences</h4>
                {trakeMode.eventSequences.map((sequence, idx) => (
                  <div key={idx} className="saved-sequence">
                    <span className="sequence-text">
                      {sequence.videoId}: [{sequence.frames.join(', ')}]
                    </span>
                    <button
                      className="delete-sequence-btn"
                      onClick={() => deleteEventSequence(idx)}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
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
                Keyframe: {videoPlayer.keyframe} → {Math.floor(videoPlayer.timestamp / 60)}:{String(videoPlayer.timestamp % 60).padStart(2, '0')}
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

        {/* Frame Zoom Modal for TRAKE */}
        {zoomedFrame && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
            zIndex: 1001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}>
            <div style={{
              position: 'relative',
              maxWidth: '95vw',
              maxHeight: '95vh',
              backgroundColor: '#1f1f1f',
              borderRadius: '12px',
              padding: '20px',
              overflow: 'hidden'
            }}>
              {/* Close button */}
              <button
                onClick={() => setZoomedFrame(null)}
                style={{
                  position: 'absolute',
                  top: '15px',
                  right: '15px',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '40px',
                  height: '40px',
                  fontSize: '18px',
                  cursor: 'pointer',
                  zIndex: 1002,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ×
              </button>

              {/* Frame info */}
              <div style={{
                color: 'white',
                marginBottom: '15px',
                fontSize: '18px',
                fontWeight: 'bold',
                textAlign: 'center'
              }}>
                {trakeMode.selectedVideo} - Frame {zoomedFrame.frameNum}
              </div>

              {/* Zoomed image */}
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                maxWidth: 'calc(95vw - 40px)',
                maxHeight: 'calc(95vh - 120px)',
                overflow: 'auto'
              }}>
                <img
                  src={zoomedFrame.imagePath}
                  alt={`Frame ${zoomedFrame.frameNum} - Zoomed`}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    borderRadius: '8px',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)'
                  }}
                  onError={(e) => {
                    e.target.src = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzMzIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5GcmFtZSBOb3QgRm91bmQ8L3RleHQ+PC9zdmc+";
                  }}
                />
              </div>

              {/* Instructions */}
              <div style={{
                color: '#999',
                marginTop: '15px',
                fontSize: '12px',
                textAlign: 'center'
              }}>
                Click image to view full resolution. Press ESC or click × to close.
              </div>
            </div>
          </div>
        )}

        <div className="search-row">
          {searchType === "text" ? (
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
          ) : (
            <div className="image-search-display">
              {imagePreview ? (
                <div className="search-image-preview">
                  <img src={imagePreview} alt="Search query" />
                  <span>Image uploaded - Click search to find similar images</span>
                </div>
              ) : (
                <div className="no-image-placeholder">
                  <span>No image selected - Drag and drop an image in settings</span>
                </div>
              )}
            </div>
          )}
          <button id="search-btn" onClick={search} disabled={isSearching}>
            {isSearching ? "..." : <FaArrowUp />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;