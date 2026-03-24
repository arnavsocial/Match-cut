export class FaceAligner {
    constructor(config = {}) {
        this.eyeYRatio    = config.eyeYRatio    ?? 0.38;
        this.eyeDistRatio = config.eyeDistRatio ?? 0.40;
    }

    align(sourceImage, landmarks, outW, outH) {
        const { leftEye, rightEye } = landmarks;

        const eyeMidX  = (leftEye.x  + rightEye.x) / 2;
        const eyeMidY  = (leftEye.y  + rightEye.y) / 2;
        const dx       = rightEye.x  - leftEye.x;
        const dy       = rightEye.y  - leftEye.y;
        const eyeDist  = Math.sqrt(dx * dx + dy * dy);
        const angle    = Math.atan2(dy, dx);   

        const targetEyeDist = outW * this.eyeDistRatio;
        const scale         = targetEyeDist / eyeDist;
        const targetMidX    = outW * 0.5;
        const targetMidY    = outH * this.eyeYRatio;

        const srcW   = sourceImage.naturalWidth  || sourceImage.width;
        const srcH   = sourceImage.naturalHeight || sourceImage.height;
        const padded = this._mirrorPad(sourceImage, srcW, srcH);

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
        ctx.translate(-(eyeMidX + padded.px), -(eyeMidY + padded.py));
        ctx.drawImage(padded.canvas, 0, 0);
        ctx.restore();

        return outCanvas;
    }

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
                const fx = (Math.abs(col) === 1);  
                const fy = (Math.abs(row) === 1);  
                const tx = px + col * sw;
                const ty = py + row * sh;

                ctx.save();
                ctx.translate(tx + (fx ? sw : 0), ty + (fy ? sh : 0));
                ctx.scale(fx ? -1 : 1, fy ? -1 : 1);
                ctx.drawImage(img, 0, 0);
                ctx.restore();
            }
        }

        return { canvas: c, px, py };
    }
}
