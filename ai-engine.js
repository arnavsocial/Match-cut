import { FaceLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/vision_bundle.mjs';

export class AIEngine {
    constructor() {
        this.faceLandmarker = null;
        this.isReady = false;
    }

    async initialize() {
        console.log("Initializing Vision Engine...");
        try {
            // 1. Load the WebAssembly backend
            const vision = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm'
            );

            // 2. Initialize the Face Landmarker
            this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                    delegate: 'CPU' 
                },
                runningMode: 'IMAGE',
                numFaces: 1,
                minDetectionConfidence: 0.1,
                minFacePresenceConfidence: 0.1,
                minTrackingConfidence: 0.1
            });

            this.isReady = true;
            console.log("Vision Engine loaded successfully.");
            return true;

        } catch (error) {
            console.error("AI Init Error:", error);
            throw new Error("Failed to load FaceLandmarker.");
        }
    }

    async analyzeImage(imageElement) {
        if (!this.isReady || !this.faceLandmarker) {
            console.error("Attempted to analyze before AI was ready.");
            return null;
        }

        // 3. Run the detection on the provided image
        const results = this.faceLandmarker.detect(imageElement);

        if (!results.faceLandmarks || results.faceLandmarks.length === 0) {
            console.warn("Scan missed the face.");
            return null;
        }

        const lm = results.faceLandmarks[0];
        
        const width = imageElement.naturalWidth || imageElement.width;
        const height = imageElement.naturalHeight || imageElement.height;
        
        // 4. Return the 3 exact anchor points
        return {
            leftEye: { x: lm[468].x * width, y: lm[468].y * height }, 
            rightEye: { x: lm[473].x * width, y: lm[473].y * height }, 
            nose: { x: lm[1].x * width, y: lm[1].y * height }          
        };
    }
}
