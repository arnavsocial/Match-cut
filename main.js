/**
 * main.js — Match Cut Orchestrator
 *
 * Coordinates the AI detection engine, JavaScript face aligner,
 * playback, and export pipelines.
 */

import { AIEngine }    from './ai-engine.js';
import { FaceAligner } from './aligner.js';

document.addEventListener('DOMContentLoaded', async () => {

    // ── UI References ─────────────────────────────────────────────────────
    const dropZone      = document.getElementById('drop-zone');
    const fileInput     = document.getElementById('file-input');
    const canvasContainer= document.getElementById('canvas-container'); 
    const canvas        = document.getElementById('preview-canvas');
    const ctx           = canvas.getContext('2d');
    
    const btnPlayPause  = document.getElementById('btn-play-pause');
    const iconPlay      = document.getElementById('icon-play');
    const iconPause     = document.getElementById('icon-pause');
    
    // Fix for "DEFAULT BUTTON": We need smart/default button references
    const modeSmart      = document.getElementById('mode-smart');
    const modeDefault    = document.getElementById('mode-default');
    
    const sliderSpeed   = document.getElementById('slider-speed');
    const speedLabel    = document.getElementById('speed-label');
    const sliderZoom    = document.getElementById('slider-zoom'); 
    const zoomLabel     = document.getElementById('zoom-label');  
    
    const frameCounter  = document.getElementById('frame-counter');
    const btnExport     = document.getElementById('btn-export');
    const exportText    = document.getElementById('export-text');
    const ratioSelect   = document.getElementById('ratio-select');
    const toggleGuides  = document.getElementById('toggle-guides');
    const aiStatusText  = document.getElementById('ai-status-text');
    const aiStatusDot   = document.getElementById('ai-status-dot');
    const progressBar   = document.getElementById('progress-bar');
    const progressWrap  = document.getElementById('progress-wrap');
    const progressLabel = document.getElementById('progress-label');
    const fmtGif        = document.getElementById('fmt-gif');
    const fmtMp4        = document.getElementById('fmt-mp4');
    const uploadCount   = document.getElementById('upload-count');
    const btnClear      = document.getElementById('btn-clear');

    // ── App State ─────────────────────────────────────────────────────────
    const RATIOS = {
        '1:1':  { w: 1024, h: 1024 },
        '9:16': { w: 1080, h: 1920 },
        '16:9': { w: 1920, h: 1080 },
    };

    const BASE_DELAY_MS = 200; 

    // Raw source images + their detected landmarks, stored so we can
    // re-align any time the output ratio changes — without re-running AI.
    let sourceImages = [];   // [{ img, landmarks }]
    let frames       = [];   // [{ canvas }] — aligned output frames
    let isPlaying    = true;
    let currentFrame = 0;
    
    // UI State
    let currentAlignMode       = 'smart'; // Can be 'smart' or 'default'
    let currentSpeedMultiplier = parseFloat(sliderSpeed.value);
    let currentZoom            = parseFloat(sliderZoom.value);
    let currentRatio           = '1:1';
    let playbackTimer          = null;
    let exportFormat           = 'gif';

    // ── Engines ───────────────────────────────────────────────────────────
    const ai      = new AIEngine();
    const aligner = new FaceAligner({ eyeYRatio: 0.38, eyeDistRatio: 0.40 });

    // ── 1. Initialise AI ──────────────────────────────────────────────────
    try {
        await ai.initialize((msg) => {
            aiStatusText.textContent = msg.toUpperCase();
        });
        setAIStatus('ready');
    } catch (e) {
        setAIStatus('error');
        console.error(e);
    }

    function setAIStatus(state) {
        const badge = aiStatusDot.parentElement;
        badge.classList.remove('bg-gray-200','bg-green-100','bg-red-100','text-gray-500','text-green-600','text-red-600');
        aiStatusDot.classList.remove('bg-gray-400','bg-green-500','bg-red-500');
        if (state === 'ready') {
            badge.classList.add('bg-green-100','text-green-600');
            aiStatusDot.classList.add('bg-green-500');
            aiStatusText.textContent = 'AI READY';
        } else if (state === 'loading') {
            badge.classList.add('bg-gray-200','text-gray-500');
            aiStatusDot.classList.add('bg-gray-400');
        } else {
            badge.classList.add('bg-red-100','text-red-600');
            aiStatusDot.classList.add('bg-red-500');
            aiStatusText.textContent = 'AI FAILED';
        }
    }

    // ── 2. Canvas Size ────────────────────────────────────────────────────
    function updateCanvasSize() {
        const d = RATIOS[currentRatio];
        canvas.width  = d.w;
        canvas.height = d.h;
        // Fix for Ratio Cropping: We now update the DOM container attribute
        canvasContainer.setAttribute('data-ratio', currentRatio);
    }

    // Solution 3 & 4: Create a centralized function for realignment
    function realignAllFrames() {
        if (sourceImages.length === 0) return;
        
        const wasPlaying = isPlaying;
        if (wasPlaying) stopPlayback();
        
        showProgress('Re-aligning…', 0);
        frames = [];
        const { w, h } = RATIOS[currentRatio];
        
        for (let i = 0; i < sourceImages.length; i++) {
            const { img, landmarks } = sourceImages[i];
            const fc = aligner.align(img, landmarks, w, h, currentAlignMode);
            frames.push({ canvas: fc });
            setProgress((i + 1) / sourceImages.length);
        }
        
        hideProgress();
        currentFrame = 0;
        renderCurrentFrame();
        
        if (wasPlaying) startPlayback();
    }

    ratioSelect.addEventListener('change', (e) => {
        currentRatio = e.target.value;
        updateCanvasSize();
        realignAllFrames();
    });

    updateCanvasSize();
    renderCurrentFrame();

    // ── 3. File Upload Handling ───────────────────────────────────────────
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });
    
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    async function handleFiles(fileList) {
        if (!ai.isReady) {
            return alert('Please wait for the AI model to finish loading.');
        }
        const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
        if (!files.length) return;

        stopPlayback();
        const { w, h } = RATIOS[currentRatio];
        let processed = 0, skipped = 0;

        showProgress('Scanning faces…', 0);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            
            // Fix for Solution 4: Add explicit loading bar message
            setProgressLabel(`Processing ${file.name}...`);
            await sleep(10); // Give browser a tiny chance to render the message

            setProgressLabel(`Scanning face ${i + 1}/${files.length}...`);

            try {
                const img       = await loadImage(file);
                const landmarks = await ai.analyzeImage(img);

                if (landmarks) {
                    const fc = aligner.align(img, landmarks, w, h, currentAlignMode);
                    frames.push({ canvas: fc });
                    sourceImages.push({ img, landmarks });
                    processed++;
                } else {
                    skipped++;
                    console.warn(`[Main] No face detected: ${file.name}`);
                }
            } catch (err) {
                skipped++;
                console.error(`[Main] Error on ${file.name}:`, err);
            }

            setProgress((i + 1) / files.length);
        }

        hideProgress();

        uploadCount.textContent = `${frames.length} Loaded${skipped > 0 ? ` · ${skipped} skipped` : ''}`;
        uploadCount.classList.remove('hidden');

        if (processed > 0) {
            btnExport.disabled = false;
            btnClear.classList.remove('hidden');
            if (frames.length > 1) {
                isPlaying = true;
                iconPlay.classList.add('hidden');
                iconPause.classList.remove('hidden');
                startPlayback();
            } else {
                renderCurrentFrame();
            }
        }
    }

    function loadImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img  = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src    = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // ── 4. Playback ───────────────────────────────────────────────────────
    function startPlayback() {
        if (playbackTimer) clearTimeout(playbackTimer);
        if (!isPlaying || frames.length === 0) return;
        renderCurrentFrame();
        currentFrame = (currentFrame + 1) % frames.length;
        
        // Convert Frames-Per-Second into Milliseconds-Per-Frame
        const dynamicDelay = BASE_DELAY_MS / currentSpeedMultiplier;
        playbackTimer = setTimeout(startPlayback, dynamicDelay);
    }

    function stopPlayback() {
        clearTimeout(playbackTimer);
        playbackTimer = null;
    }

    // SOLUTION for 1 & 2: Master drawing function that applies zoom perfectly from the center.
    // We now draw onto a clean slate so there's no transparent ghosting.
    function drawFrame(index) {
        const frame = frames[index];
        
        // Fill background to prevent transparent ghosting when zoomed out
        ctx.fillStyle = '#111111'; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.save();
        // Zoom relative to the exact center of the canvas
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(currentZoom, currentZoom);
        ctx.translate(-canvas.width / 2, -canvas.height / 2);
        
        // Use high quality image smoothing for the zoom
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(frame.canvas, 0, 0);
        ctx.restore();
    }

    function renderCurrentFrame() {
        if (frames.length === 0) {
            ctx.fillStyle = '#121212';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            frameCounter.textContent = '0 / 0';
            return;
        }
        
        drawFrame(currentFrame);
        if (toggleGuides.checked) drawGuides();
        frameCounter.textContent = `${currentFrame + 1} / ${frames.length}`;
    }

    function drawGuides() {
        const W       = canvas.width;
        const H       = canvas.height;
        const eyeDist = W * 0.40;
        const cx      = W / 2;
        const cy      = H * 0.38;
        const r       = 18;

        ctx.save();
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth   = Math.max(2, W / 512);
        ctx.globalAlpha = 0.65;

        ctx.beginPath();
        ctx.arc(cx - eyeDist / 2, cy, r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx + eyeDist / 2, cy, r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalAlpha = 0.25;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(W, cy);
        ctx.stroke();

        ctx.restore();
    }

    // ── 5. UI Controls ────────────────────────────────────────────────────
    btnPlayPause.addEventListener('click', () => {
        isPlaying = !isPlaying;
        iconPlay.classList.toggle('hidden',  isPlaying);
        iconPause.classList.toggle('hidden', !isPlaying);
        if (isPlaying) startPlayback();
        else stopPlayback();
    });

    // Fix for "DEFAULT BUTTON": We need the mode button logic
    modeSmart.addEventListener('click', () => {
        if (currentAlignMode === 'smart') return;
        currentAlignMode = 'smart';
        modeSmart.classList.add('bg-gray-100','text-black','shadow-inner');
        modeSmart.classList.remove('text-gray-400');
        modeDefault.classList.remove('bg-gray-100','text-black','shadow-inner');
        modeDefault.classList.add('text-gray-400');
        realignAllFrames();
    });

    modeDefault.addEventListener('click', () => {
        if (currentAlignMode === 'default') return;
        currentAlignMode = 'default';
        modeDefault.classList.add('bg-gray-100','text-black','shadow-inner');
        modeDefault.classList.remove('text-gray-400');
        modeSmart.classList.remove('bg-gray-100','text-black','shadow-inner');
        modeSmart.classList.add('text-gray-400');
        realignAllFrames();
    });

    // FIX for Slider Speed being decimal multipliers
    sliderSpeed.addEventListener('input', (e) => {
        currentSpeedMultiplier = parseFloat(e.target.value);
        speedLabel.textContent = currentSpeedMultiplier.toFixed(1) + 'x';
        if (isPlaying) { stopPlayback(); startPlayback(); }
    });

    // FIX for Zoom logic
    sliderZoom.addEventListener('input', (e) => {
        currentZoom = parseFloat(e.target.value);
        zoomLabel.textContent = currentZoom.toFixed(2) + 'x';
        // Immediately redraw canvas so user sees the zoom happening in real-time, even when paused
        if (!isPlaying) renderCurrentFrame(); 
    });

    toggleGuides.addEventListener('change', renderCurrentFrame);

    fmtGif.addEventListener('click', () => {
        exportFormat = 'gif';
        fmtGif.classList.add('bg-gray-100','text-black','shadow-inner');
        fmtGif.classList.remove('text-gray-400');
        fmtMp4.classList.remove('bg-gray-100','text-black','shadow-inner');
        fmtMp4.classList.add('text-gray-400');
        exportText.textContent = 'Export Video';
    });

    fmtMp4.addEventListener('click', () => {
        exportFormat = 'mp4';
        fmtMp4.classList.add('bg-gray-100','text-black','shadow-inner');
        fmtMp4.classList.remove('text-gray-400');
        fmtGif.classList.remove('bg-gray-100','text-black','shadow-inner');
        fmtGif.classList.add('text-gray-400');
        exportText.textContent = 'Export Video';
    });

    btnClear.addEventListener('click', () => {
        stopPlayback();
        frames       = [];
        sourceImages = [];
        currentFrame = 0;
        btnExport.disabled = true;
        uploadCount.classList.add('hidden');
        btnClear.classList.add('hidden');
        updateCanvasSize();
        renderCurrentFrame();
    });

    // ── 6. Export ─────────────────────────────────────────────────────────
    btnExport.addEventListener('click', () => {
        if (exportFormat === 'mp4') exportMP4();
        else exportGIF();
    });

    async function exportGIF() {
        if (frames.length === 0) return;

        const wasPlaying = isPlaying;
        stopPlayback(); isPlaying = false;
        btnExport.disabled = true;
        showProgress('Encoding GIF…', 0);

        const prevGuide = toggleGuides.checked;
        toggleGuides.checked = false;

        const gif = new GIF({
            workers:      4,
            quality:      1, // FIX: highest possible quality
            width:        canvas.width,
            height:       canvas.height,
            workerScript: 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js'
        });

        const exportDelay = Math.round(BASE_DELAY_MS / currentSpeedMultiplier);

        for (let i = 0; i < frames.length; i++) {
            // Because we call drawFrame, the export perfectly inherits the user's zoom settings.
            drawFrame(i);
            gif.addFrame(ctx, { copy: true, delay: exportDelay });
            setProgress((i + 1) / frames.length * 0.5); // first 50%
        }

        gif.on('progress', p => setProgress(0.5 + p * 0.5));

        gif.on('finished', (blob) => {
            download(blob, `match-cut-${Date.now()}.gif`);
            toggleGuides.checked = prevGuide;
            hideProgress();
            btnExport.disabled = false;
            isPlaying = wasPlaying;
            if (isPlaying) startPlayback();
        });

        gif.render();
    }

    async function exportMP4() {
        if (frames.length === 0) return;

        if (!window.MediaRecorder) {
            return alert('MP4 export requires MediaRecorder API (Chrome/Edge/Firefox).');
        }

        const wasPlaying = isPlaying;
        stopPlayback(); isPlaying = false;
        btnExport.disabled = true;
        showProgress('Recording…', 0);

        const prevGuide = toggleGuides.checked;
        toggleGuides.checked = false;

        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : 'video/webm';

        const stream   = canvas.captureStream(60); // 60fps for smoothness
        const recorder = new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: 50_000_000 // FIX for quality: massive bitrate
        });
        const chunks = [];

        recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: mimeType });
            download(blob, `match-cut-${Date.now()}.mp4`);
            toggleGuides.checked = prevGuide;
            hideProgress();
            btnExport.disabled = false;
            isPlaying = wasPlaying;
            if (isPlaying) startPlayback();
        };

        recorder.start();

        const LOOPS        = 3;
        const totalFrames  = frames.length * LOOPS;
        let drawn          = 0;
        const exportDelay  = BASE_DELAY_MS / currentSpeedMultiplier;

        for (let loop = 0; loop < LOOPS; loop++) {
            for (let i = 0; i < frames.length; i++) {
                drawFrame(i); // applies zoom
                drawn++;
                setProgress(drawn / totalFrames);
                await sleep(exportDelay);
            }
        }

        recorder.stop();
    }

    // ── Progress Helpers ─────────────────────────────────────────────────
    function showProgress(label, val) {
        progressWrap.classList.remove('hidden');
        setProgressLabel(label);
        setProgress(val);
    }
    function hideProgress() {
        progressWrap.classList.add('hidden');
    }
    function setProgress(frac) {
        progressBar.style.width = `${Math.round(frac * 100)}%`;
    }
    function setProgressLabel(text) {
        progressLabel.textContent = text;
    }

    // ── Misc Helpers ─────────────────────────────────────────────────────
    function download(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href     = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }
});
