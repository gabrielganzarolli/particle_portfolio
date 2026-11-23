"""
Build the bald, low-poly head the home page turns into particles.

Inputs (in this folder): canon_v.npy / canon_f.npy, MediaPipe's canonical face
mesh (mediapipe/modules/face_geometry/data/canonical_face_model.obj, Apache
2.0), and lmA.npy, the 468 landmarks lm.py finds on a frontal selfie.

The face is the canonical mesh pulled 70% toward the photo's landmarks, then
mirrored. Skull, jaw, neck and ears are ellipsoids; the union is blurred and
meshed, which is what keeps it low fidelity. Shading becomes a per-vertex
weight, the density of particles on that part of the surface.

  python3 head3d.py 0.7 1.8 && python3 export.py   # writes head.bin
"""
import numpy as np, cv2, json, sys
from scipy.ndimage import gaussian_filter, map_coordinates
from skimage.measure import marching_cubes

C = np.load('canon_v.npy'); F = np.load('canon_f.npy')
lm = np.load('lmA.npy')
P = np.c_[lm[:, 0], -lm[:, 1], -lm[:, 2]]

# Similarity transform from the photo's landmarks onto the canonical face,
# which takes out the low camera angle of the selfie.
def procrustes(X, Y):
    mx, my = X.mean(0), Y.mean(0)
    Xc, Yc = X - mx, Y - my
    U, S, Vt = np.linalg.svd(Xc.T @ Yc)
    d = np.sign(np.linalg.det(U @ Vt))
    D = np.diag([1, 1, d])
    R = U @ D @ Vt
    s = (S * np.diag(D)).sum() / (Xc ** 2).sum()
    return lambda Z: s * (Z - mx) @ R + my
A = procrustes(P, C)(P)
ALPHA = float(sys.argv[1]) if len(sys.argv) > 1 else 0.7
face = C + ALPHA * (A - C)
# Average each side with the mirror of the other: a symmetric, calmer face.
from scipy.spatial import cKDTree
mir = face * [-1, 1, 1]
idx = cKDTree(C).query(C * [-1, 1, 1])[1]
face = 0.5 * face + 0.5 * mir[idx]

VX = 0.18
xs = np.arange(-11, 11, VX); ys = np.arange(-18, 16, VX); zs = np.arange(-16, 10, VX)
X, Y, Z = np.meshgrid(xs, ys, zs, indexing='ij')

# Height field of the face over x,y.
hf = np.full((len(xs), len(ys)), -np.inf)
for t in F:
    a, b, c = face[t]
    lo = np.floor((np.minimum(np.minimum(a, b), c)[:2] - [xs[0], ys[0]]) / VX).astype(int)
    hi = np.ceil((np.maximum(np.maximum(a, b), c)[:2] - [xs[0], ys[0]]) / VX).astype(int)
    gx, gy = np.meshgrid(np.arange(lo[0], hi[0] + 1), np.arange(lo[1], hi[1] + 1), indexing='ij')
    px = xs[0] + gx * VX; py = ys[0] + gy * VX
    v0, v1 = b[:2] - a[:2], c[:2] - a[:2]
    den = v0[0] * v1[1] - v1[0] * v0[1]
    if abs(den) < 1e-9: continue
    wx, wy = px - a[0], py - a[1]
    u = (wx * v1[1] - v1[0] * wy) / den
    v = (v0[0] * wy - wx * v0[1]) / den
    m = (u >= -1e-6) & (v >= -1e-6) & (u + v <= 1 + 1e-6)
    z = a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2])
    gxm, gym, zm = gx[m], gy[m], z[m]
    np.maximum.at(hf, (gxm, gym), zm)
facehf = hf[:, :, None]
inface = np.isfinite(facehf)
faceocc = (Z <= facehf) & (Z >= -7.0)
occ = np.zeros_like(faceocc)

def ell(c, r):
    return ((X - c[0]) / r[0]) ** 2 + ((Y - c[1]) / r[1]) ** 2 + ((Z - c[2]) / r[2]) ** 2 <= 1
