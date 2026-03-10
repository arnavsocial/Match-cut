import { FaceLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/vision_bundle.js';

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
            // CRITICAL FIX: delegate is set to 'CPU' to prevent silent hardware crashes
            this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                    delegate: 'CPU' 
                },
                runningMode: 'IMAGE',
                numFaces: 1,
                // Lowered thresholds slightly to ensure we don't miss faces in dynamic lighting
                minDetectionConfidence: 0.1,
                minFacePresenceConfidence: 0.1,
                minTrackingConfidence: 0.1
            });

            this.isReady = true;
            console.log("Vision Engine loaded successfully.");
            return true;

        } catch (error) {
            console.error("AI Init Error:", error);
            throw new Error("Failed to load FaceLandmarker. Check your network connection or browser extensions blocking WASM.");
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
            console.warn("Scan missed the face. The face might be too obscured, blurry, or turned away.");
            return null;
        }

        const lm = results.faceLandmarks[0];
        
        // Ensure we scale the normalized coordinates [0.0 - 1.0] to actual image pixels
        const width = imageElement.naturalWidth || imageElement.width;
        const height = imageElement.naturalHeight || imageElement.height;
        
        // 4. Return the 3 exact anchor points required for our Procrustes/Affine alignment
        return {
            leftEye: { x: lm[468].x * width, y: lm[468].y * height }, // Exact center of left pupil
            rightEye: { x: lm[473].x * width, y: lm[473].y * height }, // Exact center of right pupil
            nose: { x: lm[1].x * width, y: lm[1].y * height }          // Exact tip of the nose
        };
    }
}import { FaceLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/vision_bundle.js';

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
            // CRITICAL FIX: delegate is set to 'CPU' to prevent silent hardware crashes
            this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                    delegate: 'CPU' 
                },
                runningMode: 'IMAGE',
                numFaces: 1,
                // Lowered thresholds slightly to ensure we don't miss faces in dynamic lighting
                minDetectionConfidence: 0.1,
                minFacePresenceConfidence: 0.1,
                minTrackingConfidence: 0.1
            });

            this.isReady = true;
            console.log("Vision Engine loaded successfully.");
            return true;

        } catch (error) {
            console.error("AI Init Error:", error);
            throw new Error("Failed to load FaceLandmarker. Check your network connection or browser extensions blocking WASM.");
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
            console.warn("Scan missed the face. The face might be too obscured, blurry, or turned away.");
            return null;
        }

        const lm = results.faceLandmarks[0];
        
        // Ensure we scale the normalized coordinates [0.0 - 1.0] to actual image pixels
        const width = imageElement.naturalWidth || imageElement.width;
        const height = imageElement.naturalHeight || imageElement.height;
        
        // 4. Return the 3 exact anchor points required for our Procrustes/Affine alignment
        return {
            leftEye: { x: lm[468].x * width, y: lm[468].y * height }, // Exact center of left pupil
            rightEye: { x: lm[473].x * width, y: lm[473].y * height }, // Exact center of right pupil
            nose: { x: lm[1].x * width, y: lm[1].y * height }          // Exact tip of the nose
        };
    }
}
