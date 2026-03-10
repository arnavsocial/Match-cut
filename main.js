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
    const toggleGuides = document.getElementById('toggle-guides');
    const aiStatusText = document.getElementById('ai-status-text');
    const aiStatusDot = document.getElementById('ai-status-dot');
    
    // Scale & Ratio Elements
    const ratioBtns = document.querySelectorAll('.ratio-btn');
    const sliderScale = document.getElementById('slider-scale');
    const scaleLabel = document.getElementById('scale-label');
    
    // --- State ---
    const RATIOS = {
        '1:1': { w: 1024, h: 1024 },
        '9:16': { w: 1080, h: 1920 },
        '16:9': { w: 1920, h: 1080 },
        '4:5': { w: 1080, h: 1350 }
    };
    
    let originalImages = []; 
    let frames = []; 
    let isPlaying = true;
    let currentFrame = 0;
    let playbackSpeed = parseFloat(sliderSpeed.value); 
    let currentRatio = '1:1';
    let currentScale = 0.35; 
    let playbackTimer = null;

    if (toggleGuides) toggleGuides.checked = false;

    // --- 1. Initialize AI Engine & Python ---
    const ai = new AIEngine();
    try {
        await ai.initialize();
        
        // CRITICAL FIX: Wait for Python via the window object
        await waitForPython();
        
        aiStatusText.textContent = "AI READY";
        aiStatusDot.classList.replace('animate-pulse', 'animate-none');
        aiStatusDot.classList.replace('bg-gray-400', 'bg-green-500');
        aiStatusText.parentElement.classList.replace('bg-gray-200', 'bg-green-100');
        aiStatusText.parentElement.classList.replace('text-gray-500', 'text-green-600');
    } catch (e) {
        aiStatusText.textContent = "AI FAILED";
        aiStatusDot.classList.replace('bg-gray-400', 'bg-red-500');
        console.error(e);
        alert("Failed to load AI. Please check your console for errors.");
    }

    // NEW PYTHON WAITER: Looks directly at the window object
    function waitForPython() {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 120; // 30 seconds max

            const check = () => {
                attempts++;
                // If aligner.py correctly pushed to window.aligner, we are good!
                if (window.aligner) {
                    console.log("Python Bridge Connected!");
                    return resolve(true);
                }

                if (attempts >= maxAttempts) {
                    console.warn("Python timed out. UI unlocked anyway.");
                    return resolve(false); 
                }
                
                setTimeout(check, 250);
            };
            check();
        });
    }

    // --- 2. Setup Canvas & Listeners ---
    function updateCanvasSize() {
        const dims = RATIOS[currentRatio];
        canvas.width = dims.w;
        canvas.height = dims.h;
        renderCurrentFrame();
    }
    
    ratioBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            ratioBtns.forEach(b => {
                b.classList.add('opacity-60');
                b.classList.remove('active-ratio');
            });
            btn.classList.remove('opacity-60');
            btn.classList.add('active-ratio');
            
            currentRatio = btn.dataset.ratio;
            
            const container = document.getElementById('canvas-container');
            container.style.transform = "scale(0.95)";
            
            setTimeout(async () => {
                updateCanvasSize();
                if (originalImages.length > 0) await reprocessFrames();
                container.style.transform = "scale(1)";
            }, 200);
        });
    });

    if (sliderScale) {
        sliderScale.addEventListener('input', (e) => {
            currentScale = parseFloat(e.target.value);
            scaleLabel.textContent = `${Math.round(currentScale * 100)}%`;
        });
        
        sliderScale.addEventListener('change', async () => {
            if (originalImages.length > 0) {
                dropZone.querySelector('div').textContent = "Re-aligning...";
                await reprocessFrames();
                dropZone.querySelector('div').textContent = "Tap to add photos,";
            }
        });
    }

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

        dropZone.querySelector('div').textContent = "Deep Scanning Faces...";
        
        for (const file of files) {
            const img = await loadImage(file);
            const coords = await ai.analyzeImage(img);
            
            if (coords) {
                originalImages.push({ img, coords });
            } else {
                console.warn(`AI completely missed a face in one of the uploaded images.`);
            }
        }

        await reprocessFrames();

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

    async function reprocessFrames() {
        if (originalImages.length === 0) return;
        
        // CRITICAL FIX: Grab aligner directly from the window
        const pythonAligner = window.aligner;
        if (!pythonAligner) {
            alert("Python engine is still loading or glitched. Please refresh the page.");
            return;
        }

        const outW = RATIOS[currentRatio].w;
        const outH = RATIOS[currentRatio].h;
        
        const wasPlaying = isPlaying;
        if (isPlaying) {
            isPlaying = false;
            clearTimeout(playbackTimer);
        }
        
        frames = []; 
        
        for (const item of originalImages) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = item.img.width;
            tempCanvas.height = item.img.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(item.img, 0, 0);
            const imgData = tempCtx.getImageData(0, 0, item.img.width, item.img.height);
            
            try {
                const alignedPixelsProxy = pythonAligner.align_face(
                    imgData.data, item.img.width, item.img.height,
                    item.coords.leftEye.x, item.coords.leftEye.y,
                    item.coords.rightEye.x, item.coords.rightEye.y,
                    item.coords.nose.x, item.coords.nose.y, 
                    outW, outH, currentScale 
                );
                
                const alignedArray = alignedPixelsProxy.toJs();
                const newImgData = new ImageData(new Uint8ClampedArray(alignedArray), outW, outH);
                
                const frameCanvas = document.createElement('canvas');
                frameCanvas.width = outW;
                frameCanvas.height = outH;
                frameCanvas.getContext('2d').putImageData(newImgData, 0, 0);
                
                frames.push({ canvas: frameCanvas, coords: item.coords });
                alignedPixelsProxy.destroy();

            } catch (pythonError) {
                console.error("Python alignment failed:", pythonError);
            }
        }

        if (currentFrame >= frames.length) currentFrame = 0;
        
        if (wasPlaying && frames.length > 1) {
            isPlaying = true;
            startPlayback();
        } else {
            renderCurrentFrame();
        }
    }

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
        
        if (toggleGuides && toggleGuides.checked) {
            const outW = canvas.width;
            const outH = canvas.height;
            const eyeDist = outW * currentScale; 
            const centerY = outH * 0.40;
            const centerX = outW * 0.5;
            
            ctx.strokeStyle = '#22d3ee'; 
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

    if (toggleGuides) toggleGuides.addEventListener('change', renderCurrentFrame);

    // --- 5. Export Logic ---
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
        
        const prevGuideState = toggleGuides.checked;
        toggleGuides.checked = false;
        
        frames.forEach(frame => {
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
