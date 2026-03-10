import cv2
import numpy as np
from pyodide.ffi import to_js

class FaceAligner:
    def __init__(self, target_eye_dist_ratio=0.35, target_eye_y_ratio=0.4):
        """
        Initializes the aligner with layout constraints.
        target_eye_dist_ratio: The distance between eyes relative to the canvas width (e.g. 35%).
        target_eye_y_ratio: The vertical position of the eyes relative to canvas height (e.g. 40% from the top).
        """
        self.target_eye_dist_ratio = target_eye_dist_ratio
        self.target_eye_y_ratio = target_eye_y_ratio

    def align_face(self, image_data_array, img_width, img_height, lx, ly, rx, ry, out_width, out_height):
        """
        Called directly from JavaScript. Takes the raw RGBA pixel data, the exact pupil coordinates,
        and the desired output canvas size. Returns perfectly aligned raw RGBA pixels.
        """
        # 1. Convert the flat JavaScript Uint8ClampedArray into a 3D NumPy array (Height x Width x 4 Channels)
        img_np = np.asarray(image_data_array, dtype=np.uint8).reshape((img_height, img_width, 4))
        
        # 2. Define the source points (Exact pupil centers)
        src_left_eye = np.array([lx, ly])
        src_right_eye = np.array([rx, ry])
        
        # Calculate the midpoint between the eyes
        src_eye_center = (src_left_eye + src_right_eye) / 2.0
        
        # Calculate the differences in X and Y
        dy = ry - ly
        dx = rx - lx
        
        # Calculate the current distance and angle of the eyes
        src_dist = np.sqrt(dx**2 + dy**2)
        angle = np.degrees(np.arctan2(dy, dx))
        
        # 3. Calculate target parameters based on our desired layout
        target_dist = out_width * self.target_eye_dist_ratio
        scale = target_dist / src_dist
        
        target_center_x = out_width * 0.5
        target_center_y = out_height * self.target_eye_y_ratio
        
        # 4. Generate the 2x3 Affine Transformation Matrix
        # This calculates rotation around the source eye center, plus scaling
        M = cv2.getRotationMatrix2D(tuple(src_eye_center), angle, scale)
        
        # 5. Update the matrix to translate (shift) the image to the target center
        M[0, 2] += (target_center_x - src_eye_center[0])
        M[1, 2] += (target_center_y - src_eye_center[1])
        
        # 6. Perform the Warp
        # Using INTER_LANCZOS4 for studio-quality resampling (prevents jagged edges)
        # BORDER_CONSTANT with a 0-alpha value ensures the background remains strictly transparent
        aligned_img = cv2.warpAffine(
            img_np, 
            M, 
            (out_width, out_height), 
            flags=cv2.INTER_LANCZOS4, 
            borderMode=cv2.BORDER_CONSTANT, 
            borderValue=(0, 0, 0, 0) 
        )
        
        # 7. Flatten the array and return it to JavaScript
        return to_js(aligned_img.flatten())

# Instantiate globally so PyScript can easily expose it to our JavaScript frontend
aligner = FaceAligner()