occ |= ell((0, 3.0, -4.3), (7.8, 10.4, 9.8))          # cranium
occ |= ell((0, -3.0, -4.6), (6.9, 6.8, 6.4))            # jaw to skull
neck = ((X / 5.0) ** 2 + ((Z + 3.6) / 4.9) ** 2 <= 1) & (Y < -2) & (Y > -17.5)
occ |= neck
for s in (-1, 1):
    occ |= ell((s * 7.7, 0.4, -4.6), (1.1, 3.1, 1.7))   # ears

occ &= ~(inface & (Z > facehf - 0.6))
occ |= faceocc
vol = gaussian_filter(occ.astype(np.float32), float(sys.argv[2]) if len(sys.argv) > 2 else 1.8)
verts, faces, normals, _ = marching_cubes(vol, 0.5, spacing=(VX, VX, VX))
verts += [xs[0], ys[0], zs[0]]
normals = -normals if (normals[:, 2][verts[:, 2] > 7].mean() < 0) else normals
print('mesh', verts.shape, faces.shape)

# Shading folded into sampling density.
L = np.array([-0.1, 0.22, 0.95]); L /= np.linalg.norm(L)
lam = np.clip(normals @ L, 0, 1)
big = gaussian_filter(occ.astype(np.float32), 4)
gi = ((verts - [xs[0], ys[0], zs[0]]) / VX).T
ao = map_coordinates(big, gi, order=1)
cav = np.clip(1.9 - 2.2 * ao, 0.1, 1)
front = np.clip((normals[:, 2] + 0.55) / 0.75, 0, 1) ** 1.5
fade = np.clip((verts[:, 1] + 15.5) / 5.5, 0, 1) ** 1.6
# Particles pile up where the surface turns away from the camera, so the
# outline glowed under the bloom. Weighting by the facing (nz) evens that out.
facing = np.clip(normals[:, 2], 0.0, 1.0) ** 0.9 * 0.85 + 0.15 * front
w = (0.06 + 0.94 * lam ** 2.2) * cav * facing * fade
# The crown caught the most light and burned out under the bloom: ease it off
# above the brow so the face stays the brightest part.
crown = 1 - 0.55 * np.clip((verts[:, 1] - 6.0) / 7.0, 0, 1)
w *= crown
np.savez('head3d.npz', v=verts.astype(np.float32), f=faces.astype(np.int32), w=w.astype(np.float32), n=normals.astype(np.float32))

def sample(N, rng=np.random.default_rng(1)):
    a, b, c = verts[faces[:, 0]], verts[faces[:, 1]], verts[faces[:, 2]]
    area = np.linalg.norm(np.cross(b - a, c - a), axis=1) / 2
    tw = area * w[faces].mean(1)
    cdf = np.cumsum(tw); t = np.searchsorted(cdf, rng.random(N) * cdf[-1])
    r1, r2 = rng.random(N), rng.random(N); s = np.sqrt(r1)
    return a[t] * (1 - s)[:, None] + b[t] * (s * (1 - r2))[:, None] + c[t] * (s * r2)[:, None]

pts = sample(150000)
tiles = []
for yaw in (-32, 0, 32):
    for pitch in ((0,) if yaw else (-15, 0, 15))[:1]:
        a = np.radians(yaw); pa = np.radians(10 if yaw else 0)
        R = np.array([[np.cos(a), 0, np.sin(a)], [0, 1, 0], [-np.sin(a), 0, np.cos(a)]])
        p = pts @ R.T
        img = np.zeros((560, 420), np.float32)
        u = ((p[:, 0] + 14) / 28 * 420).astype(int); v = ((16 - p[:, 1]) / 37 * 560).astype(int)
        ok = (u >= 0) & (u < 420) & (v >= 0) & (v < 560)
        np.add.at(img, (v[ok], u[ok]), 1)
        img = cv2.GaussianBlur(img, (0, 0), 0.7)
        img = np.clip(img / np.percentile(img[img > 0], 99) , 0, 1) ** 0.8
        tiles.append((img * 255).astype(np.uint8))
cv2.imwrite('head3d-preview.png', np.hstack(tiles))
