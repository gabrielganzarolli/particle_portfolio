"""
Build the plexus head: a bald, smooth head drawn as nodes joined by lines,
like a wireframe hologram. No photo goes into it.

Geometry: MediaPipe's canonical face (mediapipe/modules/face_geometry/data/
canonical_face_model.obj, Apache 2.0, saved as canon_v.npy / canon_f.npy) set
in a skull, jaw, neck and ears made of ellipsoids, blurred and meshed, then
decimated to a few thousand vertices. The vertices are the nodes and the
mesh's edges are the lines. Faces turned away from the camera are dropped and
the neck fades out.

  python3 plexus.py [target_vertices]   # writes head.bin (HNET)
"""
import numpy as np, sys, struct
from scipy.ndimage import gaussian_filter
from skimage.measure import marching_cubes
import fast_simplification

C = np.load('canon_v.npy'); F = np.load('canon_f.npy')
TARGET = int(sys.argv[1]) if len(sys.argv) > 1 else 3200
face = C.copy()

VX = 0.18
xs = np.arange(-11, 11, VX); ys = np.arange(-20, 16, VX); zs = np.arange(-16, 10, VX)
X, Y, Z = np.meshgrid(xs, ys, zs, indexing='ij')
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
    u = (wx * v1[1] - v1[0] * wy) / den; v = (v0[0] * wy - wx * v0[1]) / den
    m = (u >= -1e-6) & (v >= -1e-6) & (u + v <= 1 + 1e-6)
    np.maximum.at(hf, (gx[m], gy[m]), (a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2]))[m])
facehf = hf[:, :, None]; inface = np.isfinite(facehf)

def ell(c, r):
    return ((X - c[0]) / r[0]) ** 2 + ((Y - c[1]) / r[1]) ** 2 + ((Z - c[2]) / r[2]) ** 2 <= 1
occ = ell((0, 3.0, -4.0), (7.8, 10.2, 10.0))                # skull
occ |= ell((0, -3.0, -4.6), (6.9, 6.8, 6.4))                # jaw into skull
occ |= ((X / 5.0) ** 2 + ((Z + 3.8) / 4.9) ** 2 <= 1) & (Y < -2) & (Y > -16)   # neck
for sx in (-1, 1):
    occ |= ell((sx * 7.7, 0.4, -4.6), (1.1, 3.1, 1.7))      # ears
occ &= ~(inface & (Z > facehf - 0.6))
# Sharp inside the face, so it keeps its eyelids, nose and lips; soft toward
# its edge and over the skull, so the seam between them melts away.
from scipy.ndimage import binary_erosion
occ |= (Z <= facehf) & (Z >= -7.0)
core = binary_erosion(inface[:, :, 0], iterations=int(2.2 / VX))
wsharp = gaussian_filter(core.astype(np.float32), 1.0 / VX)[:, :, None]
o = occ.astype(np.float32)
vol = wsharp * gaussian_filter(o, 1.1) + (1 - wsharp) * gaussian_filter(o, 2.6)
verts, faces, normals, _ = marching_cubes(vol, 0.5, spacing=(VX, VX, VX))
verts += [xs[0], ys[0], zs[0]]

v2, f2 = fast_simplification.simplify(verts.astype(np.float32), faces.astype(np.int32), target_count=TARGET * 2 * 1.6)
# Per-vertex normals of the simplified mesh.
n2 = np.zeros_like(v2)
fn = np.cross(v2[f2[:, 1]] - v2[f2[:, 0]], v2[f2[:, 2]] - v2[f2[:, 0]])
for k in range(3): np.add.at(n2, f2[:, k], fn)
n2 /= np.linalg.norm(n2, axis=1, keepdims=True) + 1e-9
if n2[v2[:, 2] > 6, 2].mean() < 0: n2 = -n2

# Keep what faces the camera, and the neck down to where it fades.
keep = (n2[:, 2] > -0.2) & (v2[:, 1] > -14.0)
idx = -np.ones(len(v2), int); idx[keep] = np.arange(keep.sum())
v3, n3 = v2[keep], n2[keep]
edges = set()
for t in f2:
    for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
        if keep[a] and keep[b]:
            i, j = sorted((idx[a], idx[b])); edges.add((i, j))
edges = np.array(sorted(edges), dtype=np.uint16)
fade = np.clip((v3[:, 1] + 14.0) / 5.0, 0, 1) ** 1.5 * np.clip((n3[:, 2] + 0.2) / 0.45, 0, 1)

# Unit height over the kept part, centred, the face front near z = 0.
lo, hi = v3.min(0), v3.max(0); H = hi[1] - lo[1]; cy = (lo[1] + hi[1]) / 2
zf = np.percentile(v3[:, 2], 99)
out = (v3 - [0, cy, zf]) / H
pivot = (np.array([0, -6.0, -4.3]) - [0, cy, zf]) / H
order = np.random.default_rng(3).permutation(len(out))      # random order for the JS side
inv = np.empty_like(order); inv[order] = np.arange(len(order))
out, fade = out[order], fade[order]; edges = np.sort(inv[edges.astype(int)], axis=1).astype(np.uint16)
print('nodes', len(out), 'edges', len(edges), 'width/height', round((hi[0] - lo[0]) / H, 3), 'pivot', pivot.round(3))
q = np.round(out * 30000).astype(np.int16)
nv, ne = len(out), len(edges)
buf = struct.pack('<4sII', b'HNET', nv, ne) + struct.pack('<3f', *pivot) + q.tobytes() + np.round(fade * 255).astype(np.uint8).tobytes()
if len(buf) % 2: buf += b'\0'
buf += edges.tobytes()
open('head.bin', 'wb').write(buf); print(len(buf), 'bytes')
np.savez('plexus.npz', v=out, e=edges, fade=fade, pivot=pivot)
