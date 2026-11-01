"""Builds the dark-mode app icon from the light one: the pyramid is lifted onto a dark background."""
import sys
import numpy as np
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
img = np.asarray(Image.open(src).convert("RGB")).astype(np.float32) / 255
lum = img @ np.array([0.299, 0.587, 0.114], dtype=np.float32)

# Everything darker than the white backdrop and its pale shadow is the pyramid.
alpha = np.clip((0.78 - lum) / (0.78 - 0.5), 0, 1)
lifted = np.clip(img ** 0.55 * 1.08, 0, 1)

h, w, _ = img.shape
t = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
bg = (1 - t) * np.array([0.16, 0.18, 0.28], np.float32) + t * np.array([0.05, 0.06, 0.11], np.float32)
bg = np.broadcast_to(bg, (h, w, 3))

out = bg * (1 - alpha[..., None]) + lifted * alpha[..., None]
Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)).save(dst)
