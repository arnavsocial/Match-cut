import {
    FaceLandmarker,
    FilesetResolver
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/vision_bundle.js';

/**
 * AIEngine: Handles the Heavyweight Face & Iris Tracking
 * Uses WebGPU to run high-fidelity models for sub-pixel accuracy.
 */
export class AIEngine {
    constructor() {
        this.faceLandmarker = null;
        this.isReady = false;
        
        // Specific MediaPipe indices for the exact center of the pupils (Iris tracking)
        this.LEFT_PUPIL_INDEX = 468;
        this.RIGHT_PUPIL_INDEX = 473;
    }

    /**
     * Initializes the High-Fidelity model with GPU delegation
     */
    async initialize() {
        console.log("Loading Heavyweight Vision Model...");
        
        try {
            // Load the WASM/WebGPU backend
            const vision = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm'
            );

            // Configure for maximum accuracy over speed
            this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    // Using the full float16 model instead of the lightweight int8
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                    delegate: 'GPU' // Force GPU acceleration for heavy models
                },
                outputFaceBlendshapes: false,
                outputFacialTransformationMatrixes: true, // Captures 3D rotation of the head
                runningMode: 'IMAGE',
                numFaces: 1
            });

            this.isReady = true;
            console.log("AI Engine Ready: WebGPU Accelerated");
            return true;

        } catch (error) {
            console.error("Failed to load Vision Model:", error);
            throw new Error("Ensure your browser supports WebAssembly and WebGPU/WebGL.");
        }
    }

    /**
     * Scans an image and extracts the exact pupil coordinates
     * @param {HTMLImageElement} imageElement 
     * @returns {Object|null} The eye coordinates and 3D face rotation data
     */
    async analyzeImage(imageElement) {
        if (!this.isReady || !this.faceLandmarker) {
            throw new Error("AI Engine is not initialized yet.");
        }

        // Run the heavy detection
        const results = this.faceLandmarker.detect(imageElement);

        if (!results.faceLandmarks || results.faceLandmarks.length === 0) {
            console.warn("No face detected in the image.");
            return null;
        }

        const landmarks = results.faceLandmarks[0];

        // Extract sub-pixel coordinates for the exact center of the pupils
        const leftPupil = landmarks[this.LEFT_PUPIL_INDEX];
        const rightPupil = landmarks[this.RIGHT_PUPIL_INDEX];

        if (!leftPupil || !rightPupil) {
            console.warn("Iris tracking failed. Image might be too blurry.");
            return null;
        }

        // Convert normalized coordinates (0.0 to 1.0) to actual image pixels
        const width = imageElement.naturalWidth || imageElement.width;
        const height = imageElement.naturalHeight || imageElement.height;

        return {
            leftEye: {
                x: leftPupil.x * width,
                y: leftPupil.y * height
            },
            rightEye: {
                x: rightPupil.x * width,
                y: rightPupil.y * height
            },
            // Include the transformation matrix to calculate head tilt later in Python
            transformMatrix: results.facialTransformationMatrixes?.[0] || null
        };
    }

    /**
     * Cleans up GPU memory
     */
    destroy() {
        if (this.faceLandmarker) {
            this.faceLandmarker.close();
            this.faceLandmarker = null;
            this.isReady = false;
        }
    }
}
