import cv2
import numpy as np
from pyodide.ffi import to_js

class FaceAligner:
    def __init__(self, target_eye_dist_ratio=0.35, target_eye_y_ratio=0.4):
        self.target_eye_dist_ratio = target_eye_dist_ratio
        self.target_eye_y_ratio = target_eye_y_ratio

    def align_face(self, image_data_array, img_w, img_h, lx, ly, rx, ry, nx, ny, out_w, out_h):
        # 1. Convert JavaScript flat array to NumPy image
        img = np.asarray(image_data_array, dtype=np.uint8).reshape((img_h, img_w, 4))
        
        # 2. Mirror pad the image (adds 50% extra pixels to all sides)
        # This prevents black edges from showing up when we heavily rotate or shift the image.
        pad = int(max(img_w, img_h) * 0.5)
        img_padded = cv2.copyMakeBorder(img, pad, pad, pad, pad, cv2.BORDER_REFLECT)
        
        # 3. Source Points (shifted to account for our new padding)
        src = np.array([
            [lx + pad, ly + pad], # Left Eye
            [rx + pad, ry + pad], # Right Eye
            [nx + pad, ny + pad]  # Nose Tip
        ], dtype=np.float32)
        
        # 4. Target Points (Where we want them permanently locked on the canvas)
        eye_y = out_h * self.target_eye_y_ratio
        eye_dist = out_w * self.target_eye_dist_ratio
        
        dst = np.array([
            [out_w/2 - eye_dist/2, eye_y],                      # Target Left Eye
            [out_w/2 + eye_dist/2, eye_y],                      # Target Right Eye
            [out_w/2, eye_y + (eye_dist * 0.5)]                 # Target Nose Tip
        ], dtype=np.float32)
        
        # 5. Calculate the Affine Transform Matrix using 3 points instead of 2
        M = cv2.getAffineTransform(src, dst)
        
        # 6. Warp the image with high-quality Lanczos4 resampling
        aligned_img = cv2.warpAffine(
            img_padded, 
            M, 
            (out_w, out_h), 
            flags=cv2.INTER_LANCZOS4, 
            borderMode=cv2.BORDER_CONSTANT, 
            borderValue=(0, 0, 0, 0)
        )
        
        return to_js(aligned_img.flatten())

aligner = FaceAligner()
