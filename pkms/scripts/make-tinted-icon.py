"""Builds the tinted/clear app icon: a grayscale pyramid on black, which iOS recolors to the user's tint."""
import sys
import numpy as np
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
img = np.asarray(Image.open(src).convert("RGB")).astype(np.float32) / 255
lum = img @ np.array([0.299, 0.587, 0.114], dtype=np.float32)

alpha = np.clip((0.78 - lum) / (0.78 - 0.5), 0, 1)
# Navy faces are dark; stretch them so the light/shadow sides stay distinct once tinted.
gray = np.clip((lum / 0.32) ** 0.7 * 0.8 + 0.1, 0, 1)
out = gray * alpha
Image.fromarray((np.stack([out] * 3, -1) * 255).astype(np.uint8)).save(dst)
