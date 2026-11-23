"""
Build the head as a point cloud of Gabriel with real anatomy, in the manner of
a depth-camera scan.

Geometry: MediaPipe's canonical face pulled onto Gabriel's own landmarks from a
frontal selfie, set in a skull, jaw, neck, ears and shoulders built from
ellipsoids and from the photo's silhouette, then meshed. Density: the photo
projected back onto that surface, so dots fall where the photo is bright
(skin, light fabric) and hair, glasses and the dark shirt stay sparse. Each
point stores how much it turns with the head: 1 above the jaw, 0 on the
shoulders.

  python3 lm.py photo.jpg cx cy size lmF.npy        # landmarks
  python3 scan3d.py photo-cut.png lmF.npy           # writes head.bin (HPTS)

canon_v.npy / canon_f.npy: mediapipe/modules/face_geometry/data/
canonical_face_model.obj (Apache 2.0).
"""
import numpy as np, cv2, sys, struct
from PIL import Image
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
from skimage.measure import marching_cubes

cut = np.array(Image.open(sys.argv[1]).convert('RGBA')).astype(np.float32) / 255
lm = np.load(sys.argv[2])
N = int(sys.argv[3]) if len(sys.argv) > 3 else 16000
C = np.load('canon_v.npy'); F = np.load('canon_f.npy')
Hp, Wp = cut.shape[:2]

# Photo landmarks (x right, y down, z away) into the canonical frame (y up,
# z toward the viewer) by a similarity transform; keep its inverse to project
# any canonical point back onto the photo.
P = np.c_[lm[:, 0], -lm[:, 1], -lm[:, 2]]
mx, my = P.mean(0), C.mean(0)
U, S, Vt = np.linalg.svd((P - mx).T @ (C - my))
D = np.diag([1, 1, np.sign(np.linalg.det(U @ Vt))]); R = U @ D @ Vt
s = (S * np.diag(D)).sum() / ((P - mx) ** 2).sum()
to_canon = lambda Z: s * (Z - mx) @ R + my
to_photo = lambda Q: (Q - my) @ R.T / s + mx          # -> (x, -y, -z) in photo
A = to_canon(P)
face = A.copy()
mir = face * [-1, 1, 1]; idx = cKDTree(C).query(C * [-1, 1, 1])[1]
face = 0.75 * face + 0.25 * mir[idx]                  # a touch of symmetry

def photo_xy(Q):
    p = to_photo(Q); return p[:, 0], -p[:, 1]

# Silhouette and brightness of the photo.
alpha = np.clip((cut[..., 3] - 0.2) / 0.6, 0, 1)
rgb = cut[..., :3]
lum = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
ins = alpha > 0.5
lo, hi = np.percentile(lum[ins], [2, 99.5])
ln = np.clip((lum - lo) / (hi - lo), 0, 1)
cl = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply((ln * 255).astype(np.uint8)).astype(np.float32) / 255
L = (0.5 * ln + 0.5 * cl) * alpha

VX = 0.2
chin = face[152]
top_c = to_canon(np.array([[lm[10, 0], -(np.argmax(alpha.max(1) > 0.5)), -lm[10, 2]]]))[0]
ys = np.arange(chin[1] - 22, top_c[1] + 2, VX)
xs = np.arange(-24, 24, VX); zs = np.arange(-17, 10, VX)
X, Y, Z = np.meshgrid(xs, ys, zs, indexing='ij')

# Face height field over x, y.
hf = np.full((len(xs), len(ys)), -np.inf)
for t in F:
    a, b, c = face[t]
    lo_ = np.floor((np.minimum(np.minimum(a, b), c)[:2] - [xs[0], ys[0]]) / VX).astype(int)
    hi_ = np.ceil((np.maximum(np.maximum(a, b), c)[:2] - [xs[0], ys[0]]) / VX).astype(int)
    gx, gy = np.meshgrid(np.arange(lo_[0], hi_[0] + 1), np.arange(lo_[1], hi_[1] + 1), indexing='ij')
    px = xs[0] + gx * VX; py = ys[0] + gy * VX
    v0, v1 = b[:2] - a[:2], c[:2] - a[:2]
    den = v0[0] * v1[1] - v1[0] * v0[1]
    if abs(den) < 1e-9: continue
    wx, wy = px - a[0], py - a[1]
    u = (wx * v1[1] - v1[0] * wy) / den; v = (v0[0] * wy - wx * v0[1]) / den
    m = (u >= -1e-6) & (v >= -1e-6) & (u + v <= 1 + 1e-6)
    np.maximum.at(hf, (gx[m], gy[m]), (a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2]))[m])
facehf = hf[:, :, None]
inface = np.isfinite(facehf)

def ell(c, r):
    return ((X - c[0]) / r[0]) ** 2 + ((Y - c[1]) / r[1]) ** 2 + ((Z - c[2]) / r[2]) ** 2 <= 1

