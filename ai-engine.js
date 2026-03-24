import {
    FaceLandmarker,
    FilesetResolver
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.33/vision_bundle.mjs';

const LEFT_IRIS  = [468, 469, 470, 471, 472];
const RIGHT_IRIS = [473, 474, 475, 476, 477];
const NOSE_TIP   = 4;
const CHIN       = 152;
const FOREHEAD   = 10;

export class AIEngine {
    constructor() {
        this.landmarker = null;
        this.isReady    = false;
    }

    async initialize(onStatus) {
        onStatus?.('Checking Cache & Loading AI...');
        try {
            const vision = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.33/wasm'
            );

            this.landmarker = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                    delegate: 'GPU' 
                },
                runningMode: 'IMAGE',
                numFaces: 1,
                minDetectionConfidence:    0.3, 
                minFacePresenceConfidence: 0.3,
                minTrackingConfidence:     0.3,
                outputFaceBlendshapes: false 
            });

            this.isReady = true;
            onStatus?.('AI Ready');
            return true;
        } catch (err) {
            console.error('GPU init failed, falling back to CPU:', err);
            try {
                onStatus?.('Loading CPU Fallback...');
                 const vision = await FilesetResolver.forVisionTasks(
                     'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.33/wasm'
                 );
                 this.landmarker = await FaceLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                        delegate: 'CPU'
                    },
                    runningMode: 'IMAGE',
                    numFaces: 1
                });
                this.isReady = true;
                onStatus?.('AI Ready (CPU)');
                return true;
            } catch(cpuErr) {
                throw new Error('AI Model failed to load entirely. Please check your network connection.');
            }
        }
    }

    async analyzeImage(img) {
        if (!this.isReady) return null;

        let result = this._runDetection(img);
        if (result) return result;

        console.warn('[AI] Pass 1 missed — retrying with contrast boost…');
        const enhanced = this._applyFilter(img, 'contrast(1.4) brightness(1.1) saturate(1.2)');
        result = this._runDetection(enhanced);
        if (result) return result;

        console.warn('[AI] Pass 2 missed — retrying with downscaled version…');
        const smallImg = this._scaleDown(img, 640);
        const rawResult = this._runDetectionRaw(smallImg);
        if (rawResult) {
            return this._remapToOriginal(rawResult, img);
        }

        return null;
    }

    _runDetection(imgEl) {
        const raw = this._runDetectionRaw(imgEl);
        if (!raw) return null;
        return this._remapToOriginal(raw, imgEl);
    }

    _runDetectionRaw(imgEl) {
        try {
            const res = this.landmarker.detect(imgEl);
            if (!res?.faceLandmarks?.length) return null;
            return res.faceLandmarks[0]; 
        } catch (e) {
            console.error('[AI] Detection threw:', e);
            return null;
        }
    }

    _remapToOriginal(lm, refImg) {
        const w = refImg.naturalWidth  || refImg.width;
        const h = refImg.naturalHeight || refImg.height;

        return {
            leftEye:  this._avgCluster(lm, LEFT_IRIS,  w, h),
            rightEye: this._avgCluster(lm, RIGHT_IRIS, w, h),
            nose:     { x: lm[NOSE_TIP].x * w,  y: lm[NOSE_TIP].y  * h },
            chin:     { x: lm[CHIN].x * w,       y: lm[CHIN].y      * h },
            forehead: { x: lm[FOREHEAD].x * w,   y: lm[FOREHEAD].y  * h }
        };
    }

    _avgCluster(lm, indices, w, h) {
        let sx = 0, sy = 0;
        for (const i of indices) { sx += lm[i].x; sy += lm[i].y; }
        return { x: (sx / indices.length) * w, y: (sy / indices.length) * h };
    }

    _applyFilter(img, filter) {
        const w = img.naturalWidth  || img.width;
        const h = img.naturalHeight || img.height;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.filter = filter;
        ctx.drawImage(img, 0, 0);
        return c;
    }

    _scaleDown(img, maxSide) {
        const sw = img.naturalWidth  || img.width;
        const sh = img.naturalHeight || img.height;
        const ratio = maxSide / Math.max(sw, sh);
        if (ratio >= 1) return img; 
        const nw = Math.round(sw * ratio);
        const nh = Math.round(sh * ratio);
        const c = document.createElement('canvas');
        c.width = nw; c.height = nh;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, nw, nh);
        return c;
    }
}
