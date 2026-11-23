"""
Build the scan-style head: a point cloud of Gabriel from a frontal selfie, in
the manner of a depth-camera capture. Dots fall where the photo is bright, so
skin and light fabric fill in and hair, frames and the dark shirt stay sparse.

Depth: a rounded volume from the silhouette (distance to its edge), with the
face's own relief from MediaPipe landmarks laid on top. Each point carries how
much it follows the head's turn: 1 on the head, 0 on the shoulders.

  python3 scan.py photo-cut.png landmarks.npy   # writes head.bin (HPTS)
"""
import numpy as np, cv2, sys, struct
from PIL import Image
from scipy import ndimage as ndi
from scipy.interpolate import griddata

cut_path, lm_path = sys.argv[1], sys.argv[2]
N = int(sys.argv[3]) if len(sys.argv) > 3 else 16000
cut = np.array(Image.open(cut_path).convert('RGBA')).astype(np.float32) / 255
lm = np.load(lm_path)
FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152,
             148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]

H0, W0 = cut.shape[:2]
y0 = int(max(0, np.argmax(cut[..., 3].max(1) > 0.5) - 20))
c = cut[y0:, :]; lm = lm.copy(); lm[:, 1] -= y0
S = 0.5  # work at half size
c = cv2.resize(c, None, fx=S, fy=S, interpolation=cv2.INTER_AREA); lm *= S
h, w = c.shape[:2]
rgb, a = c[..., :3], np.clip((c[..., 3] - 0.2) / 0.6, 0, 1)
inside = a > 0.5

# Density from brightness, with local contrast so features read.
lum = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
lo, hi = np.percentile(lum[inside], [2, 99.5])
ln = np.clip((lum - lo) / (hi - lo), 0, 1)
cl = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply((ln * 255).astype(np.uint8)).astype(np.float32) / 255
L = 0.65 * ln + 0.35 * cl
dens = (0.03 + L ** 1.5) * a
yy = np.arange(h)[:, None] / h
dens *= np.clip((1 - yy) / 0.12, 0, 1) ** 1.3          # fade at the bottom edge

# Depth (pixels): rounded silhouette plus the face's relief.
dt = ndi.distance_transform_edt(inside)
R0 = 0.28 * w
base = np.sqrt(np.clip(2 * R0 * np.minimum(dt, R0) - np.minimum(dt, R0) ** 2, 0, None))
oval = lm[FACE_OVAL]
zref = oval[:, 2].mean()
gy, gx = np.mgrid[0:h, 0:w]
rel = griddata(lm[:, :2], zref - lm[:, 2], (gx, gy), method='linear')
hull = np.isfinite(rel)
rel = np.where(hull, np.clip(rel, 0, None), 0)
feather = np.clip(ndi.distance_transform_edt(hull) / (0.16 * w), 0, 1) ** 1.5
faceZ = ndi.gaussian_filter(rel * feather, 3.0)
# The face sits proud of the skull volume, by about the oval's own depth.
depth = base + faceZ * 1.0

# Which points turn with the head: everything above the chin line, fading out
# across the neck.
chin_y = lm[152, 1]
turn = np.clip((chin_y + 0.08 * h - gy) / (0.08 * h), 0, 1)

rng = np.random.default_rng(7)
p = dens.ravel() / dens.sum()
idx = rng.choice(dens.size, N, p=p)
py, px = np.divmod(idx, w)
fx, fy = px + rng.random(N), py + rng.random(N)
zs = ndi.map_coordinates(depth, [fy - 0.5, fx - 0.5], order=1) + rng.normal(0, 0.6, N)
tw = ndi.map_coordinates(turn, [fy - 0.5, fx - 0.5], order=1)

# Normalise: unit height, centred on the face horizontally, middle of the
# frame vertically, the face front near z = 0.
cx = lm[FACE_OVAL, 0].mean()
X = (fx - cx) / h; Y = (h / 2 - fy) / h
Z = (zs - np.percentile(zs[tw > 0.5], 97)) / h
pivot = np.array([0.0, (h / 2 - chin_y) / h + 0.02, Z[tw > 0.5].mean() - 0.04])
print('points', N, 'x', X.min().round(3), X.max().round(3), 'z', Z.min().round(3), Z.max().round(3), 'pivot', pivot.round(3))

q = np.round(np.c_[X, Y, Z] * 30000).astype(np.int16)
buf = struct.pack('<4sII', b'HPTS', N, 0) + struct.pack('<3f', *pivot) + q.tobytes() + np.round(tw * 255).astype(np.uint8).tobytes()
open('head.bin', 'wb').write(buf)
print(len(buf), 'bytes')
np.savez('scan.npz', X=X, Y=Y, Z=Z, tw=tw, pivot=pivot)
