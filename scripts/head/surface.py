"""
Build the head the home page forms from its particles: a sculpted bald head
whose surface the particles cover the way they cover the letters, as
separate dots, placed where the light falls, like a photo turned to dots.

Source: "Infinite, 3D Head Scan" by Lee Perry-Smith, CC BY 3.0
(https://creativecommons.org/licenses/by/3.0/), via three.js
(examples/models/gltf/LeePerrySmith/LeePerrySmith.glb). Changes: cropped to
head and neck, shading baked into a per-vertex weight.

The file holds the mesh, a copy pulled slightly inside it (drawn as a depth
occluder, so grain on the far side stays hidden), a weight per vertex (light
from the front left, the neck dissolving) and the pivot the head turns on.

  python3 surface.py LeePerrySmith.glb   # writes head.bin (HSRF)
"""
import numpy as np, sys, struct
import trimesh, cv2

s = trimesh.load(sys.argv[1] if len(sys.argv) > 1 else 'LeePerrySmith.glb', force='mesh')
s.merge_vertices(merge_tex=True, merge_norm=True)
v, f, n = s.vertices.astype(np.float64), s.faces, s.vertex_normals

# The scan has inner surfaces behind the eyes, nostrils and mouth (a second
# shell), which doubled the grain there. Keep only faces seen from outside,
# from the front and the angles the head turns through.
def visible_faces(v, f, views=13, res=1400):
    seen = np.zeros(len(f), bool)
    for k in range(views):
        yaw = np.radians(-80 + 160 * k / (views - 1))
        for pitch in (np.radians(-25), 0.0, np.radians(25)):
            Ry = np.array([[np.cos(yaw), 0, np.sin(yaw)], [0, 1, 0], [-np.sin(yaw), 0, np.cos(yaw)]])
            Rx = np.array([[1, 0, 0], [0, np.cos(pitch), -np.sin(pitch)], [0, np.sin(pitch), np.cos(pitch)]])
            q = v @ (Ry @ Rx).T
            xy = (q[:, :2] - q[:, :2].min(0)) / (q[:, :2].max(0) - q[:, :2].min(0)).max() * (res - 1)
            img = np.full((res, res), -1, np.int32)
            for t in np.argsort(q[f].mean(1)[:, 2]):          # far to near
                cv2.fillConvexPoly(img, np.round(xy[f[t]] * 4).astype(np.int32), int(t), cv2.LINE_8, 2)
            seen[np.unique(img[img >= 0])] = True
    return seen

NECK_CUT, NECK_FADE = -2.2, -0.8     # scan units: the chin is near y = -0.7
region = (v[:, 1] > NECK_CUT) & ((v[:, 1] > -0.9) | (np.abs(v[:, 0]) < 1.9))
outer = visible_faces(v, f)
print('outer faces', outer.sum(), 'of', len(f))
fsel = f[region[f].all(1) & outer]
region &= np.isin(np.arange(len(v)), fsel)
idx = -np.ones(len(v), int); idx[region] = np.arange(region.sum())
faces = idx[fsel]
vr, nr = v[region], n[region]

Lk = np.array([-0.35, 0.3, 0.88]); Lk /= np.linalg.norm(Lk)
light = 0.16 + 0.84 * np.clip(nr @ Lk, 0, 1) ** 1.4
# Sampling goes by area, and a surface seen edge-on packs its area into a
# thin band on screen, which glowed along the outline. Weighting by the
# facing (nz) makes dots on screen follow the light, as in a photo; a floor
# keeps the sides from going empty when the head turns.
facing = 0.08 + 0.92 * np.clip(nr[:, 2], 0, 1)
neck = np.clip((vr[:, 1] - NECK_CUT) / (NECK_FADE - NECK_CUT), 0, 1) ** 2
w = light * facing * neck

lo, hi = vr.min(0), vr.max(0); H = hi[1] - lo[1]; cy = (lo[1] + hi[1]) / 2
zf = np.percentile(vr[:, 2], 99.5)
out = (vr - [0, cy, zf]) / H
occ = (vr - nr * 0.035 - [0, cy, zf]) / H
pivot = (np.array([0, -1.0, -0.6]) - [0, cy, zf]) / H
print('verts', len(out), 'faces', len(faces), 'pivot', pivot.round(3))

buf = struct.pack('<4sII', b'HSRF', len(out), len(faces)) + struct.pack('<3f', *pivot)
buf += np.round(out * 30000).astype(np.int16).tobytes() + np.round(occ * 30000).astype(np.int16).tobytes()
buf += np.round(w / w.max() * 255).astype(np.uint8).tobytes()
if len(buf) % 2: buf += b'\0'
buf += faces.astype(np.uint16).tobytes()
open('head.bin', 'wb').write(buf); print(len(buf), 'bytes')
np.savez('surface.npz', v=out, f=faces, w=w / w.max())
