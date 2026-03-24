/**
 * aligner.js — Pure JavaScript Face Alignment Engine
 *
 * Uses a SIMILARITY TRANSFORM (rotation + uniform scale + translation).
 * This is superior to affine because it NEVER distorts the face — it only
 * rotates, scales, and moves it. Faces always look natural.
 *
 * Pipeline per image:
 *   1. Mirror-pad the source image (9-tile reflection) → no black edges
 *   2. Compute similarity transform from eye midpoint + angle + scale
 *   3. Apply via Canvas 2D transform (GPU-accelerated, high-quality bicubic)
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
     * @returns {HTMLCanvasElement} aligned frame canvas
     */
    align(sourceImage, landmarks, outW, outH) {
        const { leftEye, rightEye } = landmarks;

        // ── 1. Compute source geometry ────────────────────────────────────────
        const eyeMidX  = (leftEye.x  + rightEye.x) / 2;
        const eyeMidY  = (leftEye.y  + rightEye.y) / 2;
        const dx       = rightEye.x  - leftEye.x;
        const dy       = rightEye.y  - leftEye.y;
        const eyeDist  = Math.sqrt(dx * dx + dy * dy);
        const angle    = Math.atan2(dy, dx);   // tilt of the eye line

        // ── 2. Compute target geometry ────────────────────────────────────────
        const targetEyeDist = outW * this.eyeDistRatio;
        const scale         = targetEyeDist / eyeDist;
        const targetMidX    = outW * 0.5;
        const targetMidY    = outH * this.eyeYRatio;

        // ── 3. Mirror-pad the source (prevents black edges on heavy crops) ────
        const srcW   = sourceImage.naturalWidth  || sourceImage.width;
        const srcH   = sourceImage.naturalHeight || sourceImage.height;
        const padded = this._mirrorPad(sourceImage, srcW, srcH);

        // ── 4. Build output canvas with similarity transform ──────────────────
        const outCanvas = document.createElement('canvas');
        outCanvas.width  = outW;
        outCanvas.height = outH;
        const ctx = outCanvas.getContext('2d');

        // Best available resampling quality
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Transform sequence (read bottom-to-top as math operations):
        //   a) Move origin to target eye midpoint
        //   b) Undo the face tilt (rotate by -angle)
        //   c) Scale uniformly
        //   d) Shift source so padded-eye-midpoint is at origin
        ctx.save();
        ctx.translate(targetMidX, targetMidY);
        ctx.rotate(-angle);
        ctx.scale(scale, scale);
        ctx.translate(-(eyeMidX + padded.px), -(eyeMidY + padded.py));
        ctx.drawImage(padded.canvas, 0, 0);
        ctx.restore();

        return outCanvas;
    }

    /**
     * Create a 9-tile mirror-padded canvas.
     * Each surrounding tile is a reflection of the original, eliminating
     * the black bars that appear when the face is near an image edge.
     *
     * Layout (each cell = one mirror-reflected tile):
     *   ↕flip+↔flip  |  ↕flip  |  ↕flip+↔flip
     *   ↔flip         |  center |  ↔flip
     *   ↕flip+↔flip  |  ↕flip  |  ↕flip+↔flip
     */
    _mirrorPad(img, sw, sh) {
        const px = Math.round(Math.max(sw, sh) * 0.55);
        const py = px;
        const pw = sw + px * 2;
        const ph = sh + py * 2;

        const c   = document.createElement('canvas');
        c.width   = pw;
        c.height  = ph;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        for (let row = -1; row <= 1; row++) {
            for (let col = -1; col <= 1; col++) {
                const fx = (Math.abs(col) === 1);  // flip horizontally?
                const fy = (Math.abs(row) === 1);  // flip vertically?
                const tx = px + col * sw;
                const ty = py + row * sh;

                ctx.save();
                // When flipping, we translate an extra sw/sh so the image
                // doesn't draw off-canvas after the scale(-1) inversion.
                ctx.translate(tx + (fx ? sw : 0), ty + (fy ? sh : 0));
                ctx.scale(fx ? -1 : 1, fy ? -1 : 1);
                ctx.drawImage(img, 0, 0);
                ctx.restore();
            }
        }

        return { canvas: c, px, py };
    }
}
