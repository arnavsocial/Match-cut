import { AIEngine } from './ai-engine.js';

document.addEventListener('DOMContentLoaded', async () => {
    // --- UI Elements ---
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const canvas = document.getElementById('preview-canvas');
    const ctx = canvas.getContext('2d');
    const btnPlayPause = document.getElementById('btn-play-pause');
    const iconPlay = document.getElementById('icon-play');
    const iconPause = document.getElementById('icon-pause');
    const sliderSpeed = document.getElementById('slider-speed');
    const speedLabel = document.getElementById('speed-label');
    const frameCounter = document.getElementById('frame-counter');
    const btnExport = document.getElementById('btn-export');
    const exportText = document.getElementById('export-text');
    const ratioSelect = document.getElementById('ratio-select');
    const toggleGuides = document.getElementById('toggle-guides');
    const aiStatusText = document.getElementById('ai-status-text');
    const aiStatusDot = document.getElementById('ai-status-dot');
    
    // --- State ---
    const RATIOS = {
        '1:1': { w: 1024, h: 1024 },
        '9:16': { w: 1080, h: 1920 },
        '16:9': { w: 1920, h: 1080 }
    };
    
    let frames = []; // Array of aligned canvas objects
    let isPlaying = true;
    let currentFrame = 0;
    let playbackSpeed = parseFloat(sliderSpeed.value); // in seconds
    let currentRatio = '1:1';
    let playbackTimer = null;

    // --- 1. Initialize AI Engine ---
    const ai = new AIEngine();
    try {
        await ai.initialize();
        aiStatusText.textContent = "AI READY";
        aiStatusDot.classList.replace('bg-gray-400', 'bg-green-500');
        aiStatusText.parentElement.classList.replace('bg-gray-200', 'bg-green-100');
        aiStatusText.parentElement.classList.replace('text-gray-500', 'text-green-600');
    } catch (e) {
        aiStatusText.textContent = "AI FAILED";
        aiStatusDot.classList.replace('bg-gray-400', 'bg-red-500');
        console.error(e);
        alert("Failed to load AI. Please check your internet connection and browser WebGPU support.");
    }

    // --- 2. Setup Canvas ---
    function updateCanvasSize() {
        const dims = RATIOS[currentRatio];
        canvas.width = dims.w;
        canvas.height = dims.h;
        renderCurrentFrame();
    }
    ratioSelect.addEventListener('change', (e) => {
        currentRatio = e.target.value;
        updateCanvasSize();
        // Note: Changing ratio requires reprocessing for perfect Procrustes alignment.
        // For a production app, you would re-trigger processImages() here.
    });
    updateCanvasSize();

    // --- 3. Handle File Uploads ---
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('bg-blue-50', 'border-blue-400');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('bg-blue-50', 'border-blue-400'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('bg-blue-50', 'border-blue-400');
        handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    async function handleFiles(fileList) {
        if (!ai.isReady) return alert("Please wait for the AI to load.");
        
        const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
        if (files.length === 0) return;

        // Visual feedback
        dropZone.querySelector('div').textContent = "Processing...";
        
        // Ensure PyScript is loaded and aligner is available
        // In PyScript, Python variables are attached to the pyscript interpreter globals
        let pythonAligner = null;
        try {
            // Retrieve the 'aligner' instance we created in aligner.py
            pythonAligner = pyscript.interpreter.globals.get('aligner');
        } catch (err) {
            console.warn("PyScript not fully loaded yet or aligner missing.", err);
            alert("Python alignment engine is still loading. Try again in a few seconds.");
            dropZone.querySelector('div').textContent = "Tap to add photos,";
            return;
        }

        const outW = RATIOS[currentRatio].w;
        const outH = RATIOS[currentRatio].h;

        for (const file of files) {
            const img = await loadImage(file);
            
            // 1. Get exact pupil coordinates from WebGPU Transformer
            const coords = await ai.analyzeImage(img);
            
            if (coords) {
                // 2. Extract raw RGBA pixels from the original image
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = img.width;
                tempCanvas.height = img.height;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(img, 0, 0);
                const imgData = tempCtx.getImageData(0, 0, img.width, img.height);
                
                // 3. Pass data to Python for Procrustes Alignment (OpenCV)
                try {
                    const alignedPixelsProxy = pythonAligner.align_face(
                        imgData.data, img.width, img.height,
                        coords.leftEye.x, coords.leftEye.y,
                        coords.rightEye.x, coords.rightEye.y,
                        outW, outH
                    );
                    
                    // Convert Pyodide proxy back to standard JS Array/TypedArray
                    const alignedArray = alignedPixelsProxy.toJs();
                    const newImgData = new ImageData(new Uint8ClampedArray(alignedArray), outW, outH);
                    
                    // 4. Save to a perfectly aligned frame
                    const frameCanvas = document.createElement('canvas');
                    frameCanvas.width = outW;
                    frameCanvas.height = outH;
                    frameCanvas.getContext('2d').putImageData(newImgData, 0, 0);
                    
                    frames.push({ canvas: frameCanvas, coords });
                    
                    // Clean up Python proxy memory
                    alignedPixelsProxy.destroy();

                } catch (pythonError) {
                    console.error("Python alignment failed for an image:", pythonError);
                }
            }
        }

        // Reset UI
        dropZone.querySelector('div').textContent = "Tap to add photos,";
        const countBadge = document.getElementById('upload-count');
        countBadge.textContent = `${frames.length} Loaded`;
        countBadge.classList.remove('hidden');
        
        if (frames.length > 1) {
            btnExport.disabled = false;
            startPlayback();
        } else {
            renderCurrentFrame();
        }
    }

    // Helper: Convert File to Image
    function loadImage(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    // --- 4. Playback Loop ---
    function startPlayback() {
        if (playbackTimer) clearTimeout(playbackTimer);
        if (!isPlaying || frames.length === 0) return;
        
        renderCurrentFrame();
        currentFrame = (currentFrame + 1) % frames.length;
        
        playbackTimer = setTimeout(startPlayback, playbackSpeed * 1000);
    }

    function renderCurrentFrame() {
        if (frames.length === 0) {
            ctx.fillStyle = '#121212';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            frameCounter.textContent = '0 / 0';
            return;
        }
        
        const frame = frames[currentFrame];
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(frame.canvas, 0, 0);
        
        // Draw crosshair guides if enabled
        if (toggleGuides.checked) {
            const outW = canvas.width;
            const outH = canvas.height;
            const eyeDist = outW * 0.35; // Matches aligner.py logic
            const centerY = outH * 0.40;
            const centerX = outW * 0.5;
            
            ctx.strokeStyle = '#22d3ee'; // Cyan
            ctx.lineWidth = 4;
            ctx.globalAlpha = 0.6;
            
            ctx.beginPath();
            ctx.arc(centerX - (eyeDist/2), centerY, 15, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.arc(centerX + (eyeDist/2), centerY, 15, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.globalAlpha = 1.0;
        }
        
        frameCounter.textContent = `${currentFrame + 1} / ${frames.length}`;
    }

    // --- UI Listeners ---
    btnPlayPause.addEventListener('click', () => {
        isPlaying = !isPlaying;
        iconPlay.classList.toggle('hidden', isPlaying);
        iconPause.classList.toggle('hidden', !isPlaying);
        if (isPlaying) startPlayback();
        else clearTimeout(playbackTimer);
    });

    sliderSpeed.addEventListener('input', (e) => {
        playbackSpeed = parseFloat(e.target.value);
        speedLabel.textContent = `${playbackSpeed.toFixed(2)}s`;
    });

    toggleGuides.addEventListener('change', renderCurrentFrame);

    // --- 5. Export Logic (Silent) ---
    btnExport.addEventListener('click', async () => {
        if (frames.length === 0) return;
        
        const isPlayingCache = isPlaying;
        isPlaying = false;
        clearTimeout(playbackTimer);
        
        btnExport.disabled = true;
        exportText.textContent = "Encoding GIF...";
        
        const gif = new GIF({
            workers: 2,
            quality: 10,
            width: canvas.width,
            height: canvas.height,
            workerScript: 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js'
        });
        
        // Add frames without guides
        const prevGuideState = toggleGuides.checked;
        toggleGuides.checked = false;
        
        frames.forEach(frame => {
            // Draw pure image to export canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(frame.canvas, 0, 0);
            gif.addFrame(ctx, { copy: true, delay: playbackSpeed * 1000 });
        });
        
        toggleGuides.checked = prevGuideState;
        
        gif.on('finished', (blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `match-cut-${Date.now()}.gif`;
            a.click();
            
            URL.revokeObjectURL(url);
            btnExport.disabled = false;
            exportText.textContent = "Export Video";
            
            isPlaying = isPlayingCache;
            if (isPlaying) startPlayback();
        });
        
        gif.render();
    });
});
