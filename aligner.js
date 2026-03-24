/**
 * aligner.js — Pure JavaScript Face Alignment Engine
 *
 * pipeline:
 * 1. Compute similarity transform from eye midpoint + angle + scale
 * 2. If mode is default, rotation angle is forced to 0
 * 3. Apply transform and draw the PURE original image onto the output canvas.
 */

export class FaceAligner {
    /**
     * @param {object} config
     * @param {number} config.eyeYRatio   — How far down the canvas the eyes sit (0.0–1.0)
     * @param {number} config.eyeDistRatio — Eye distance as fraction of output width
     */
    constructor(config = {}) {
        this.eyeYRatio    = config.eyeYRatio    ?? 0.38;
        this.eyeDistRatio = config.eyeDistRatio ?? 0.40;
    }

    /**
     * Align a face image.
     * @param {HTMLImageElement|HTMLCanvasElement} sourceImage
     * @param {{ leftEye: {x,y}, rightEye: {x,y} }} landmarks
     * @param {number} outW  — Output canvas width  (px)
     * @param {number} outH  — Output canvas height (px)
     * @param {string} mode  — 'smart' or 'default'
     * @returns {HTMLCanvasElement} aligned frame canvas
     */
    align(sourceImage, landmarks, outW, outH, mode = 'smart') {
        const { leftEye, rightEye } = landmarks;

        // ── 1. Compute source geometry ────────────────────────────────────────
        const eyeMidX  = (leftEye.x  + rightEye.x) / 2;
        const eyeMidY  = (leftEye.y  + rightEye.y) / 2;
        const dx       = rightEye.x  - leftEye.x;
        const dy       = rightEye.y  - leftEye.y;
        const eyeDist  = Math.sqrt(dx * dx + dy * dy);
        
        // Fix for "DEFAULT BUTTON": if mode is default, force the angle to 0
        const angle    = mode === 'smart' ? Math.atan2(dy, dx) : 0;   // tilt of the eye line

        // ── 2. Compute target geometry ────────────────────────────────────────
        const targetEyeDist = outW * this.eyeDistRatio;
        const scale         = targetEyeDist / eyeDist;
        const targetMidX    = outW * 0.5;
        const targetMidY    = outH * this.eyeYRatio;

        // ── 3. Build output canvas with similarity transform ──────────────────
        const outCanvas = document.createElement('canvas');
        outCanvas.width  = outW;
        outCanvas.height = outH;
        const ctx = outCanvas.getContext('2d');

        // Best available resampling quality for scaling/rotation
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.save();
        ctx.translate(targetMidX, targetMidY);
        ctx.rotate(-angle);
        ctx.scale(scale, scale);
        ctx.translate(-eyeMidX, -eyeMidY);
        // Solution 1 & 2: Draw the original, un-pre-cropped source image
        ctx.drawImage(sourceImage, 0, 0); 
        ctx.restore();

        return outCanvas;
    }
}
