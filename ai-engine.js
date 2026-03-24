import {
    FaceLandmarker,
    FilesetResolver
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32';

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
            // UPDATED WASM URL
            const vision = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm'
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
                 // UPDATED WASM URL FOR FALLBACK
                 const vision = await FilesetResolver.forVisionTasks(
                     'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm'
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

    // ... Keep the rest of your ai-engine.js methods exactly the same ...
    async analyzeImage(img) { /* ... */ }
    _runDetection(imgEl) { /* ... */ }
    _runDetectionRaw(imgEl) { /* ... */ }
    _remapToOriginal(lm, refImg) { /* ... */ }
    _avgCluster(lm, indices, w, h) { /* ... */ }
    _applyFilter(img, filter) { /* ... */ }
    _scaleDown(img, maxSide) { /* ... */ }
}