# Head width at the temples from the photo, so the skull fits his head.
half_w = np.abs(face[[127, 356], 0]).mean()
# Skull top: about 4.5 units above the hairline landmark, a little more for
# hair; the photo's spiky hair would otherwise stretch the skull into an egg.
top = min(top_c[1], face[10, 1] + 5.6)
cy = 2.8
occ = ell((0, cy, -4.6), (half_w + 0.6, top - cy, 10.2))          # skull with hair
occ |= ell((0, -3.2, -4.4), (half_w - 0.6, 6.6, 6.6))               # jaw into skull
neck_y = chin[1] - 1.5
neck = ((X / 5.4) ** 2 + ((Z + 4.0) / 5.2) ** 2 <= 1) & (Y < 0) & (Y > neck_y - 9)
occ |= neck
for sx in (-1, 1):
    occ |= ell((sx * (half_w + 0.2), 0.3, -4.6), (1.1, 3.0, 1.8))    # ears

# Shoulders: the photo's silhouette below the neck, given a rounded front.
GX, GY = np.meshgrid(xs, ys, indexing='ij')
Q = np.c_[GX.ravel(), GY.ravel(), np.full(GX.size, -3.0)]
px, py = photo_xy(Q)
msk = ndi.map_coordinates(alpha, [py, px], order=1, cval=0).reshape(GX.shape) > 0.5
# Shoulders: trapezius sloping off the neck, round shoulder caps and a chest,
# all ellipsoids, trimmed to the photo's silhouette.
ny = neck_y
torso = ell((0, ny - 12.5, -5.6), (16.0, 10.0, 6.4))                  # chest
torso |= ell((0, ny - 4.2, -5.2), (11.5, 3.6, 4.6))                   # trapezius
for sx in (-1, 1):
    torso |= ell((sx * 14.5, ny - 8.0, -5.6), (5.2, 4.8, 5.0))        # shoulder caps
torso &= msk[:, :, None] & (Y < ny - 1.0)
occ |= torso

occ &= ~(inface & (Z > facehf - 0.6))
occ |= (Z <= facehf) & (Z >= -7.0)
vol = ndi.gaussian_filter(occ.astype(np.float32), 1.6)
verts, faces, normals, _ = marching_cubes(vol, 0.5, spacing=(VX, VX, VX))
verts += [xs[0], ys[0], zs[0]]
if normals[verts[:, 2] > 6, 2].mean() < 0: normals = -normals
print('mesh', len(verts), len(faces))

# Density: the photo seen from the front, on surfaces that face the camera.
px, py = photo_xy(verts)
Lv = ndi.map_coordinates(L, [py, px], order=1, cval=0)
# Weighting by the facing (nz) keeps dots even on screen: by surface area
# alone they piled up along the outline, where the surface turns away.
facing = np.clip(normals[:, 2], 0.0, 1.0) ** 0.9
dens = (0.02 + Lv ** 2.0) * facing
dens *= np.clip((verts[:, 1] - ys[0]) / 3.0, 0, 1)        # bottom edge

# Turning weight: the head turns, the shoulders do not.
turn = np.clip((verts[:, 1] - (neck_y - 3.5)) / 3.5, 0, 1)

a, b, c = verts[faces[:, 0]], verts[faces[:, 1]], verts[faces[:, 2]]
area = np.linalg.norm(np.cross(b - a, c - a), axis=1) / 2
tw = area * dens[faces].mean(1)
rng = np.random.default_rng(7)
cdf = np.cumsum(tw); t = np.searchsorted(cdf, rng.random(N) * cdf[-1])
r1, r2 = rng.random(N), rng.random(N); sq = np.sqrt(r1)
wa, wb, wc = 1 - sq, sq * (1 - r2), sq * r2
pts = a[t] * wa[:, None] + b[t] * wb[:, None] + c[t] * wc[:, None]
tws = turn[faces[t, 0]] * wa + turn[faces[t, 1]] * wb + turn[faces[t, 2]] * wc

# Normalise to unit height, centred in x and y, the face front near z = 0.
y_lo, y_hi = pts[:, 1].min(), pts[:, 1].max(); H = y_hi - y_lo; ymid = (y_lo + y_hi) / 2
zf0 = np.percentile(pts[tws > 0.5, 2], 98)
out = (pts - [0, ymid, zf0]) / H
pivot = (np.array([0, neck_y, -4.0]) - [0, ymid, zf0]) / H
print('H', round(H, 2), 'x', out[:, 0].min().round(3), out[:, 0].max().round(3), 'pivot', pivot.round(3))
q = np.round(out * 30000).astype(np.int16)
buf = struct.pack('<4sII', b'HPTS', N, 0) + struct.pack('<3f', *pivot) + q.tobytes() + np.round(tws * 255).astype(np.uint8).tobytes()
open('head.bin', 'wb').write(buf); print(len(buf), 'bytes')
np.savez('scan.npz', X=out[:, 0], Y=out[:, 1], Z=out[:, 2], tw=tws, pivot=pivot)
