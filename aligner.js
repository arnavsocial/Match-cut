export class FaceAligner {
    constructor(config = {}) {
        this.eyeYRatio    = config.eyeYRatio    ?? 0.38;
        this.eyeDistRatio = config.eyeDistRatio ?? 0.40;
    }

    align(sourceImage, landmarks, outW, outH, mode = 'smart') {
        const { leftEye, rightEye } = landmarks;

        const eyeMidX  = (leftEye.x  + rightEye.x) / 2;
        const eyeMidY  = (leftEye.y  + rightEye.y) / 2;
        const dx       = rightEye.x  - leftEye.x;
        const dy       = rightEye.y  - leftEye.y;
        const eyeDist  = Math.sqrt(dx * dx + dy * dy);
        
        // Smart mode perfectly levels the face. Default mode leaves it upright.
        const angle    = mode === 'smart' ? Math.atan2(dy, dx) : 0;   

        const targetEyeDist = outW * this.eyeDistRatio;
        const scale         = targetEyeDist / eyeDist;
        const targetMidX    = outW * 0.5;
        const targetMidY    = outH * this.eyeYRatio;

        const outCanvas = document.createElement('canvas');
        outCanvas.width  = outW;
        outCanvas.height = outH;
        const ctx = outCanvas.getContext('2d');

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.save();
        ctx.translate(targetMidX, targetMidY);
        ctx.rotate(-angle);
        ctx.scale(scale, scale);
        ctx.translate(-eyeMidX, -eyeMidY);
        ctx.drawImage(sourceImage, 0, 0); // Draws the pure, uncropped original image
        ctx.restore();

        return outCanvas;
    }
}
