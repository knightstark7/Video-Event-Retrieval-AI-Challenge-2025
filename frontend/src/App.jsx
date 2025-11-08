/**
 * Video Event Retrieval AI Challenge 2025
 * Multimodal search interface with text and image search capabilities
 * Supports Q&A and Textual KIS modes with temporal search
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
  const [searchModeType, setSearchModeType] = useState("normal"); // "normal" or "temporal"
  const [frameAnswers, setFrameAnswers] = useState({});
  const [csvFileName, setCsvFileName] = useState("selected_results");

  // Video Player State
  const [loadingVideo, setLoadingVideo] = useState(null);
  const [videoPlayer, setVideoPlayer] = useState(null);
  const [timeInput, setTimeInput] = useState("");
  const [calculatedFrameOrder, setCalculatedFrameOrder] = useState(null);

  // Video Filter State
  const [videoFilter, setVideoFilter] = useState("all"); // "all" or specific video ID

  // Rerank State
  const [useRerank, setUseRerank] = useState(false);
  
  // Sidebar Video Keyframes Viewer State
  const [selectedVideoForViewing, setSelectedVideoForViewing] = useState(""); // Video ID to view keyframes
  const [videoKeyframes, setVideoKeyframes] = useState([]); // Keyframes from selected video
  const [loadingVideoKeyframes, setLoadingVideoKeyframes] = useState(false);
  const [selectedBrowseFrames, setSelectedBrowseFrames] = useState(new Set()); // Selected frames from browse mode

  // Video Browse State (right side display)
  const [videoBrowseMode, setVideoBrowseMode] = useState(false);
  const [browsedVideoId, setBrowsedVideoId] = useState("");
  const [browseCurrentPage, setBrowseCurrentPage] = useState(0);
  const [browseZoomedFrame, setBrowseZoomedFrame] = useState(null);
  
  // Zoom State for frames
  const [zoomedFrame, setZoomedFrame] = useState(null);
  // Temporal Search State (available for all modes)
  const [temporalSearch, setTemporalSearch] = useState({
    events: [""],
    results: [],
    currentPage: 0,
    isActive: false,
    searchMode: "progressive"  // "progressive" or "consolidated"
  });

  // DRES Authentication State
  const [dresConfig, setDresConfig] = useState({
    baseUrl: "https://eventretrieval.oj.io.vn",
    username: "team043",
    password: "qUB5bJsBL9",
    sessionId: "",
    isAuthenticated: false
  });

  // DRES Evaluation State
  const [dresEvaluation, setDresEvaluation] = useState({
    evaluations: [],
    selectedEvaluationId: "",
    evaluationName: "",
    status: ""
  });

  // DRES Submission State
  const [dresSubmission, setDresSubmission] = useState({
    isSubmitting: false,
    lastSubmission: null,
    submissionHistory: []
  });

  // DRES Review State (for manual answer editing before submission)
  const [dresReview, setDresReview] = useState({
    isOpen: false,
    items: [], // Array of {videoId, frameId, timeMs, answer, videoName}
    mode: "", // "kis", "qa", "trake"
    editedAnswers: {} // videoId -> edited answer
  });

  // DRES Manual Submission State
  const [dresManualSubmit, setDresManualSubmit] = useState({
    isOpen: false,
    mode: "textual-kis", // "textual-kis", "qa", "trake"
    rawInput: "" // User input text area
  });

  // DRES Submission History
  const [submissionHistory, setSubmissionHistory] = useState(() => {
    // Load from localStorage on init
    const saved = localStorage.getItem('dres_submission_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  // Save submission history to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('dres_submission_history', JSON.stringify(submissionHistory));
  }, [submissionHistory]);

  // Constants
  const pageSize = 8;

  // Helper function to determine batch configuration
  const getBatchConfig = (videoId) => {
    const videoPrefix = videoId.charAt(0);
    
    if (videoPrefix === 'L') {
      // Batch 1: L-prefixed videos (L21_V001, L22_V002, etc.)
      return {
        keyframesDir: 'keyframes',
        mediaInfoDir: 'media-info-aic25-b1/media-info',
        isKPrefixed: false
      };
    } else if (videoPrefix === 'K') {
      // Batch 2: K-prefixed videos (K01_V001, K02_V002, etc.)
      return {
        keyframesDir: 'keyframes-b2',
        mediaInfoDir: 'media-info-aic25-b2/media-info', 
        isKPrefixed: true
      };
    } else {
      // Default to batch 1 for unknown formats
      return {
        keyframesDir: 'keyframes',
        mediaInfoDir: 'media-info-aic25-b1/media-info',
        isKPrefixed: false
      };
    }
  };

  // FPS cache for time calculation
  const [fpsCache, setFpsCache] = useState({});

  // Calculate time in milliseconds from frame ID
  const calculateTimeMs = async (frameId) => {
    const parts = frameId.split('_');
    if (parts.length < 3) return null;

    const batch = parts[0];
    const videoNum = parts[1];
    const frameNumber = parseInt(parts[2]);
    const mediaItemName = `${batch}_${videoNum}`;

    // Check cache first
    if (fpsCache[mediaItemName]) {
      const fps = fpsCache[mediaItemName];
      return Math.round((frameNumber / fps) * 1000);
    }

    // Fetch FPS from media-info
    try {
      const batchConfig = getBatchConfig(frameId);
      const mediaInfoPath = `/${batchConfig.mediaInfoDir}/${mediaItemName}.json`;
      const response = await fetch(mediaInfoPath);
      if (response.ok) {
        const videoInfo = await response.json();
        const fps = videoInfo.fps || 25;
        // Update cache
        setFpsCache(prev => ({ ...prev, [mediaItemName]: fps }));
        return Math.round((frameNumber / fps) * 1000);
      }
    } catch (error) {
      console.error(`Error loading FPS for ${mediaItemName}:`, error);
    }

    // Default to 25 FPS
    const defaultFps = 25;
    setFpsCache(prev => ({ ...prev, [mediaItemName]: defaultFps }));
    return Math.round((frameNumber / defaultFps) * 1000);
  };

  // Component to display time in milliseconds
  const FrameTimestamp = ({ frameId }) => {
    const [timeMs, setTimeMs] = useState(null);

    useEffect(() => {
      calculateTimeMs(frameId).then(setTimeMs);
    }, [frameId]);

    if (timeMs === null) return null;

    return (
      <div style={{
        fontSize: '10px',
        color: '#ffa500',
        fontWeight: 'bold',
        marginTop: '2px'
      }}>
        ⏱️ {timeMs}ms
      </div>
    );
  };

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
        formData.append('use_rerank', useRerank.toString());

        for (const [key, value] of formData.entries()) {
          console.log(`${key}:`, value);
        }

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
      return data.results || [];
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



  // Simple manual time to frame conversion with milliseconds support
  const handleTimeToFrameConversion = () => {
    if (!timeInput.trim()) {
      setCalculatedFrameOrder(null);
      return;
    }

    if (!videoPlayer) {
      alert('No video is loaded');
      return;
    }

    try {
      // Parse time input (supports MM:SS.mmm, MM:SS, or just seconds)
      let totalSeconds = 0;
      let displayTime = timeInput;
      
      if (timeInput.includes(':')) {
        // Handle MM:SS.mmm or MM:SS format
        const timeParts = timeInput.split(':');
        if (timeParts.length === 2) {
          const minutes = parseInt(timeParts[0]) || 0;
          
          // Handle seconds with possible milliseconds
          const secondsPart = timeParts[1];
          let seconds = 0;
          
          if (secondsPart.includes('.')) {
            // Has milliseconds: SS.mmm
            seconds = parseFloat(secondsPart) || 0;
          } else {
            // Just seconds: SS
            seconds = parseInt(secondsPart) || 0;
          }
          
          totalSeconds = minutes * 60 + seconds;
        }
      } else {
        // Just seconds (with possible decimals)
        totalSeconds = parseFloat(timeInput) || 0;
      }
      
      // Calculate frame order using video FPS with precise milliseconds
      const fps = videoPlayer.fps || 25;
      const frameOrder = Math.floor(totalSeconds * fps);
      
      // For display, format the time properly
      if (!timeInput.includes(':') && totalSeconds >= 60) {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = (totalSeconds % 60).toFixed(3);
        displayTime = `${minutes}:${seconds.padStart(6, '0')}`;
      }
      
      setCalculatedFrameOrder({
        inputTime: timeInput,
        displayTime,
        totalSeconds: totalSeconds.toFixed(3),
        fps,
        frameOrder,
        preciseCalculation: `${totalSeconds.toFixed(3)}s × ${fps} FPS = ${(totalSeconds * fps).toFixed(3)} → ${frameOrder}`
      });
      
    } catch (error) {
      console.error('Error converting time to frame:', error);
      alert('Invalid time format. Use MM:SS.mmm, MM:SS, or seconds with decimals.');
    }
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

      // Get batch configuration to determine correct media info path
      const batchConfig = getBatchConfig(videoId);
      const mediaInfoPath = `/${batchConfig.mediaInfoDir}/${videoFile}.json`;
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
        // Use embedded player
        setVideoPlayer({
          videoId: youtubeVideoId,
          timestamp: finalTimestamp,
          title: videoInfo.title || `Video ${videoFile}`,
          keyframe: videoId,
          fps: videoFPS,
          videoDuration: videoDuration
        });
        
        // Reset calculator when opening new video  
        setTimeInput("");
        setCalculatedFrameOrder(null);
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

  // DRES API Functions
  const dresLogin = async (username, password) => {
    try {
      const response = await fetch(`${dresConfig.baseUrl}/api/v2/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password })
      });

      if (!response.ok) {
        throw new Error(`Login failed: ${response.status}`);
      }

      const data = await response.json();

      setDresConfig(prev => ({
        ...prev,
        username: data.username,
        sessionId: data.sessionId,
        isAuthenticated: true,
        password: "" // Clear password after successful login
      }));

      // Auto-fetch evaluations after login
      await dresGetEvaluations(data.sessionId);

      return { success: true, data };
    } catch (error) {
      console.error('DRES login error:', error);
      return { success: false, error: error.message };
    }
  };

  const dresLogout = () => {
    setDresConfig({
      baseUrl: dresConfig.baseUrl,
      username: "",
      password: "",
      sessionId: "",
      isAuthenticated: false
    });
    setDresEvaluation({
      evaluations: [],
      selectedEvaluationId: "",
      evaluationName: "",
      status: ""
    });
  };

  const dresGetEvaluations = async (sessionId) => {
    try {
      const response = await fetch(`${dresConfig.baseUrl}/api/v2/client/evaluation/list?session=${sessionId}`, {
        method: 'GET'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch evaluations: ${response.status}`);
      }

      const evaluations = await response.json();

      setDresEvaluation(prev => ({
        ...prev,
        evaluations: evaluations
      }));

      // Auto-select first ACTIVE evaluation
      const activeEval = evaluations.find(e => e.status === 'ACTIVE');
      if (activeEval) {
        setDresEvaluation(prev => ({
          ...prev,
          selectedEvaluationId: activeEval.id,
          evaluationName: activeEval.name,
          status: activeEval.status
        }));
      }

      return { success: true, evaluations };
    } catch (error) {
      console.error('DRES get evaluations error:', error);
      return { success: false, error: error.message };
    }
  };

  const dresSubmitResults = async (answerSets) => {
    if (!dresConfig.sessionId || !dresEvaluation.selectedEvaluationId) {
      return { success: false, error: 'Not authenticated or no evaluation selected' };
    }

    setDresSubmission(prev => ({ ...prev, isSubmitting: true }));

    try {
      const response = await fetch(
        `${dresConfig.baseUrl}/api/v2/submit/${dresEvaluation.selectedEvaluationId}?session=${dresConfig.sessionId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(answerSets)
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Submission failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      // Determine submission mode
      let submissionMode = appMode.toUpperCase();
      let submissionSource = "Search Results";
      if (searchModeType === "temporal") {
        submissionMode = "TRAKE";
        submissionSource = "Temporal Search";
      } else if (dresReview.items && dresReview.items.length > 0) {
        submissionSource = "Browse Frames";
      }

      // Create detailed submission record
      const submissionRecord = {
        id: Date.now(), // Unique ID for each submission
        timestamp: new Date().toISOString(),
        timestampReadable: new Date().toLocaleString(),
        evaluation: dresEvaluation.evaluationName,
        evaluationId: dresEvaluation.selectedEvaluationId,
        mode: submissionMode,
        source: submissionSource,
        itemCount: answerSets.answerSets[0].answers.length,
        status: 'success',
        username: dresConfig.username,
        data: answerSets, // Store full submission data
        result: result
      };

      // Add to global submission history
      setSubmissionHistory(prev => [submissionRecord, ...prev]);

      // Update legacy submission state
      setDresSubmission(prev => ({
        ...prev,
        isSubmitting: false,
        lastSubmission: submissionRecord,
        submissionHistory: [submissionRecord, ...prev.submissionHistory].slice(0, 10)
      }));

      return { success: true, result };
    } catch (error) {
      console.error('DRES submission error:', error);

      // Log failed submission
      const failedRecord = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        timestampReadable: new Date().toLocaleString(),
        evaluation: dresEvaluation.evaluationName,
        evaluationId: dresEvaluation.selectedEvaluationId,
        mode: searchModeType === "temporal" ? "TRAKE" : appMode.toUpperCase(),
        source: dresReview.items?.length > 0 ? "Browse Frames" : "Search Results",
        itemCount: answerSets.answerSets[0].answers.length,
        status: 'failed',
        username: dresConfig.username,
        error: error.message,
        data: answerSets
      };

      setSubmissionHistory(prev => [failedRecord, ...prev]);

      setDresSubmission(prev => ({
        ...prev,
        isSubmitting: false
      }));

      return { success: false, error: error.message };
    }
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


  const getTemporalSearchParams = () => {
    // Adapt search parameters based on app mode
    switch (appMode) {
      case "qa":
        return {
          topK: Math.min(topK * 0.8, 50), // Fewer results for detailed Q&A analysis
          searchMode: "hybrid", // Balanced approach for questions
          alpha: 0.7 // More text-focused for questions
        };
      default: // textual-kis
        return {
          topK: topK,
          searchMode: searchMode,
          alpha: alpha
        };
    }
  };

  const handleTemporalSearch = async () => {
    const validEvents = temporalSearch.events.filter(event => event.trim() !== "");
    if (validEvents.length === 0) {
      alert("Please enter at least one temporal event to search.");
      return;
    }

    // No mode-specific validation - allow any number of events for all modes

    setIsSearching(true);
    // Reset video filter for new temporal search
    setVideoFilter("all");
    
    try {
      // Get mode-specific parameters
      const params = getTemporalSearchParams();
      
      const formData = new FormData();
      formData.append('events', JSON.stringify(validEvents));
      formData.append('topK', params.topK.toString());
      formData.append('mode', params.searchMode);
      formData.append('caption_mode', captionMode);
      formData.append('alpha', params.alpha.toString());
      formData.append('use_rerank', useRerank.toString());
      formData.append('search_mode', temporalSearch.searchMode);

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
      const searchDuration = data.search_info.duration;
      
      // Check if the response has the expected structure
      if (!data || (!data.results && !data.error)) {
        throw new Error("Invalid response structure from backend");
      }
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      let mappedResults;
      
      if (temporalSearch.searchMode === "consolidated") {
        // Consolidated mode: Handle video timeline results from backend
        mappedResults = (data.results || []).map(videoResult => {
          // Get the best frame sequence (first one from beam search)
          const bestSequence = videoResult.frame_sequence[0] || [];
          const firstFrame = bestSequence[0];
          
          if (!firstFrame) return null;
          
          const firstFrameId = firstFrame.id;
          const parts = firstFrameId.split('_');
          const batch = parts[0];
          const videoNumber = parts[1];
          const baseVideoId = `${batch}_${videoNumber}`;
          const batchConfig = getBatchConfig(firstFrameId);
          const imagePath = `/${batchConfig.keyframesDir}/${batch}/${baseVideoId}/${firstFrameId}.jpg`;

          // Create timeline data structure with individual frame scores
          const timelineData = {
            video_id: videoResult.video,
            score: videoResult.score,
            image: bestSequence.map(frame => frame.id), // Array of frame IDs
            frameScores: bestSequence.map(frame => frame.score), // Individual frame scores
            frames: bestSequence // Full frame objects with id and score
          };

          return {
            videoId: firstFrameId, // Primary frame ID for display
            image: imagePath,
            caption: `${videoResult.video} | Timeline Score: ${videoResult.score.toFixed(3)}`,
            videoTimeline: timelineData, // Store timeline data with individual scores
            isConsolidated: true
          };
        }).filter(result => result !== null);
      } else {
        // Progressive mode: Display identical to consolidated mode with complete timeline
        // Backend returns array of video results with frame sequences

        const processedResults = (data.results || []).slice(0, params.topK);

        mappedResults = processedResults.map(videoResult => {
          // Get the best frame sequence (first one from beam search)
          const bestSequence = videoResult.frame_sequence[0] || [];
          const firstFrame = bestSequence[0]; // Use first frame for primary display
          
          if (!firstFrame) return null;
          
          // Create timeline data structure with individual frame scores (same as consolidated)
          const timelineData = {
            video_id: videoResult.video,
            score: videoResult.score,
            image: bestSequence.map(frame => frame.id), // Array of frame IDs
            frameScores: bestSequence.map(frame => frame.score), // Individual frame scores
            frames: bestSequence
          };

          const firstFrameId = firstFrame.id;
          const parts = firstFrameId.split('_');
          const batch = parts[0];
          const videoNumber = parts[1];
          const baseVideoId = `${batch}_${videoNumber}`;
          const batchConfig = getBatchConfig(firstFrameId);
          const imagePath = `/${batchConfig.keyframesDir}/${batch}/${baseVideoId}/${firstFrameId}.jpg`;

          return {
            videoId: firstFrameId, // Primary frame ID for display
            image: imagePath,
            caption: `${videoResult.video} | Timeline Score: ${videoResult.score.toFixed(3)}`,
            videoTimeline: timelineData, // Store complete timeline data with individual scores
            isConsolidated: true // Progressive mode with same timeline display as consolidated
          };
        }).filter(result => result !== null);
      }

      // Store all intermediate results for potential future use
      const allResults = data.results || [];

      setTemporalSearch(prev => ({
        ...prev,
        results: mappedResults,
        allResults: allResults, // Store all intermediate results
        currentPage: 0,
        isActive: true,
        searchInfo: data.search_info || {},
        events: validEvents // Store the actual events used
      }));
      setResults(mappedResults);
      setPageIndex(0);
      setSearchTime(searchDuration);

      // Mode-specific post-processing
      if (appMode === "qa") {
        // Pre-select all results for Q&A mode for easier answer input
        const newSelection = new Set(mappedResults.map(item => item.videoId));
        setSelectedItems(newSelection);
      }
      
    } catch (error) {
      console.error('Temporal search error:', error);
      alert(`Temporal search failed: ${error.message}\nPlease check your backend URL.`);
    } finally {
      setIsSearching(false);
    }
  };

  const exitTemporalSearch = () => {
    setTemporalSearch(prev => ({
      ...prev,
      isActive: false,
      results: [],
      searchMode: "progressive"
    }));
    setResults([]);
    setPageIndex(0);
  };

  // Helper function to extract frame timestamp from full frame ID
  const extractFrameTimestamp = (frameId) => {
    const parts = frameId.split('_');
    return parts.length >= 3 ? parts[2] : frameId;
  };

  // Helper function to create CSV blob and download
  const downloadCSVFile = (csvData, filename) => {
    const csvContent = csvData.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${csvFileName || filename}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  // Generate CSV data for Timeline View (both consolidated and progressive) results
  const generateTimelineCSV = (results) => {
    const csvData = [];
    results.forEach(result => {
      if (result.videoTimeline && selectedItems.has(result.videoId)) {
        const videoId = result.videoTimeline.video_id;
        const frameSequence = result.videoTimeline.image.map(extractFrameTimestamp);
        csvData.push(`${videoId}, ${frameSequence.join(', ')}`);
      }
    });
    return csvData;
  };

  // Generate CSV data for Sequential Search results
  const generateSequentialCSV = (results) => {
    const csvData = [];
    results.forEach(result => {
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
    return csvData;
  };

  const downloadJSON = async () => {
    let jsonData = { answerSets: [{ answers: [] }] };

    // Handle temporal search results with TRAKE format
    if (searchModeType === "temporal" && temporalSearch.isActive && temporalSearch.results.length > 0) {
      temporalSearch.results.forEach(result => {
        if (result.videoTimeline && selectedItems.has(result.videoId)) {
          const videoId = result.videoTimeline.video_id;
          const frameSequence = result.videoTimeline.image.map(extractFrameTimestamp);
          const text = `TR-${videoId}-${frameSequence.join(',')}`;
          jsonData.answerSets[0].answers.push({ text });
        }
      });

      const defaultName = "temporal_search_results";
      const jsonContent = JSON.stringify(jsonData, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${csvFileName || defaultName}.json`;
      link.click();
      window.URL.revokeObjectURL(url);
      return;
    }

    if (appMode === "textual-kis") {
      // KIS mode: Convert frame ID to time(ms) using FPS
      if (selectedItems.size === 0) {
        alert("Please select at least one item to download.");
        return;
      }

      // Load FPS for each video and calculate time in milliseconds
      const videoFpsCache = {};
      for (const videoId of selectedItems) {
        const parts = videoId.split('_');
        if (parts.length >= 3) {
          const batch = parts[0];
          const videoNum = parts[1];
          const frameId = parseInt(parts[2]);
          const mediaItemName = `${batch}_${videoNum}`;

          // Get FPS from cache or fetch it
          if (!videoFpsCache[mediaItemName]) {
            try {
              const batchConfig = getBatchConfig(videoId);
              const mediaInfoPath = `/${batchConfig.mediaInfoDir}/${mediaItemName}.json`;
              const response = await fetch(mediaInfoPath);
              if (response.ok) {
                const videoInfo = await response.json();
                videoFpsCache[mediaItemName] = videoInfo.fps || 25;
              } else {
                videoFpsCache[mediaItemName] = 25; // Default FPS
              }
            } catch (error) {
              console.error(`Error loading FPS for ${mediaItemName}:`, error);
              videoFpsCache[mediaItemName] = 25; // Default FPS
            }
          }

          const fps = videoFpsCache[mediaItemName];
          const timeMs = Math.round((frameId / fps) * 1000);

          jsonData.answerSets[0].answers.push({
            mediaItemName: mediaItemName,
            start: timeMs,
            end: timeMs
          });
        }
      }

      const defaultName = "kis_results";
      const jsonContent = JSON.stringify(jsonData, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${csvFileName || defaultName}.json`;
      link.click();
      window.URL.revokeObjectURL(url);

    } else if (appMode === "qa") {
      // QA mode: Convert frame ID to time(ms) using FPS
      if (selectedItems.size === 0) {
        alert("Please select at least one item to download.");
        return;
      }

      // Load FPS for each video and calculate time in milliseconds
      const videoFpsCache = {};
      for (const videoId of selectedItems) {
        const parts = videoId.split('_');
        if (parts.length >= 3) {
          const batch = parts[0];
          const videoNum = parts[1];
          const frameId = parseInt(parts[2]);
          const answer = frameAnswers[videoId] || "";
          const mediaItemName = `${batch}_${videoNum}`;

          // Get FPS from cache or fetch it
          if (!videoFpsCache[mediaItemName]) {
            try {
              const batchConfig = getBatchConfig(videoId);
              const mediaInfoPath = `/${batchConfig.mediaInfoDir}/${mediaItemName}.json`;
              const response = await fetch(mediaInfoPath);
              if (response.ok) {
                const videoInfo = await response.json();
                videoFpsCache[mediaItemName] = videoInfo.fps || 25;
              } else {
                videoFpsCache[mediaItemName] = 25; // Default FPS
              }
            } catch (error) {
              console.error(`Error loading FPS for ${mediaItemName}:`, error);
              videoFpsCache[mediaItemName] = 25; // Default FPS
            }
          }

          const fps = videoFpsCache[mediaItemName];
          const timeMs = Math.round((frameId / fps) * 1000);

          const text = `QA-${answer}-${mediaItemName}-${timeMs}`;
          jsonData.answerSets[0].answers.push({ text });
        }
      }

      const defaultName = "qa_results";
      const jsonContent = JSON.stringify(jsonData, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${csvFileName || defaultName}.json`;
      link.click();
      window.URL.revokeObjectURL(url);
    }
  };

  // Generate JSON for DRES submission (reuses downloadJSON logic)
  const generateDRESSubmissionJSON = async () => {
    let jsonData = { answerSets: [{ answers: [] }] };

    // Handle temporal search results with TRAKE format
    if (searchModeType === "temporal" && temporalSearch.isActive && temporalSearch.results.length > 0) {
      temporalSearch.results.forEach(result => {
        if (result.videoTimeline && selectedItems.has(result.videoId)) {
          const videoId = result.videoTimeline.video_id;
          const frameSequence = result.videoTimeline.image.map(extractFrameTimestamp);
          const text = `TR-${videoId}-${frameSequence.join(',')}`;
          jsonData.answerSets[0].answers.push({ text });
        }
      });
      return jsonData;
    }

    if (appMode === "textual-kis") {
      // KIS mode: Convert frame ID to time(ms) using FPS
      if (selectedItems.size === 0) {
        return null;
      }

      const videoFpsCache = {};
      for (const videoId of selectedItems) {
        const parts = videoId.split('_');
        if (parts.length >= 3) {
          const batch = parts[0];
          const videoNum = parts[1];
          const frameId = parseInt(parts[2]);
          const mediaItemName = `${batch}_${videoNum}`;

          if (!videoFpsCache[mediaItemName]) {
            try {
              const batchConfig = getBatchConfig(videoId);
              const mediaInfoPath = `/${batchConfig.mediaInfoDir}/${mediaItemName}.json`;
              const response = await fetch(mediaInfoPath);
              if (response.ok) {
                const videoInfo = await response.json();
                videoFpsCache[mediaItemName] = videoInfo.fps || 25;
              } else {
                videoFpsCache[mediaItemName] = 25;
              }
            } catch (error) {
              console.error(`Error loading FPS for ${mediaItemName}:`, error);
              videoFpsCache[mediaItemName] = 25;
            }
          }

          const fps = videoFpsCache[mediaItemName];
          const timeMs = Math.round((frameId / fps) * 1000);

          jsonData.answerSets[0].answers.push({
            mediaItemName: mediaItemName,
            start: timeMs,
            end: timeMs
          });
        }
      }
      return jsonData;

    } else if (appMode === "qa") {
      // QA mode: Convert frame ID to time(ms) using FPS
      if (selectedItems.size === 0) {
        return null;
      }

      const videoFpsCache = {};
      for (const videoId of selectedItems) {
        const parts = videoId.split('_');
        if (parts.length >= 3) {
          const batch = parts[0];
          const videoNum = parts[1];
          const frameId = parseInt(parts[2]);
          const answer = frameAnswers[videoId] || "";
          const mediaItemName = `${batch}_${videoNum}`;

          if (!videoFpsCache[mediaItemName]) {
            try {
              const batchConfig = getBatchConfig(videoId);
              const mediaInfoPath = `/${batchConfig.mediaInfoDir}/${mediaItemName}.json`;
              const response = await fetch(mediaInfoPath);
              if (response.ok) {
                const videoInfo = await response.json();
                videoFpsCache[mediaItemName] = videoInfo.fps || 25;
              } else {
                videoFpsCache[mediaItemName] = 25;
              }
            } catch (error) {
              console.error(`Error loading FPS for ${mediaItemName}:`, error);
              videoFpsCache[mediaItemName] = 25;
            }
          }

          const fps = videoFpsCache[mediaItemName];
          const timeMs = Math.round((frameId / fps) * 1000);

          const text = `QA-${answer}-${mediaItemName}-${timeMs}`;
          jsonData.answerSets[0].answers.push({ text });
        }
      }
      return jsonData;
    }

    return null;
  };

  // Generate preview items for review modal
  const generateSubmissionPreview = async () => {
    const items = [];
    const mode = (searchModeType === "temporal" && temporalSearch.isActive) ? "trake" : appMode;

    // Handle temporal search (TRAKE format)
    if (searchModeType === "temporal" && temporalSearch.isActive) {
      temporalSearch.results.forEach(result => {
        if (result.videoTimeline && selectedItems.has(result.videoId)) {
          const videoId = result.videoTimeline.video_id;
          const frameSequence = result.videoTimeline.image.map(extractFrameTimestamp);
          items.push({
            videoId: result.videoId,
            videoName: videoId,
            frameIds: frameSequence,
            displayText: `TR-${videoId}-${frameSequence.join(',')}`,
            canEditAnswer: false
          });
        }
      });
      return { items, mode };
    }

    // Handle KIS and QA modes
    const videoFpsCache = {};
    for (const videoId of selectedItems) {
      const parts = videoId.split('_');
      if (parts.length >= 3) {
        const batch = parts[0];
        const videoNum = parts[1];
        const frameId = parseInt(parts[2]);
        const mediaItemName = `${batch}_${videoNum}`;

        // Get FPS
        if (!videoFpsCache[mediaItemName]) {
          try {
            const batchConfig = getBatchConfig(videoId);
            const mediaInfoPath = `/${batchConfig.mediaInfoDir}/${mediaItemName}.json`;
            const response = await fetch(mediaInfoPath);
            if (response.ok) {
              const videoInfo = await response.json();
              videoFpsCache[mediaItemName] = videoInfo.fps || 25;
            } else {
              videoFpsCache[mediaItemName] = 25;
            }
          } catch (error) {
            videoFpsCache[mediaItemName] = 25;
          }
        }

        const fps = videoFpsCache[mediaItemName];
        const timeMs = Math.round((frameId / fps) * 1000);

        if (mode === "qa") {
          const answer = frameAnswers[videoId] || "";
          items.push({
            videoId,
            videoName: mediaItemName,
            frameId,
            timeMs,
            answer,
            displayText: `QA-${answer}-${mediaItemName}-${timeMs}`,
            canEditAnswer: true
          });
        } else if (mode === "textual-kis") {
          items.push({
            videoId,
            videoName: mediaItemName,
            frameId,
            timeMs,
            displayText: `${mediaItemName}: ${timeMs}ms`,
            canEditAnswer: false
          });
        }
      }
    }

    return { items, mode };
  };

  // Open review modal
  const handleDRESSubmit = async () => {
    // Validate
    if (!dresConfig.isAuthenticated) {
      alert("Please login to DRES first!");
      return;
    }

    if (!dresEvaluation.selectedEvaluationId) {
      alert("Please select an evaluation!");
      return;
    }

    if (selectedItems.size === 0 && !(searchModeType === "temporal" && temporalSearch.isActive)) {
      alert("Please select at least one item to submit!");
      return;
    }

    // Generate preview items
    const { items, mode } = await generateSubmissionPreview();

    if (items.length === 0) {
      alert("No data to submit!");
      return;
    }

    // Open review modal
    setDresReview({
      isOpen: true,
      items,
      mode,
      editedAnswers: {}
    });
  };

  // Confirm and submit from review modal
  const confirmDRESSubmission = async () => {
    // Check if we have review items (browse frame submission)
    if (dresReview.items && dresReview.items.length > 0) {
      // Generate submission directly from review items
      const submissionData = { answerSets: [{ answers: [] }] };

      for (let answerIndex = 0; answerIndex < dresReview.items.length; answerIndex++) {
        const item = dresReview.items[answerIndex];

        // Get edited values or use originals
        const editedVideoName = dresReview.editedAnswers[`${item.videoId}_videoName`] || item.videoName;
        const editedTimeMs = dresReview.editedAnswers[`${item.videoId}_timeMs`] || item.timeMs;
        const editedAnswer = dresReview.editedAnswers[item.videoId];

        if (dresReview.mode === "qa") {
          // QA mode: QA-answer-video-time(ms)
          const finalAnswer = editedAnswer !== undefined ? editedAnswer : item.answer;
          submissionData.answerSets[0].answers.push({
            text: `QA-${finalAnswer}-${editedVideoName}-${editedTimeMs}`
          });
        } else if (dresReview.mode === "textual-kis") {
          // KIS mode: mediaItemName with start/end time(ms)
          submissionData.answerSets[0].answers.push({
            mediaItemName: editedVideoName,
            start: parseInt(editedTimeMs),
            end: parseInt(editedTimeMs)
          });
        } else if (dresReview.mode === "trake") {
          // TRAKE mode: TR-video-frameIDs
          const editedFrames = dresReview.editedAnswers[`${item.videoId}_frames`] || item.frameIds;
          const frameSequence = editedFrames.join(',');
          submissionData.answerSets[0].answers.push({
            text: `TR-${editedVideoName}-${frameSequence}`
          });
        }
      }

      if (submissionData.answerSets[0].answers.length === 0) {
        alert("No data to submit!");
        return;
      }

      // Close modal
      setDresReview({ isOpen: false, items: [], mode: "", editedAnswers: {} });

      // Submit to DRES
      const result = await dresSubmitResults(submissionData);

      if (result.success) {
        alert(`✅ Successfully submitted ${submissionData.answerSets[0].answers.length} results to DRES!\nEvaluation: ${dresEvaluation.evaluationName}`);
        // Clear selected browse frames after successful submission
        setSelectedBrowseFrames(new Set());
      } else {
        alert(`❌ Submission failed: ${result.error}`);
      }
      return;
    }

    // Original flow: Generate submission JSON from selectedItems
    const submissionData = await generateDRESSubmissionJSON();

    if (!submissionData || submissionData.answerSets[0].answers.length === 0) {
      alert("No data to submit!");
      return;
    }

    // Apply edits for all modes (this is for legacy flow)
    if (Object.keys(dresReview.editedAnswers).length > 0) {
      submissionData.answerSets[0].answers = submissionData.answerSets[0].answers.map((answer, answerIndex) => {
        const item = dresReview.items[answerIndex];
        if (!item) return answer;

        // Get edited values or use originals
        const editedVideoName = dresReview.editedAnswers[`${item.videoId}_videoName`] || item.videoName;
        const editedTimeMs = dresReview.editedAnswers[`${item.videoId}_timeMs`] || item.timeMs;
        const editedAnswer = dresReview.editedAnswers[item.videoId];

        if (dresReview.mode === "qa") {
          // QA mode: QA-answer-video-time(ms)
          const finalAnswer = editedAnswer !== undefined ? editedAnswer : item.answer;
          return {
            text: `QA-${finalAnswer}-${editedVideoName}-${editedTimeMs}`
          };
        } else if (dresReview.mode === "textual-kis") {
          // KIS mode: Update mediaItemName with start/end time(ms)
          return {
            mediaItemName: editedVideoName,
            start: parseInt(editedTimeMs),
            end: parseInt(editedTimeMs)
          };
        } else if (dresReview.mode === "trake") {
          // TRAKE mode: TR-video-frameIDs (video name and frames can be edited)
          const editedFrames = dresReview.editedAnswers[`${item.videoId}_frames`] || item.frameIds;
          const frameSequence = editedFrames.join(',');
          return {
            text: `TR-${editedVideoName}-${frameSequence}`
          };
        }

        return answer;
      });
    }

    // Close modal
    setDresReview({ isOpen: false, items: [], mode: "", editedAnswers: {} });

    // Submit to DRES
    const result = await dresSubmitResults(submissionData);

    if (result.success) {
      alert(`✅ Successfully submitted ${submissionData.answerSets[0].answers.length} results to DRES!\nEvaluation: ${dresEvaluation.evaluationName}`);
    } else {
      alert(`❌ Submission failed: ${result.error}`);
    }
  };

  // Open manual DRES submission modal
  const openManualSubmit = () => {
    setDresManualSubmit({
      isOpen: true,
      mode: "textual-kis",
      rawInput: ""
    });
  };

  // Handle manual DRES submission
  const handleManualDRESSubmit = async () => {
    if (!dresManualSubmit.rawInput.trim()) {
      alert("Please enter submission data!");
      return;
    }

    const lines = dresManualSubmit.rawInput.trim().split('\n').filter(line => line.trim());
    const answers = [];

    try {
      if (dresManualSubmit.mode === "textual-kis") {
        // Format: videoName, startMs, endMs
        lines.forEach(line => {
          const parts = line.split(',').map(p => p.trim());
          if (parts.length >= 3) {
            answers.push({
              mediaItemName: parts[0],
              start: parseInt(parts[1]),
              end: parseInt(parts[2])
            });
          }
        });
      } else if (dresManualSubmit.mode === "qa") {
        // Format: QA-answer-video-timeMs
        lines.forEach(line => {
          const trimmed = line.trim();
          if (trimmed.startsWith("QA-")) {
            answers.push({ text: trimmed });
          } else {
            // Allow input as: answer, video, timeMs
            const parts = line.split(',').map(p => p.trim());
            if (parts.length >= 3) {
              answers.push({ text: `QA-${parts[0]}-${parts[1]}-${parts[2]}` });
            }
          }
        });
      } else if (dresManualSubmit.mode === "trake") {
        // Format: TR-video-frameId1,frameId2,frameId3
        lines.forEach(line => {
          const trimmed = line.trim();
          if (trimmed.startsWith("TR-")) {
            answers.push({ text: trimmed });
          } else {
            // Allow input as: video, frameId1, frameId2, ...
            const parts = line.split(',').map(p => p.trim());
            if (parts.length >= 2) {
              const videoName = parts[0];
              const frameIds = parts.slice(1).join(',');
              answers.push({ text: `TR-${videoName}-${frameIds}` });
            }
          }
        });
      }

      if (answers.length === 0) {
        alert("No valid submission data found!");
        return;
      }

      const submissionData = {
        answerSets: [{ answers }]
      };

      setDresSubmission(prev => ({ ...prev, isSubmitting: true }));

      const result = await dresSubmitResults(submissionData);

      setDresSubmission(prev => ({ ...prev, isSubmitting: false }));

      if (result.success) {
        alert(`✅ Successfully submitted ${answers.length} results to DRES!\nEvaluation: ${dresEvaluation.evaluationName}`);
        setDresManualSubmit({ isOpen: false, mode: "textual-kis", rawInput: "" });
      } else {
        alert(`❌ Submission failed: ${result.error}`);
      }
    } catch (error) {
      setDresSubmission(prev => ({ ...prev, isSubmitting: false }));
      alert(`❌ Error processing submission: ${error.message}`);
    }
  };

  const downloadCSV = () => {
    // Handle temporal search results
    if (searchModeType === "temporal" && temporalSearch.isActive && temporalSearch.results.length > 0) {
      const hasTimelineResults = temporalSearch.results.some(result =>
        result.videoTimeline
      );

      if (hasTimelineResults) {
        const csvData = generateTimelineCSV(temporalSearch.results);
        downloadCSVFile(csvData, 'timeline_sequences');
      } else {
        const csvData = generateSequentialCSV(temporalSearch.results);
        downloadCSVFile(csvData, 'temporal_search_results');
      }
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

  // Video Filter Functions
  const getUniqueVideos = (results) => {
    const videos = new Set();
    results.forEach(item => {
      if (item.videoId) {
        const parts = item.videoId.split('_');
        if (parts.length >= 2) {
          const videoId = `${parts[0]}_${parts[1]}`; // e.g., "L01_V001"
          videos.add(videoId);
        }
      }
    });
    return Array.from(videos).sort();
  };

  const filterResultsByVideo = (results, filter) => {
    if (filter === "all") return results;
    
    return results.filter(item => {
      if (!item.videoId) return false;
      const parts = item.videoId.split('_');
      if (parts.length >= 2) {
        const videoId = `${parts[0]}_${parts[1]}`;
        return videoId === filter;
      }
      return false;
    });
  };

  const handleVideoFilterChange = (newFilter) => {
    setVideoFilter(newFilter);
    setPageIndex(0); // Reset to first page when filter changes
    if (searchModeType === "temporal" && temporalSearch.isActive) {
      setTemporalSearch(prev => ({
        ...prev,
        currentPage: 0
      }));
    }
  };

  // Function to load video keyframes using keyframes_index.json
  const loadVideoKeyframes = async (videoId) => {
    if (!videoId) {
      setVideoKeyframes([]);
      return;
    }

    setLoadingVideoKeyframes(true);
    try {
      // Load the keyframes index file based on video batch
      const batchConfig = getBatchConfig(videoId);
      const response = await fetch(`/${batchConfig.mediaInfoDir}/keyframes_index.json`);
      
      if (!response.ok) {
        throw new Error('Keyframes index not found');
      }
      
      const keyframesIndex = await response.json();
      
      // Get keyframes for the selected video
      const imagePaths = keyframesIndex[videoId];
      
      if (imagePaths && imagePaths.length > 0) {
        // Map image paths to frame objects
        const mappedKeyframes = imagePaths.map(imagePath => {
          // Extract frame number from path (e.g., /keyframes/L21/L21_V001/L21_V001_1200.jpg -> 1200)
          const filename = imagePath.split('/').pop();
          const frameMatch = filename.match(/_(\d+)\.jpg$/);
          const frameNum = frameMatch ? parseInt(frameMatch[1]) : 0;
          
          return {
            videoId: filename.replace('.jpg', ''), // L21_V001_1200
            image: imagePath,
            caption: `Frame at ${frameNum}ms from ${videoId}`,
            score: 1.0,
            timestamp: frameNum
          };
        });

        // Sort by timestamp for chronological order
        mappedKeyframes.sort((a, b) => a.timestamp - b.timestamp);
        
        setVideoKeyframes(mappedKeyframes);
      } else {
        // No keyframes found for this video
        setVideoKeyframes([]);
        console.log(`No keyframes found for video: ${videoId}`);
      }
    } catch (error) {
      console.error('Error loading video keyframes:', error);
      setVideoKeyframes([]);
    } finally {
      setLoadingVideoKeyframes(false);
    }
  };

  const handleVideoSelectionForViewing = async (input) => {
    setSelectedVideoForViewing(input);

    if (!input) {
      setVideoKeyframes([]);
      setVideoBrowseMode(false);
      setBrowsedVideoId("");
      return;
    }

    // Check if input is a batch prefix (L23, L24, L26)
    if (input === 'L23' || input === 'L24' || input === 'L26') {
      setLoadingVideoKeyframes(true);
      try {
        // Fetch all available video IDs from keyframes index
        const batchConfig = getBatchConfig(input + '_V001'); // Use any video from batch to get config
        const response = await fetch(`/${batchConfig.mediaInfoDir}/keyframes_index.json`);

        if (!response.ok) {
          throw new Error('Keyframes index not found');
        }

        const keyframesIndex = await response.json();

        // Extract all video IDs that start with the batch prefix
        const batchVideos = Object.keys(keyframesIndex).filter(videoId =>
          videoId.startsWith(`${input}_`)
        ).sort();

        console.log(`Found ${batchVideos.length} videos in ${input} batch:`, batchVideos);

        // Load keyframes from ALL videos in the batch
        const allKeyframes = [];
        for (const videoId of batchVideos) {
          const imagePaths = keyframesIndex[videoId];
          if (imagePaths && imagePaths.length > 0) {
            const mappedFrames = imagePaths.map(imagePath => {
              const filename = imagePath.split('/').pop();
              const frameMatch = filename.match(/_(\d+)\.jpg$/);
              const frameNum = frameMatch ? parseInt(frameMatch[1]) : 0;

              return {
                videoId: filename.replace('.jpg', ''),
                image: imagePath,
                caption: `Frame ${frameNum} from ${videoId}`,
                score: 1.0,
                timestamp: frameNum
              };
            });

            allKeyframes.push(...mappedFrames);
          }
        }

        // Sort all keyframes by video ID first, then by timestamp
        allKeyframes.sort((a, b) => {
          const videoA = a.videoId.substring(0, a.videoId.lastIndexOf('_'));
          const videoB = b.videoId.substring(0, b.videoId.lastIndexOf('_'));
          if (videoA !== videoB) {
            return videoA.localeCompare(videoB);
          }
          return a.timestamp - b.timestamp;
        });

        setVideoKeyframes(allKeyframes);
        console.log(`Loaded ${allKeyframes.length} total keyframes from ${input} batch (${batchVideos.length} videos)`);

        // Activate right-side video browse
        setBrowsedVideoId(input);
        setVideoBrowseMode(true);
        setBrowseCurrentPage(0);
      } catch (error) {
        console.error(`Error loading ${input} batch keyframes:`, error);
        setVideoKeyframes([]);
      } finally {
        setLoadingVideoKeyframes(false);
      }
    } else {
      // Regular single video loading
      loadVideoKeyframes(input);
      setBrowsedVideoId(input);
      setVideoBrowseMode(true);
      setBrowseCurrentPage(0);
    }
  };

  // Video Browse Functions
  const exitVideoBrowse = () => {
    setVideoBrowseMode(false);
    setBrowsedVideoId("");
    setBrowseCurrentPage(0);
    setBrowseZoomedFrame(null);
  };

  const goToBrowsePage = (newPageIndex) => {
    const browseFramesPerPage = 8;
    const totalBrowsePages = Math.ceil(videoKeyframes.length / browseFramesPerPage);
    
    if (newPageIndex < 0) newPageIndex = 0;
    else if (newPageIndex >= totalBrowsePages) newPageIndex = totalBrowsePages - 1;
    
    setBrowseCurrentPage(newPageIndex);
  };

  async function search() {
    // Route to appropriate search based on search mode type
    if (searchModeType === "temporal") {
      return handleTemporalSearch();
    }

    // Normal search validation
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

    // Clear temporal search state when doing normal search
    setTemporalSearch({
      events: [""],
      results: [],
      currentPage: 0,
      isActive: false,
      searchMode: "progressive"
    });
    
    // Reset video filter for new search
    setVideoFilter("all");

    try {
      const startTime = performance.now();
      const data = await fetchSearchResults(query, imageFile);
      const endTime = performance.now();
      const timeTaken = ((endTime - startTime) / 1000).toFixed(2);

      const mappedResults = (data || []).map(item => {
        const videoId = item.image.trim();
        const parts = videoId.split('_');
        const batch = parts[0];
        const videoNumber = parts[1];
        const baseVideoId = `${batch}_${videoNumber}`;
        const batchConfig = getBatchConfig(videoId);
        const imagePath = `/${batchConfig.keyframesDir}/${batch}/${baseVideoId}/${videoId}.jpg`;

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
        if (browseZoomedFrame) {
          setBrowseZoomedFrame(null);
        } else if (zoomedFrame) {
          setZoomedFrame(null);
        } else if (videoPlayer) {
          setVideoPlayer(null);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [videoPlayer, zoomedFrame, browseZoomedFrame]);

  // Pagination logic - separate for temporal search and regular search
  const temporalFrameSize = 8;
  const rawDataSource = (searchModeType === "temporal" && temporalSearch.isActive) ? temporalSearch.results : results;
  
  // Apply video filtering
  const currentDataSource = filterResultsByVideo(rawDataSource, videoFilter);
  const currentPageSize = (searchModeType === "temporal" && temporalSearch.isActive) ? temporalFrameSize : pageSize;
  
  const totalPages = Math.max(Math.ceil(currentDataSource.length / currentPageSize), 1);

  const currentPageData = currentDataSource.slice(
    ((searchModeType === "temporal" && temporalSearch.isActive) ? temporalSearch.currentPage : pageIndex) * currentPageSize,
    (((searchModeType === "temporal" && temporalSearch.isActive) ? temporalSearch.currentPage : pageIndex) + 1) * currentPageSize
  );

  const goToPage = (newPageIndex) => {
    if (newPageIndex < 0) newPageIndex = 0;
    else if (newPageIndex >= totalPages) newPageIndex = totalPages - 1;
    
    if (searchModeType === "temporal" && temporalSearch.isActive) {
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

          {/* DRES Submission Section */}
          <div className="dres-section" style={{
            marginTop: '15px',
            padding: '12px',
            background: 'rgba(0, 123, 255, 0.05)',
            borderRadius: '8px',
            border: '1px solid rgba(0, 123, 255, 0.2)'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '10px',
              fontSize: '14px',
              fontWeight: 'bold',
              color: '#007bff'
            }}>
              🏆 DRES Submission
            </div>

            {!dresConfig.isAuthenticated ? (
              <div>
                <input
                  type="text"
                  placeholder="Username"
                  value={dresConfig.username}
                  onChange={(e) => setDresConfig(prev => ({ ...prev, username: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px',
                    marginBottom: '8px',
                    border: '1px solid #444',
                    borderRadius: '4px',
                    background: '#1a1a1a',
                    color: '#fff',
                    fontSize: '13px'
                  }}
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={dresConfig.password}
                  onChange={(e) => setDresConfig(prev => ({ ...prev, password: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && dresConfig.username && dresConfig.password) {
                      dresLogin(dresConfig.username, dresConfig.password);
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '8px',
                    marginBottom: '8px',
                    border: '1px solid #444',
                    borderRadius: '4px',
                    background: '#1a1a1a',
                    color: '#fff',
                    fontSize: '13px'
                  }}
                />
                <button
                  onClick={() => dresLogin(dresConfig.username, dresConfig.password)}
                  disabled={!dresConfig.username || !dresConfig.password}
                  style={{
                    width: '100%',
                    padding: '8px',
                    background: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    opacity: (!dresConfig.username || !dresConfig.password) ? 0.5 : 1
                  }}
                >
                  🔐 Login to DRES
                </button>
              </div>
            ) : (
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px'
                }}>
                  <div style={{ fontSize: '12px', color: '#4CAF50' }}>
                    🟢 Connected
                  </div>
                  <button
                    onClick={dresLogout}
                    style={{
                      padding: '4px 8px',
                      background: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px'
                    }}
                  >
                    Logout
                  </button>
                </div>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>
                  User: {dresConfig.username}
                </div>
                <div style={{
                  fontSize: '10px',
                  color: '#666',
                  wordBreak: 'break-all',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ marginBottom: '4px', fontWeight: 'bold', color: '#888' }}>Session ID:</div>
                    <div style={{
                      padding: '6px 8px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      fontSize: '9px',
                      border: '1px solid rgba(255, 255, 255, 0.1)'
                    }}>
                      {dresConfig.sessionId}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      navigator.clipboard.writeText(dresConfig.sessionId);
                      // Show temporary feedback
                      const btn = e.target;
                      const originalText = btn.textContent;
                      btn.textContent = '✓';
                      btn.style.background = '#28a745';
                      setTimeout(() => {
                        btn.textContent = originalText;
                        btn.style.background = '#007bff';
                      }, 1000);
                    }}
                    style={{
                      padding: '4px 8px',
                      background: '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '10px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      marginTop: '20px'
                    }}
                  >
                    📋 Copy
                  </button>
                </div>

                {/* Evaluation Selection */}
                {dresEvaluation.evaluations.length > 0 && (
                  <div style={{ marginTop: '10px' }}>
                    <label style={{ fontSize: '12px', color: '#ccc', display: 'block', marginBottom: '4px' }}>
                      Evaluation:
                    </label>
                    <select
                      value={dresEvaluation.selectedEvaluationId}
                      onChange={(e) => {
                        const selected = dresEvaluation.evaluations.find(ev => ev.id === e.target.value);
                        setDresEvaluation(prev => ({
                          ...prev,
                          selectedEvaluationId: e.target.value,
                          evaluationName: selected?.name || "",
                          status: selected?.status || ""
                        }));
                      }}
                      style={{
                        width: '100%',
                        padding: '6px',
                        border: '1px solid #444',
                        borderRadius: '4px',
                        background: '#1a1a1a',
                        color: '#fff',
                        fontSize: '12px'
                      }}
                    >
                      {dresEvaluation.evaluations.map(ev => (
                        <option key={ev.id} value={ev.id}>
                          {ev.name} ({ev.status})
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => dresGetEvaluations(dresConfig.sessionId)}
                      style={{
                        width: '100%',
                        marginTop: '6px',
                        padding: '4px',
                        background: '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '11px'
                      }}
                    >
                      🔄 Refresh Evaluations
                    </button>
                  </div>
                )}

                {/* Last Submission Info */}
                {dresSubmission.lastSubmission && (
                  <div style={{
                    marginTop: '10px',
                    padding: '6px',
                    background: 'rgba(76, 175, 80, 0.1)',
                    borderRadius: '4px',
                    fontSize: '10px',
                    color: '#4CAF50'
                  }}>
                    ✅ Last: {dresSubmission.lastSubmission.itemCount} items ({dresSubmission.lastSubmission.mode})
                  </div>
                )}

                {/* Submission History Button */}
                <button
                  onClick={() => setHistoryModalOpen(true)}
                  style={{
                    width: '100%',
                    marginTop: '10px',
                    padding: '8px',
                    background: '#17a2b8',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}
                >
                  📜 Submission History ({submissionHistory.length})
                </button>

                {/* Manual Submission Button */}
                {dresEvaluation.selectedEvaluationId && (
                  <button
                    onClick={openManualSubmit}
                    style={{
                      width: '100%',
                      marginTop: '10px',
                      padding: '8px',
                      background: '#ff9800',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}
                  >
                    ✍️ Manual Submit
                  </button>
                )}
              </div>
            )}
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
                setSearchModeType("normal"); // Reset to normal search when changing app mode
                setTemporalSearch({
                  events: [""],
                  results: [],
                  currentPage: 0,
                  isActive: false,
                  searchMode: "progressive"
                });
                setResults([]);
              }}
            >
              <option value="textual-kis">📋 Textual KIS</option>
              <option value="qa">❓ Q&A</option>
            </select>
          </div>

          <div className="search-mode-type-section">
            <label className="search-mode-type-label">Search Mode Type:</label>
            <select
              className="search-mode-type-select"
              value={searchModeType}
              onChange={(e) => {
                setSearchModeType(e.target.value);
                setSelectedItems(new Set());
                setFrameAnswers({});
                if (e.target.value === "normal") {
                  setTemporalSearch({
                    events: [""],
                    results: [],
                    currentPage: 0,
                    isActive: false,
                    searchMode: "progressive"
                  });
                  setResults([]);
                } else {
                  // Reset temporal search events when switching to temporal mode
                  setTemporalSearch(prev => ({
                    ...prev,
                    events: [""],
                    results: [],
                    currentPage: 0,
                    isActive: false,
                    searchMode: "progressive"
                  }));
                  setResults([]);
                }
              }}
            >
              <option value="normal">
                🔍 Normal Search 
                {appMode === "textual-kis" ? " (Standard KIS)" :
                 appMode === "qa" ? " (Single Q&A)" :
                 " (Single Video Selection)"}
              </option>
              <option value="temporal">
                ⏰ Temporal Search
                {appMode === "textual-kis" ? " (Sequential Events)" :
                 appMode === "qa" ? " (Multi-Event Q&A)" :
                 " (Event Sequences)"}
              </option>
            </select>
          </div>

          {searchModeType === "normal" && (
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
          )}

          {(searchModeType === "normal" ? searchType === "text" : true) && (
            <>
              <div className="search-mode-section">
                <label className="search-mode-label">Search Mode:</label>
                <select
                  className="search-mode-select"
                  value={searchMode}
                  onChange={(e) => setSearchMode(e.target.value)}
                >
                  <option value="clip">CLIP Only</option>
                  <option value="caption">Caption Only</option>
                  <option value="subtitles">Subtitles Only</option>
                  <option value="clip+caption">CLIP + Caption</option>
                  <option value="hybrid"> Hybrid (CLIP + Caption + Subtitles)</option>
                </select>
              </div>

              {(searchMode === "hybrid" || searchMode === "caption" || searchMode === "subtitles" || searchMode === "clip+caption") && (
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

              {(searchMode === "hybrid" || searchMode === "clip+caption") && (
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

              {(searchMode === "caption" || searchMode === "hybrid" || searchMode === "clip+caption") && (
                <div className="rerank-section">
                  <label className="rerank-label">
                    <input
                      type="checkbox"
                      checked={useRerank}
                      onChange={(e) => setUseRerank(e.target.checked)}
                    />
                    🔄 Enable Reranking
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

          {/* Temporal Search Section - Only show when temporal mode is selected */}
          {searchModeType === "temporal" && (
          <div className="temporal-search-sidebar">
            <div className="temporal-header">
              <h4>⏰ Temporal Search</h4>
              <p className="temporal-description">Search sequential events</p>
            </div>


            {/* Search Mode Selection */}
            <div className="temporal-search-mode-section">
              <label className="temporal-search-mode-label">Search Strategy:</label>
              <select
                className="temporal-search-mode-select"
                value={temporalSearch.searchMode}
                onChange={(e) => setTemporalSearch(prev => ({
                  ...prev,
                  searchMode: e.target.value
                }))}
              >
                <option value="progressive">🔍 Sequential Search (Step-by-Step)</option>
                <option value="consolidated">📽️ Timeline View (Video Events)</option>
              </select>
              <div className="temporal-mode-description">
                {temporalSearch.searchMode === "progressive" ? (
                  <span style={{fontSize: "11px", color: "#666"}}>
                    Searches events step-by-step, narrowing results after each step
                  </span>
                ) : (
                  <span style={{fontSize: "11px", color: "#666"}}>
                    Shows complete video timelines with all events in sequence
                  </span>
                )}
              </div>
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
          )}

          {/* Video Keyframes Viewer Section */}
          <div className="video-keyframes-viewer-section">
            <div className="video-keyframes-header">
              <h4>🎬 Browse Video Keyframes</h4>
              <p className="video-keyframes-description">View all keyframes from any video</p>
            </div>

            <div className="video-selection">
              <label className="video-selection-label">Select Video:</label>
              <input
                type="text"
                className="video-selection-input"
                placeholder="Enter video ID (e.g., L01_V001) or batch (L23, L24, L26)"
                value={selectedVideoForViewing}
                onChange={(e) => setSelectedVideoForViewing(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleVideoSelectionForViewing(e.target.value);
                  }
                }}
              />
              <button
                className="load-keyframes-btn"
                onClick={() => handleVideoSelectionForViewing(selectedVideoForViewing)}
                disabled={!selectedVideoForViewing || loadingVideoKeyframes}
              >
                {loadingVideoKeyframes ? "Loading..." : "🔍 Load Keyframes"}
              </button>
            </div>

            {/* Batch Filter Buttons */}
            <div style={{
              display: 'flex',
              gap: '8px',
              marginTop: '12px',
              flexWrap: 'wrap'
            }}>
              <div style={{ fontSize: '12px', color: '#ccc', width: '100%', marginBottom: '4px' }}>
                Quick Load Batch:
              </div>
              <button
                onClick={() => handleVideoSelectionForViewing('L23')}
                disabled={loadingVideoKeyframes}
                style={{
                  flex: '1',
                  padding: '8px 12px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loadingVideoKeyframes ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  opacity: loadingVideoKeyframes ? 0.6 : 1,
                  transition: 'transform 0.2s, opacity 0.2s'
                }}
                onMouseEnter={(e) => !loadingVideoKeyframes && (e.target.style.transform = 'scale(1.05)')}
                onMouseLeave={(e) => (e.target.style.transform = 'scale(1)')}
              >
                🚴 L23 - Đua xe đạp
              </button>
              <button
                onClick={() => handleVideoSelectionForViewing('L24')}
                disabled={loadingVideoKeyframes}
                style={{
                  flex: '1',
                  padding: '8px 12px',
                  background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loadingVideoKeyframes ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  opacity: loadingVideoKeyframes ? 0.6 : 1,
                  transition: 'transform 0.2s, opacity 0.2s'
                }}
                onMouseEnter={(e) => !loadingVideoKeyframes && (e.target.style.transform = 'scale(1.05)')}
                onMouseLeave={(e) => (e.target.style.transform = 'scale(1)')}
              >
                🦁 L24 - Múa lân
              </button>
              <button
                onClick={() => handleVideoSelectionForViewing('L26')}
                disabled={loadingVideoKeyframes}
                style={{
                  flex: '1',
                  padding: '8px 12px',
                  background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loadingVideoKeyframes ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  opacity: loadingVideoKeyframes ? 0.6 : 1,
                  transition: 'transform 0.2s, opacity 0.2s'
                }}
                onMouseEnter={(e) => !loadingVideoKeyframes && (e.target.style.transform = 'scale(1.05)')}
                onMouseLeave={(e) => (e.target.style.transform = 'scale(1)')}
              >
                🍳 L26 - Nấu ăn
              </button>
            </div>

            {videoKeyframes.length > 0 && (
              <div className="video-keyframes-status">
                <div className="keyframes-info">
                  <span>📊 {videoKeyframes.length} keyframes from {selectedVideoForViewing}</span>
                  <span style={{fontSize: "12px", color: "#666", marginTop: "4px", display: "block"}}>
                    View keyframes on the right side →
                  </span>
                  <button
                    className="clear-keyframes-btn"
                    onClick={() => {
                      setSelectedVideoForViewing("");
                      setVideoKeyframes([]);
                      exitVideoBrowse();
                    }}
                  >
                    ✕ Clear
                  </button>
                </div>
              </div>
            )}
          </div>

          {(results.length > 0 || (searchModeType === "temporal" && temporalSearch.isActive)) && (
            <div className="csv-export-section">
              <label className="csv-label">
                Export Selected ({
                  (searchModeType === "temporal" && temporalSearch.isActive) ? "Temporal Results" :
                  appMode === "qa" ? "Q&A Format" :
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
                  {(searchModeType === "temporal" && temporalSearch.isActive) ? (
                    <>
                      {temporalSearch.results.length} temporal results
                      <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>
                        From {temporalSearch.events.filter(e => e.trim()).length} events
                        {appMode === "qa" && " (Q&A analysis)"}
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
                  <button className="csv-btn select-all" onClick={selectAllCurrentPage}>
                    Select Page
                  </button>
                  <button className="csv-btn clear-all" onClick={clearAllSelection}>
                    Clear All
                  </button>
                  <button
                    className="csv-btn download"
                    onClick={downloadCSV}
                    disabled={
                      (searchModeType === "temporal" && temporalSearch.isActive) ? temporalSearch.results.length === 0 :
                      selectedItems.size === 0
                    }
                  >
                    📥 Download CSV
                  </button>
                  <button
                    className="csv-btn download"
                    onClick={downloadJSON}
                    disabled={
                      (searchModeType === "temporal" && temporalSearch.isActive) ? temporalSearch.results.length === 0 :
                      selectedItems.size === 0
                    }
                  >
                    📦 Download JSON
                  </button>
                  {dresConfig.isAuthenticated && dresEvaluation.selectedEvaluationId && (
                    <button
                      className="csv-btn download"
                      onClick={handleDRESSubmit}
                      disabled={
                        dresSubmission.isSubmitting ||
                        ((searchModeType === "temporal" && temporalSearch.isActive) ? temporalSearch.results.length === 0 :
                        selectedItems.size === 0)
                      }
                      style={{
                        background: dresSubmission.isSubmitting ? '#6c757d' : '#28a745',
                        opacity: dresSubmission.isSubmitting ? 0.7 : 1
                      }}
                    >
                      {dresSubmission.isSubmitting ? '⏳ Submitting...' : '🏆 Submit to DRES'}
                    </button>
                  )}
                </div>
              </div>
              {searchModeType === "temporal" && temporalSearch.isActive ? (
                <div style={{ fontSize: "11px", color: "#666", marginTop: "5px" }}>
                  CSV: L10_V001, 1200, 1850 | JSON: TR-video-frameIDs
                </div>
              ) : appMode === "qa" ? (
                <div style={{ fontSize: "11px", color: "#666", marginTop: "5px" }}>
                  CSV: videoFile,frameNum,answer | JSON: QA-answer-video-time(ms)
                </div>
              ) : appMode === "textual-kis" ? (
                <div style={{ fontSize: "11px", color: "#666", marginTop: "5px" }}>
                  JSON: mediaItemName with start/end time(ms)
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className={`main-content ${videoBrowseMode ? 'with-video-browse' : ''}`}>
        <div className="main-search-results">
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
            {/* Video Filter Section */}
            {currentDataSource.length > 0 && (
              <div className="video-filter-section">
                <div className="video-filter-controls">
                  <span className="video-filter-label">
                    Filter by Video:
                  </span>
                  <select
                    className="video-filter-select"
                    value={videoFilter}
                    onChange={(e) => handleVideoFilterChange(e.target.value)}
                  >
                    <option value="all">🎭 All Videos ({rawDataSource.length} frames)</option>
                    {getUniqueVideos(rawDataSource).map(videoId => {
                      const count = filterResultsByVideo(rawDataSource, videoId).length;
                      return (
                        <option key={videoId} value={videoId}>
                          📹 {videoId} ({count} frames)
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="video-filter-info">
                  📊 Showing: {currentDataSource.length} frames
                  {videoFilter !== "all" && ` from ${videoFilter}`}
                </div>
              </div>
            )}

            {searchTime && (
              <div style={{
                textAlign: "center",
                margin: "10px 0",
                color: "#666",
                fontSize: "14px"
              }}>
                {(searchModeType === "temporal" && temporalSearch.isActive) ? (
                  <div>
                    {temporalSearch.searchMode === "consolidated" ? "🎯" : "🔄"}
                    {appMode === "qa" ? " Q&A" : ""}
                    {" "}{temporalSearch.searchMode.charAt(0).toUpperCase() + temporalSearch.searchMode.slice(1)} temporal search completed in {searchTime}s
                    <div style={{fontSize: "12px", marginTop: "2px"}}>
                      {temporalSearch.searchMode === "consolidated" ?
                        `${results.length} video timelines from ${temporalSearch.events.filter(e => e.trim()).length} events` :
                        `${results.length} results from ${temporalSearch.events.filter(e => e.trim()).length} events`
                      }
                      {appMode === "qa" && " (optimized for Q&A)"}
                    </div>
                  </div>
                ) : (
                  `🔍 Search completed in ${searchTime}s - ${results.length} results (${searchType === "image" ? "IMAGE SEARCH" : searchMode.toUpperCase()})`
                )}
              </div>
            )}
            <div className="result-box">
              {currentPageData.map((item, idx) => (
                <div key={idx} className={`card ${selectedItems.has(item.videoId) ? 'selected' : ''} ${item.isConsolidated ? 'consolidated-card' : ''}`}>
                  <div className="card-header-new">
                    {!item.videoTimeline && (
                      <div className="regular-card-header">
                        <input
                          type="checkbox"
                          className="regular-card-checkbox"
                          checked={selectedItems.has(item.videoId)}
                          onChange={() => toggleItemSelection(item.videoId)}
                          title="Select for CSV export"
                        />
                        <div style={{ flex: 1 }}>
                          <span className="card-caption-new">{item.caption}</span>
                          <FrameTimestamp frameId={item.videoId} />
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Timeline Mode: Show video timeline with consecutive events in same row (both consolidated and progressive) */}
                  {item.videoTimeline && (
                      <div className="consolidated-timeline-container">
                        <div className="timeline-header-above-frames">
                          <div className="timeline-header-content">
                            <div className="timeline-left-section">
                              <input
                                type="checkbox"
                                className="timeline-checkbox"
                                checked={selectedItems.has(item.videoId)}
                                onChange={() => toggleItemSelection(item.videoId)}
                              />
                              <span className="timeline-score-header">
                                {item.videoTimeline.video_id} | Timeline Score: {item.videoTimeline.score.toFixed(3)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div 
                          className="timeline-events-horizontal"
                          style={{'--frame-count': item.videoTimeline.frames.length}}
                        >
                          {item.videoTimeline.frames.map((frameObj, eventIdx) => (
                            <React.Fragment key={eventIdx}>
                              <div className="timeline-event-frame">
                                <img
                                  src={(() => {
                                    const parts = frameObj.id.split('_');
                                    const batch = parts[0];
                                    const videoNumber = parts[1];
                                    const baseVideoId = `${batch}_${videoNumber}`;
                                    const batchConfig = getBatchConfig(frameObj.id);
                                    return `/${batchConfig.keyframesDir}/${batch}/${baseVideoId}/${frameObj.id}.jpg`;
                                  })()}
                                  alt={`Event ${eventIdx + 1}`}
                                  className="event-frame-image"
                                  onClick={() => handleKeyframeClick(frameObj.id)}
                                  onError={(e) => {
                                    e.target.src = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSBOb3QgRm91bmQ8L3RleHQ+PC9zdmc+";
                                    e.target.style.filter = "grayscale(1)";
                                  }}
                                  title={`🎥 Click to open video at timestamp ${frameObj.id}`}
                                />
                                <div className="event-frame-caption">
                                  <div className="event-number">E{eventIdx + 1}</div>
                                  <div className="event-frame-id">{frameObj.id}</div>
                                  <div className="event-frame-score">Score: {frameObj.score.toFixed(3)}</div>
                                  <FrameTimestamp frameId={frameObj.id} />
                                </div>
                              </div>
                              {eventIdx < item.videoTimeline.frames.length - 1 && (
                                <div className="event-arrow">→</div>
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                        <div className="timeline-summary">
                          <div className="sequence-info">
                            🎬 Video Sequence: {item.videoTimeline.frames.length} events detected | 
                            Avg Frame Score: {(item.videoTimeline.frameScores.reduce((a, b) => a + b, 0) / item.videoTimeline.frameScores.length).toFixed(3)}
                          </div>
                        </div>
                      </div>
                    )}
                    
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
                  
                  {/* Only show main image for non-consolidated cards */}
                  {!item.isConsolidated && (
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
                  )}
                </div>
              ))}
              {Array.from({ length: missingCount }).map((_, idx) => (
                <div key={"empty-" + idx} className="card-empty"></div>
              ))}
            </div>
            <div className="pagination">
              <button onClick={() => goToPage(((searchModeType === "temporal" && temporalSearch.isActive) ? temporalSearch.currentPage : pageIndex) - 1)} disabled={((searchModeType === "temporal" && temporalSearch.isActive) ? temporalSearch.currentPage : pageIndex) === 0}>
                Previous
              </button>

              <span>
                Page {((searchModeType === "temporal" && temporalSearch.isActive) ? temporalSearch.currentPage : pageIndex) + 1} of {totalPages}
                {(searchModeType === "temporal" && temporalSearch.isActive) && (
                  <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>
                    Temporal Search Results ({temporalFrameSize} per page)
                  </div>
                )}
              </span>

              <button
                onClick={() => goToPage(((searchModeType === "temporal" && temporalSearch.isActive) ? temporalSearch.currentPage : pageIndex) + 1)}
                disabled={((searchModeType === "temporal" && temporalSearch.isActive) ? temporalSearch.currentPage : pageIndex) === totalPages - 1}
              >
                Next
              </button>
            </div>
          </>
        )}

        </div>

        {/* Video Browse Display (Right Side) */}
        {videoBrowseMode && videoKeyframes.length > 0 && (
          <div className="video-browse-section">
            <div className="video-browse-header">
              <h3>🎬 Browse Video: {browsedVideoId}</h3>
              <div className="video-browse-controls">
                <span className="browse-info">
                  {videoKeyframes.length} frames total
                </span>
                <button
                  className="exit-browse-btn"
                  onClick={exitVideoBrowse}
                >
                  ✕ Close Browse
                </button>
              </div>
            </div>

            <div className="video-browse-content">
              {(() => {
                const browseFramesPerPage = 8;
                const totalBrowsePages = Math.ceil(videoKeyframes.length / browseFramesPerPage);
                const currentBrowseFrames = videoKeyframes.slice(
                  browseCurrentPage * browseFramesPerPage,
                  (browseCurrentPage + 1) * browseFramesPerPage
                );

                return (
                  <>
                    <div className="browse-frames-grid">
                      {currentBrowseFrames.map((frame, index) => (
                        <div key={index} className={`browse-frame-item ${selectedBrowseFrames.has(frame.videoId) ? 'selected' : ''}`}>
                          <input
                            type="checkbox"
                            className="browse-frame-checkbox"
                            checked={selectedBrowseFrames.has(frame.videoId)}
                            onChange={() => {
                              setSelectedBrowseFrames(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(frame.videoId)) {
                                  newSet.delete(frame.videoId);
                                } else {
                                  newSet.add(frame.videoId);
                                }
                                return newSet;
                              });
                            }}
                            title="Select for submission"
                          />
                          <img
                            src={frame.image}
                            alt={`Frame ${frame.timestamp}`}
                            className="browse-frame-image"
                            onClick={() => setBrowseZoomedFrame(frame)}
                            onError={(e) => {
                              e.target.src = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5GcmFtZSBOb3QgRm91bmQ8L3RleHQ+PC9zdmc+";
                              e.target.style.filter = "grayscale(1)";
                            }}
                          />
                          <div className="browse-frame-info">
                            <div className="browse-frame-filename">{frame.videoId}</div>
                            <FrameTimestamp frameId={frame.videoId} />
                            <div className="browse-zoom-hint">🔍 Click to zoom</div>
                          </div>
                          <div
                            className="browse-play-btn"
                            onClick={() => handleKeyframeClick(frame.videoId)}
                            title="Play video at this frame"
                          >
                            ▶️
                          </div>
                        </div>
                      ))}
                    </div>

                    {totalBrowsePages > 1 && (
                      <div className="browse-pagination">
                        <button
                          onClick={() => goToBrowsePage(browseCurrentPage - 1)}
                          disabled={browseCurrentPage === 0}
                          className="browse-page-btn"
                        >
                          ← Previous
                        </button>

                        <span className="browse-page-info">
                          Page {browseCurrentPage + 1} of {totalBrowsePages}
                          <div style={{ fontSize: "12px", color: "#666", marginTop: "2px" }}>
                            Showing {currentBrowseFrames.length} of {videoKeyframes.length} frames
                          </div>
                        </span>

                        <button
                          onClick={() => goToBrowsePage(browseCurrentPage + 1)}
                          disabled={browseCurrentPage >= totalBrowsePages - 1}
                          className="browse-page-btn"
                        >
                          Next →
                        </button>
                      </div>
                    )}

                    {/* Browse Frame Submission Section */}
                    {selectedBrowseFrames.size > 0 && dresConfig.isAuthenticated && dresEvaluation.selectedEvaluationId && (
                      <div style={{
                        marginTop: '16px',
                        padding: '12px',
                        background: 'rgba(40, 167, 69, 0.1)',
                        borderRadius: '8px',
                        border: '1px solid rgba(40, 167, 69, 0.3)'
                      }}>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '8px'
                        }}>
                          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#28a745' }}>
                            📋 Selected: {selectedBrowseFrames.size} frame(s)
                          </div>
                          <button
                            onClick={() => setSelectedBrowseFrames(new Set())}
                            style={{
                              padding: '4px 8px',
                              background: '#dc3545',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '11px',
                              cursor: 'pointer'
                            }}
                          >
                            Clear All
                          </button>
                        </div>
                        <button
                          onClick={() => {
                            // Open review modal with selected browse frames
                            const items = Array.from(selectedBrowseFrames).map(frameId => {
                              const parts = frameId.split('_');
                              const videoName = `${parts[0]}_${parts[1]}`;
                              const frameNumber = parseInt(parts[2]);
                              // Calculate time with default FPS 25 (will be updated with actual FPS in modal)
                              const timeMs = Math.round((frameNumber / 25) * 1000);

                              return {
                                videoId: frameId,
                                videoName: videoName,
                                frameId: frameNumber,
                                timeMs: timeMs,
                                answer: "",
                                canEditAnswer: false
                              };
                            });

                            setDresReview({
                              isOpen: true,
                              items: items,
                              mode: "textual-kis", // Default to KIS mode
                              editedAnswers: {}
                            });
                          }}
                          disabled={dresSubmission.isSubmitting}
                          style={{
                            width: '100%',
                            padding: '8px',
                            background: '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '13px',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                          }}
                        >
                          🏆 Submit Selected to DRES
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
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
                Initial Keyframe: {videoPlayer.keyframe} → {Math.floor(videoPlayer.timestamp / 60)}:{String(videoPlayer.timestamp % 60).padStart(2, '0')}
                {videoPlayer.fps && (
                  <div style={{ fontSize: '12px', marginTop: '4px' }}>
                    FPS: {videoPlayer.fps} | Initial Frame: {videoPlayer.keyframe.split('_')[2]} | Duration: {Math.floor(videoPlayer.videoDuration / 60)}:{String(videoPlayer.videoDuration % 60).padStart(2, '0')}
                  </div>
                )}
              </div>

              {/* Simple Time to Frame Calculator */}
              <div style={{
                backgroundColor: 'rgba(0, 123, 255, 0.1)',
                border: '1px solid rgba(0, 123, 255, 0.3)',
                borderRadius: '4px',
                padding: '10px',
                marginBottom: '10px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '8px'
                }}>
                  <span style={{ color: '#007bff', fontSize: '12px', fontWeight: 'bold', minWidth: '70px' }}>
                    Enter Time:
                  </span>
                  <input
                    type="text"
                    placeholder="00:56.497 or 56.497 (with milliseconds)"
                    value={timeInput}
                    onChange={(e) => setTimeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleTimeToFrameConversion();
                      }
                    }}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '3px',
                      border: '1px solid #555',
                      backgroundColor: '#2a2a2a',
                      color: 'white',
                      fontSize: '12px',
                      flex: 1
                    }}
                  />
                  <button
                    onClick={handleTimeToFrameConversion}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '3px',
                      border: 'none',
                      backgroundColor: '#007bff',
                      color: 'white',
                      fontSize: '11px',
                      cursor: 'pointer'
                    }}
                  >
                    ➡️ Convert
                  </button>
                </div>

                {calculatedFrameOrder && (
                  <div style={{
                    backgroundColor: 'rgba(0, 255, 0, 0.1)',
                    border: '1px solid rgba(0, 255, 0, 0.3)',
                    borderRadius: '3px',
                    padding: '6px',
                    textAlign: 'center'
                  }}>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: 'bold',
                      color: '#00ff00',
                      marginBottom: '2px'
                    }}>
                      Frame Order: {calculatedFrameOrder.frameOrder.toLocaleString()}
                    </div>
                    <div style={{
                      fontSize: '10px',
                      color: '#888',
                      fontFamily: 'monospace'
                    }}>
                      {calculatedFrameOrder.preciseCalculation}
                    </div>
                  </div>
                )}

                <div style={{
                  fontSize: '9px',
                  color: '#888',
                  textAlign: 'center',
                  marginTop: '4px'
                }}>
                  Video FPS: {videoPlayer.fps} | Duration: {Math.floor(videoPlayer.videoDuration / 60)}:{String(videoPlayer.videoDuration % 60).padStart(2, '0')}
                </div>
              </div>


              {/* YouTube iframe */}
              <iframe
                key={videoPlayer.timestamp}
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

        {/* Frame Zoom Modal for Browse */}
        {browseZoomedFrame && (
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
                onClick={() => setBrowseZoomedFrame(null)}
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
                {browsedVideoId} - {browseZoomedFrame.videoId}
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
                  src={browseZoomedFrame.image}
                  alt={`Frame ${browseZoomedFrame.timestamp} - Zoomed`}
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

              {/* Play video button */}
              <div style={{
                textAlign: 'center',
                marginTop: '15px'
              }}>
                <button
                  onClick={() => {
                    setBrowseZoomedFrame(null);
                    handleKeyframeClick(browseZoomedFrame.videoId);
                  }}
                  style={{
                    backgroundColor: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    fontSize: '14px',
                    cursor: 'pointer',
                    marginRight: '10px'
                  }}
                >
                  ▶️ Play Video ({browseZoomedFrame.videoId})
                </button>
              </div>

              {/* Instructions */}
              <div style={{
                color: '#999',
                marginTop: '15px',
                fontSize: '12px',
                textAlign: 'center'
              }}>
                Press ESC or click × to close zoom view
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
                Frame {zoomedFrame.frameNum}
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
          {searchModeType === "temporal" ? (
            // Temporal search interface
            <div className="temporal-search-interface">
              <div className="temporal-search-info">
                <span>
                  {appMode === "textual-kis" && "🔍 Sequential Event Search"}
                  {appMode === "qa" && "❓ Multi-Event Q&A Analysis"}
                </span>
                <div style={{fontSize: "12px", color: "#888", marginTop: "4px"}}>
                  Use the temporal search controls in the sidebar to define events
                </div>
              </div>
            </div>
          ) : searchType === "text" ? (
            // Normal text search
            <textarea
              placeholder={
                appMode === "textual-kis" ? "Enter search query for KIS...\n(Supports multi-line text, press Ctrl+Enter to search)" :
                appMode === "qa" ? "Enter question or topic...\n(Supports multi-line text, press Ctrl+Enter to search)" :
                "Enter search query for video selection...\n(Supports multi-line text, press Ctrl+Enter to search)"
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey) {
                  e.preventDefault();
                  search();
                } else if (e.key === "Enter" && !e.shiftKey && query.trim() && query.split('\n').length === 1) {
                  // Single line behavior: Enter submits (unless Shift is held)
                  e.preventDefault();
                  search();
                }
              }}
              rows={3}
              style={{
                minHeight: '80px',
                maxHeight: '200px',
                resize: 'vertical',
                padding: '12px',
                fontSize: '14px',
                lineHeight: '1.5',
                fontFamily: 'inherit'
              }}
            />
          ) : (
            // Image search interface
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
          <button 
            id="search-btn" 
            onClick={search} 
            disabled={
              isSearching || 
              (searchModeType === "temporal" && temporalSearch.events.every(e => !e.trim()))
            }
            style={{
              display: searchModeType === "temporal" ? "none" : "block"
            }}
          >
            {isSearching ? "..." : <FaArrowUp />}
          </button>
        </div>
      </div>

      {/* DRES Submission Review Modal */}
      {dresReview.isOpen && (
        <div className="modal-overlay" onClick={() => setDresReview(prev => ({ ...prev, isOpen: false }))}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Review Submission to DRES</h3>
              <button
                className="modal-close-btn"
                onClick={() => setDresReview(prev => ({ ...prev, isOpen: false }))}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="submission-info">
                <div className="info-item">
                  <span className="info-label">Mode:</span>
                  <span className="info-value">{dresReview.mode.toUpperCase()}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Items:</span>
                  <span className="info-value">{dresReview.items.length}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Evaluation:</span>
                  <span className="info-value">{dresEvaluation.evaluationName}</span>
                </div>
              </div>

              <div className="review-items-container">
                {dresReview.items.map((item, index) => (
                  <div key={item.videoId || index} className="review-item">
                    <div className="review-item-header">
                      <span className="review-item-number">#{index + 1}</span>
                    </div>

                    <div className="review-item-fields">
                      <div className="review-field">
                        <label>Video Name:</label>
                        <input
                          type="text"
                          className="field-edit-input"
                          defaultValue={item.videoName}
                          onChange={(e) => {
                            setDresReview(prev => ({
                              ...prev,
                              editedAnswers: {
                                ...prev.editedAnswers,
                                [`${item.videoId}_videoName`]: e.target.value
                              }
                            }));
                          }}
                        />
                      </div>

                      {item.timeMs !== undefined && (
                        <div className="review-field">
                          <label>Timestamp (ms):</label>
                          <input
                            type="number"
                            className="field-edit-input"
                            defaultValue={item.timeMs}
                            onChange={(e) => {
                              setDresReview(prev => ({
                                ...prev,
                                editedAnswers: {
                                  ...prev.editedAnswers,
                                  [`${item.videoId}_timeMs`]: e.target.value
                                }
                              }));
                            }}
                          />
                        </div>
                      )}

                      {dresReview.mode === "qa" && (
                        <div className="review-field">
                          <label>Answer:</label>
                          <input
                            type="text"
                            className="field-edit-input"
                            placeholder="Enter answer..."
                            defaultValue={item.answer}
                            onChange={(e) => {
                              setDresReview(prev => ({
                                ...prev,
                                editedAnswers: {
                                  ...prev.editedAnswers,
                                  [item.videoId]: e.target.value
                                }
                              }));
                            }}
                          />
                        </div>
                      )}

                      {item.frameIds && dresReview.mode === "trake" && (
                        <div className="review-field">
                          <label>Frame Sequence ({(dresReview.editedAnswers[`${item.videoId}_frames`] || item.frameIds).length} frames):</label>
                          <div className="frame-sequence-editor">
                            {(dresReview.editedAnswers[`${item.videoId}_frames`] || item.frameIds).map((frameId, frameIndex) => (
                              <div key={frameIndex} className="frame-chip">
                                <input
                                  type="text"
                                  className="frame-chip-input"
                                  value={frameId}
                                  onChange={(e) => {
                                    const currentFrames = dresReview.editedAnswers[`${item.videoId}_frames`] || [...item.frameIds];
                                    currentFrames[frameIndex] = e.target.value;
                                    setDresReview(prev => ({
                                      ...prev,
                                      editedAnswers: {
                                        ...prev.editedAnswers,
                                        [`${item.videoId}_frames`]: currentFrames
                                      }
                                    }));
                                  }}
                                />
                                <button
                                  className="frame-chip-btn move-up"
                                  onClick={() => {
                                    if (frameIndex === 0) return;
                                    const currentFrames = dresReview.editedAnswers[`${item.videoId}_frames`] || [...item.frameIds];
                                    [currentFrames[frameIndex - 1], currentFrames[frameIndex]] = [currentFrames[frameIndex], currentFrames[frameIndex - 1]];
                                    setDresReview(prev => ({
                                      ...prev,
                                      editedAnswers: {
                                        ...prev.editedAnswers,
                                        [`${item.videoId}_frames`]: currentFrames
                                      }
                                    }));
                                  }}
                                  disabled={frameIndex === 0}
                                  title="Move up"
                                >
                                  ↑
                                </button>
                                <button
                                  className="frame-chip-btn move-down"
                                  onClick={() => {
                                    const currentFrames = dresReview.editedAnswers[`${item.videoId}_frames`] || [...item.frameIds];
                                    if (frameIndex === currentFrames.length - 1) return;
                                    [currentFrames[frameIndex], currentFrames[frameIndex + 1]] = [currentFrames[frameIndex + 1], currentFrames[frameIndex]];
                                    setDresReview(prev => ({
                                      ...prev,
                                      editedAnswers: {
                                        ...prev.editedAnswers,
                                        [`${item.videoId}_frames`]: currentFrames
                                      }
                                    }));
                                  }}
                                  disabled={frameIndex === (dresReview.editedAnswers[`${item.videoId}_frames`] || item.frameIds).length - 1}
                                  title="Move down"
                                >
                                  ↓
                                </button>
                                <button
                                  className="frame-chip-btn remove"
                                  onClick={() => {
                                    const currentFrames = dresReview.editedAnswers[`${item.videoId}_frames`] || [...item.frameIds];
                                    currentFrames.splice(frameIndex, 1);
                                    setDresReview(prev => ({
                                      ...prev,
                                      editedAnswers: {
                                        ...prev.editedAnswers,
                                        [`${item.videoId}_frames`]: currentFrames
                                      }
                                    }));
                                  }}
                                  title="Remove frame"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                            <button
                              className="add-frame-btn"
                              onClick={() => {
                                const currentFrames = dresReview.editedAnswers[`${item.videoId}_frames`] || [...item.frameIds];
                                const lastFrame = currentFrames[currentFrames.length - 1];
                                const newFrame = lastFrame ? String(parseInt(lastFrame) + 100) : "1000";
                                currentFrames.push(newFrame);
                                setDresReview(prev => ({
                                  ...prev,
                                  editedAnswers: {
                                    ...prev.editedAnswers,
                                    [`${item.videoId}_frames`]: currentFrames
                                  }
                                }));
                              }}
                            >
                              + Add Frame
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="modal-btn cancel"
                onClick={() => setDresReview(prev => ({ ...prev, isOpen: false }))}
              >
                Cancel
              </button>
              <button
                className="modal-btn confirm"
                onClick={confirmDRESSubmission}
                disabled={dresReview.mode === "qa" && dresReview.items.some(item =>
                  item.canEditAnswer &&
                  !(dresReview.editedAnswers[item.videoId] || item.answer)?.trim()
                )}
              >
                Confirm & Submit to DRES
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DRES Manual Submission Modal */}
      {dresManualSubmit.isOpen && (
        <div className="modal-overlay" onClick={() => setDresManualSubmit(prev => ({ ...prev, isOpen: false }))}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Manual DRES Submission</h3>
              <button
                className="modal-close-btn"
                onClick={() => setDresManualSubmit(prev => ({ ...prev, isOpen: false }))}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="submission-info">
                <div className="info-item">
                  <span className="info-label">Evaluation:</span>
                  <span className="info-value">{dresEvaluation.evaluationName}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Mode:</span>
                  <select
                    value={dresManualSubmit.mode}
                    onChange={(e) => setDresManualSubmit(prev => ({ ...prev, mode: e.target.value }))}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      border: '1px solid rgba(255,255,255,0.3)',
                      background: 'rgba(255,255,255,0.1)',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: '700'
                    }}
                  >
                    <option value="textual-kis">TEXTUAL-KIS</option>
                    <option value="qa">QA</option>
                    <option value="trake">TRAKE</option>
                  </select>
                </div>
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block', color: '#333' }}>
                  Enter Submission Data:
                </label>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                  {dresManualSubmit.mode === 'textual-kis' && (
                    <>
                      <strong>Format (one per line):</strong><br/>
                      videoName, startMs, endMs<br/>
                      <em>Example: K09_V013, 1000, 2000</em>
                    </>
                  )}
                  {dresManualSubmit.mode === 'qa' && (
                    <>
                      <strong>Format (one per line):</strong><br/>
                      QA-answer-video-timeMs  OR  answer, video, timeMs<br/>
                      <em>Example: QA-dog-K09_V013-1500  OR  dog, K09_V013, 1500</em>
                    </>
                  )}
                  {dresManualSubmit.mode === 'trake' && (
                    <>
                      <strong>Format (one per line):</strong><br/>
                      TR-video-frameId1,frameId2,...  OR  video, frameId1, frameId2, ...<br/>
                      <em>Example: TR-L27_V014-8681,10184  OR  L27_V014, 8681, 10184</em>
                    </>
                  )}
                </div>
                <textarea
                  value={dresManualSubmit.rawInput}
                  onChange={(e) => setDresManualSubmit(prev => ({ ...prev, rawInput: e.target.value }))}
                  placeholder={
                    dresManualSubmit.mode === 'textual-kis' ? 'K09_V013, 1000, 2000\nL21_V005, 5000, 6000' :
                    dresManualSubmit.mode === 'qa' ? 'dog, K09_V013, 1500\ncat, L21_V005, 3000' :
                    'L27_V014, 8681, 10184\nK09_V013, 1234, 5678'
                  }
                  rows={12}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #d0d0d0',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontFamily: "'Courier New', monospace",
                    resize: 'vertical'
                  }}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="modal-btn cancel"
                onClick={() => setDresManualSubmit(prev => ({ ...prev, isOpen: false }))}
              >
                Cancel
              </button>
              <button
                className="modal-btn confirm"
                onClick={handleManualDRESSubmit}
                disabled={!dresManualSubmit.rawInput.trim() || dresSubmission.isSubmitting}
              >
                {dresSubmission.isSubmitting ? '⏳ Submitting...' : '🏆 Submit to DRES'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DRES Submission History Modal */}
      {historyModalOpen && (
        <div className="modal-overlay" onClick={() => setHistoryModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', maxHeight: '80vh' }}>
            <div className="modal-header">
              <h3>📜 Submission History ({submissionHistory.length})</h3>
              <button
                className="modal-close-btn"
                onClick={() => setHistoryModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {submissionHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
                  <p>No submission history yet</p>
                </div>
              ) : (
                <div>
                  {/* Clear History Button */}
                  <div style={{ marginBottom: '16px', textAlign: 'right' }}>
                    <button
                      onClick={() => {
                        if (window.confirm('Are you sure you want to clear all submission history?')) {
                          setSubmissionHistory([]);
                        }
                      }}
                      style={{
                        padding: '6px 12px',
                        background: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      🗑️ Clear History
                    </button>
                  </div>

                  {/* History List */}
                  {submissionHistory.map((record, index) => (
                    <div
                      key={record.id}
                      style={{
                        marginBottom: '12px',
                        padding: '12px',
                        background: record.status === 'success' ? 'rgba(76, 175, 80, 0.1)' : 'rgba(220, 53, 69, 0.1)',
                        border: `1px solid ${record.status === 'success' ? 'rgba(76, 175, 80, 0.3)' : 'rgba(220, 53, 69, 0.3)'}`,
                        borderRadius: '6px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#000', marginBottom: '6px' }}>
                            {record.status === 'success' ? '✅' : '❌'} Submission #{submissionHistory.length - index}
                          </div>
                          <div style={{ fontSize: '13px', color: '#444', fontWeight: '500' }}>
                            {record.timestampReadable}
                          </div>
                        </div>
                        <div style={{
                          padding: '6px 12px',
                          background: record.status === 'success' ? '#28a745' : '#dc3545',
                          color: 'white',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        }}>
                          {record.status.toUpperCase()}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '14px', color: '#222' }}>
                        <div>
                          <strong style={{ color: '#000' }}>Mode:</strong> {record.mode}
                        </div>
                        <div>
                          <strong style={{ color: '#000' }}>Source:</strong> {record.source}
                        </div>
                        <div>
                          <strong style={{ color: '#000' }}>Items:</strong> {record.itemCount}
                        </div>
                        <div>
                          <strong style={{ color: '#000' }}>User:</strong> {record.username}
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <strong style={{ color: '#000' }}>Evaluation:</strong> {record.evaluation}
                        </div>
                        {record.error && (
                          <div style={{ gridColumn: '1 / -1', color: '#dc3545' }}>
                            <strong>Error:</strong> {record.error}
                          </div>
                        )}
                      </div>

                      {/* Show submission data details */}
                      <details style={{ marginTop: '12px' }}>
                        <summary style={{
                          cursor: 'pointer',
                          fontSize: '14px',
                          color: '#007bff',
                          fontWeight: 'bold',
                          padding: '8px',
                          background: 'rgba(0, 123, 255, 0.1)',
                          borderRadius: '4px',
                          userSelect: 'none'
                        }}>
                          🔍 View Submission Data
                        </summary>
                        <pre style={{
                          marginTop: '8px',
                          padding: '12px',
                          background: '#f8f9fa',
                          border: '1px solid #dee2e6',
                          borderRadius: '6px',
                          fontSize: '13px',
                          maxHeight: '300px',
                          overflowY: 'auto',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                          color: '#212529',
                          lineHeight: '1.6',
                          fontFamily: '"Courier New", monospace'
                        }}>
                          {JSON.stringify(record.data, null, 2)}
                        </pre>
                      </details>

                      {/* Export buttons */}
                      <div style={{ marginTop: '12px', display: 'flex', gap: '10px' }}>
                        <button
                          onClick={() => {
                            const dataStr = JSON.stringify(record.data, null, 2);
                            const blob = new Blob([dataStr], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `submission_${record.id}.json`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          style={{
                            padding: '8px 14px',
                            background: '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '600'
                          }}
                        >
                          📥 Export JSON
                        </button>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(JSON.stringify(record.data, null, 2));
                            alert('Copied to clipboard!');
                          }}
                          style={{
                            padding: '8px 14px',
                            background: '#6c757d',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '600'
                          }}
                        >
                          📋 Copy
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                className="modal-btn cancel"
                onClick={() => setHistoryModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;