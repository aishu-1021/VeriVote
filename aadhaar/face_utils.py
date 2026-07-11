"""
face_utils.py — Face verification using InsightFace (ArcFace + ONNX).
No TensorFlow required. Works on Python 3.13 Windows.

Install: pip install insightface onnxruntime
"""
import base64
import numpy as np
import cv2

# ── InsightFace app singleton ─────────────────────────────────────────────────
_face_app = None

def _get_app():
    global _face_app
    if _face_app is None:
        from insightface.app import FaceAnalysis
        _face_app = FaceAnalysis(
            name='buffalo_sc',
            providers=['CPUExecutionProvider']
        )
        _face_app.prepare(ctx_id=0, det_size=(320, 320))
        print("[face_utils] InsightFace loaded ✅")
    return _face_app


# ── Image helpers ─────────────────────────────────────────────────────────────

def decode_b64_image(b64_string: str):
    try:
        if ',' in b64_string:
            b64_string = b64_string.split(',')[1]
        arr = np.frombuffer(base64.b64decode(b64_string), np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        print(f"[face_utils] Webcam decoded: {img.shape if img is not None else 'None'}")
        return img
    except Exception as e:
        print(f"[face_utils] decode error: {e}")
        return None


def load_image_from_path(path: str):
    try:
        img = cv2.imread(path)
        print(f"[face_utils] Aadhaar loaded: {img.shape if img is not None else 'None'}")
        return img
    except Exception as e:
        print(f"[face_utils] load error: {e}")
        return None


# ── Face embedding ────────────────────────────────────────────────────────────

def _get_embedding(img: np.ndarray):
    """Extract ArcFace embedding from image. Returns None if no face found."""
    try:
        app   = _get_app()
        # InsightFace expects BGR (OpenCV default) — no conversion needed
        faces = app.get(img)
        if not faces:
            print("[face_utils] No face detected in image")
            return None
        # Take the largest detected face
        largest = max(faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))
        print(f"[face_utils] Face detected, embedding shape: {largest.embedding.shape}")
        return largest.embedding
    except Exception as e:
        print(f"[face_utils] embedding error: {e}")
        return None


# ── Fallback: basic OpenCV comparison ─────────────────────────────────────────

def _basic_compare(img1: np.ndarray, img2: np.ndarray, threshold: float = 0.70):
    """Used when no face is detected — compares resized full images."""
    try:
        size = (128, 128)
        g1   = cv2.cvtColor(cv2.resize(img1, size), cv2.COLOR_BGR2GRAY).astype(np.float32)
        g2   = cv2.cvtColor(cv2.resize(img2, size), cv2.COLOR_BGR2GRAY).astype(np.float32)
        ssim = 1.0 - (np.mean(np.abs(g1 - g2)) / 255.0)
        h1   = cv2.calcHist([g1.astype(np.uint8)], [0], None, [256], [0, 256])
        h2   = cv2.calcHist([g2.astype(np.uint8)], [0], None, [256], [0, 256])
        cv2.normalize(h1, h1); cv2.normalize(h2, h2)
        hist = max(0.0, float(cv2.compareHist(h1, h2, cv2.HISTCMP_CORREL)))
        score    = (ssim * 0.6) + (hist * 0.4)
        is_match = score >= threshold
        print(f"[face_utils] Basic fallback: ssim={ssim:.3f} hist={hist:.3f} score={score:.3f} match={is_match}")
        return is_match, round(score, 4)
    except Exception as e:
        print(f"[face_utils] basic compare error: {e}")
        return False, 0.0


# ── Public API ────────────────────────────────────────────────────────────────

def compare_faces(img1: np.ndarray, img2: np.ndarray, threshold: float = 0.35):
    """
    Compare two face images using ArcFace embeddings (cosine similarity).
    Threshold 0.35 = same person (ArcFace typical range: 0.3-0.5).
    Falls back to basic pixel comparison if no face detected.
    """
    if img1 is None or img2 is None:
        return False, 0.0

    try:
        emb1 = _get_embedding(img1)
        emb2 = _get_embedding(img2)

        if emb1 is not None and emb2 is not None:
            # Cosine similarity
            sim  = float(np.dot(emb1, emb2) / (np.linalg.norm(emb1) * np.linalg.norm(emb2)))
            score = round((sim + 1) / 2, 4)  # normalize -1..1 → 0..1
            is_match = sim >= threshold
            print(f"[face_utils] ArcFace cosine similarity: {sim:.4f} match: {is_match}")
            return is_match, score

        print("[face_utils] Could not get embeddings — using basic fallback")
        return _basic_compare(img1, img2)

    except Exception as e:
        print(f"[face_utils] compare_faces error: {e}")
        return _basic_compare(img1, img2)


def check_duplicate_face_in_voters(new_img: np.ndarray, threshold: float = 0.35):
    """Check if face already exists in voter database."""
    if new_img is None:
        return False, None
    try:
        from voters.models import Voter
        for voter in Voter.objects.exclude(passport_photo='').exclude(passport_photo=None):
            try:
                existing = load_image_from_path(voter.passport_photo.path)
                if existing is None:
                    continue
                is_match, score = compare_faces(new_img, existing, threshold)
                if is_match:
                    print(f"[face_utils] Duplicate: {voter.voter_id} score={score}")
                    return True, voter.voter_id
            except Exception as e:
                print(f"[face_utils] voter {voter.voter_id} check error: {e}")
        return False, None
    except Exception as e:
        print(f"[face_utils] duplicate check error: {e}")
        return False, None