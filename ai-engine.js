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

            const modelConfig = {
                modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                delegate: 'GPU' // Try GPU first for maximum speed
            };

            const taskOptions = {
                runningMode: 'IMAGE',
                numFaces: 1,
                minDetectionConfidence: 0.1,
                minFacePresenceConfidence: 0.1,
                minTrackingConfidence: 0.1
            };

            try {
                // Attempt to load with GPU acceleration
                this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
                    baseOptions: modelConfig,
                    ...taskOptions
                });
            } catch (gpuError) {
                console.warn("GPU Delegate failed or is unsupported. Falling back to CPU mode...", gpuError);
                // Fallback to CPU to prevent the app from hanging forever
                modelConfig.delegate = 'CPU';
                this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
                    baseOptions: modelConfig,
                    ...taskOptions
                });
            }

            this.isReady = true;
            return true;
        } catch (error) {
            console.error("AI Init Error:", error);
            throw new Error("Ensure your browser supports WebAssembly.");
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

        // Extract 3 specific points to create a perfect triangle for our math
        return {
            leftEye: { x: lm[468].x * width, y: lm[468].y * height }, // Exact left pupil
            rightEye: { x: lm[473].x * width, y: lm[473].y * height }, // Exact right pupil
            nose: { x: lm[1].x * width, y: lm[1].y * height }          // Exact nose tip
        };
    }
}
