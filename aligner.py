import cv2
import numpy as np
from pyodide.ffi import to_js
from js import window # <-- CRITICAL NEW IMPORT

class FaceAligner:
    def __init__(self, target_eye_y_ratio=0.4):
        self.target_eye_y_ratio = target_eye_y_ratio

    def align_face(self, image_data_array, img_w, img_h, lx, ly, rx, ry, nx, ny, out_w, out_h, dynamic_scale):
        img = np.asarray(image_data_array, dtype=np.uint8).reshape((img_h, img_w, 4))
        
        pad = int(max(img_w, img_h) * 0.5)
        img_padded = cv2.copyMakeBorder(img, pad, pad, pad, pad, cv2.BORDER_REFLECT)
        
        src = np.array([
            [lx + pad, ly + pad],
            [rx + pad, ry + pad],
            [nx + pad, ny + pad]
        ], dtype=np.float32)
        
        eye_y = out_h * self.target_eye_y_ratio
        eye_dist = out_w * dynamic_scale
        
        dst = np.array([
            [out_w/2 - eye_dist/2, eye_y],                      
            [out_w/2 + eye_dist/2, eye_y],                      
            [out_w/2, eye_y + (eye_dist * 0.5)]                 
        ], dtype=np.float32)
        
        M = cv2.getAffineTransform(src, dst)
        
        aligned_img = cv2.warpAffine(
            img_padded, 
            M, 
            (out_w, out_h), 
            flags=cv2.INTER_LANCZOS4, 
            borderMode=cv2.BORDER_CONSTANT, 
            borderValue=(0, 0, 0, 0)
        )
        
        return to_js(aligned_img.flatten())

# Push the aligner directly to the JavaScript window object!
window.aligner = FaceAligner()
