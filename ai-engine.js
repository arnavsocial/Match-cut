import { FaceLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/vision_bundle.js';

export class AIEngine {
    constructor() {
        this.faceLandmarker = null;
        this.isReady = false;
    }

    async initialize() {
        console.log("Loading Heavyweight Vision Model with Deep Scan...");
        try {
            const vision = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm'
            );

            this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                    delegate: 'GPU'
                },
                runningMode: 'IMAGE',
                numFaces: 1,
                // CRITICAL FIX: Lowering these thresholds ensures we don't skip faces 
                // that are partially shadowed, blurry, or turned slightly away.
                minDetectionConfidence: 0.1,
                minFacePresenceConfidence: 0.1,
                minTrackingConfidence: 0.1
            });

            this.isReady = true;
            return true;
        } catch (error) {
            console.error("AI Init Error:", error);
            throw new Error("Ensure your browser supports WebAssembly and WebGPU/WebGL.");
        }
    }

    async analyzeImage(imageElement) {
        if (!this.isReady || !this.faceLandmarker) return null;

        const results = this.faceLandmarker.detect(imageElement);

        if (!results.faceLandmarks || results.faceLandmarks.length === 0) {
            console.warn("Deep Scan missed the face. Image might be too extreme.");
            return null;
        }

        const lm = results.faceLandmarks[0];
        const width = imageElement.naturalWidth || imageElement.width;
        const height = imageElement.naturalHeight || imageElement.height;

        // We now extract 3 specific points to create a perfect triangle for our math
        
        return {
            leftEye: { x: lm[468].x * width, y: lm[468].y * height }, // Exact left pupil
            rightEye: { x: lm[473].x * width, y: lm[473].y * height }, // Exact right pupil
            nose: { x: lm[1].x * width, y: lm[1].y * height }          // Exact nose tip
        };
    }
}
