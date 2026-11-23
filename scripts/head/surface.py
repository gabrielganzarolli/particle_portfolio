"""
Build the head the home page forms from its particles: a sculpted bald head
whose surface the particles cover the way they cover the letters, as
separate dots, placed where the light falls, like a photo turned to dots.

Source: "Infinite, 3D Head Scan" by Lee Perry-Smith, CC BY 3.0
(https://creativecommons.org/licenses/by/3.0/), via three.js
(examples/models/gltf/LeePerrySmith/LeePerrySmith.glb). Changes: cropped to
head and neck, shading baked into a per-vertex weight.

The file holds the mesh, a copy pulled slightly inside it (drawn as a depth
occluder, so grain on the far side stays hidden), a weight per vertex (ambient occlusion
and a soft front light, more on the face, less on the crown and neck), how
far each vertex turns with the head, and the pivot it turns on.

  python3 surface.py LeePerrySmith.glb   # writes head.bin (HSR3)
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

Lk = np.array([0.0, 0.3, 0.95]); Lk /= np.linalg.norm(Lk)
# The light is baked into the model, so it turns with the head: a light from
# one side put that side in shadow, and turning toward the cursor showed the
# camera a dark, half-empty face. The features come from ambient occlusion
# instead (how open each point is to the sky around it), which darkens the
# eye sockets, nostrils, lips and ear folds and no side as a whole; a soft
# frontal light only shapes the planes.
def ambient_occlusion(mesh, pts, nrm, rays=48, reach=0.9):
    rng = np.random.default_rng(5)
    d = rng.normal(size=(rays, 3)); d /= np.linalg.norm(d, axis=1, keepdims=True)
    open_ = np.zeros(len(pts))
    for k in range(rays):
        dirs = np.where((nrm @ d[k])[:, None] < 0, -d[k], d[k])
        origins = pts + nrm * 0.01
        hit = mesh.ray.intersects_any(origins, dirs)
        loc, ri, _ = mesh.ray.intersects_location(origins[hit], dirs[hit], multiple_hits=False)
        near = np.zeros(len(pts), bool)
        idx_hit = np.flatnonzero(hit)[ri]
        near[idx_hit] = np.linalg.norm(loc - origins[idx_hit], axis=1) < reach
        open_ += ~near
    return open_ / rays
import os
cache = f'ao-{len(vr)}.npy'
if os.path.exists(cache):
    ao = np.load(cache)
else:
    ao = ambient_occlusion(trimesh.Trimesh(v, f, process=False), vr, nr)
    np.save(cache, ao)
lam = np.clip(nr @ Lk, 0, 1)
light = (0.15 + 0.85 * ao ** 2.2) * (0.6 + 0.4 * lam)
# Sampling goes by area, and a surface seen edge-on packs its area into a
# thin band on screen, which glowed along the outline. Weighting by the
# facing (nz) makes dots on screen follow the light, as in a photo; a floor
# keeps the sides from going empty when the head turns.
facing = 0.1 + 0.9 * np.clip(nr[:, 2], 0, 1)
neck = np.clip((vr[:, 1] - NECK_CUT) / (NECK_FADE - NECK_CUT), 0, 1) ** 2
def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)
# Density by part of the head: the face carries the most particles, the
# crown and the back of the skull fewer, the ears in between, and the neck
# thins out toward its base.
x, y, z = vr[:, 0], vr[:, 1], vr[:, 2]
face = smooth(0.9, 1.6, z) * smooth(-1.1, -0.6, y) * (1 - smooth(2.3, 2.8, y)) * (1 - smooth(1.15, 1.45, np.abs(x + 0.05)))
crown = smooth(2.2, 3.4, y) * (1 - face)
ear = smooth(1.45, 1.65, np.abs(x)) * smooth(0.4, 0.8, y) * (1 - smooth(2.0, 2.3, y))
part = 1.0 + 0.9 * face - 0.45 * crown - 0.1 * ear
w = light * facing * neck * part
# Neck: below the chin.
neckm = 1 - smooth(-1.1, -0.5, y)

# How far each point follows the head's turn: all of the head, then the neck
# twisting less and less toward its base, which stays put.
turn = smooth(NECK_CUT, -0.45, y)

vr_head = vr
lo, hi = vr_head.min(0), vr_head.max(0); H = hi[1] - lo[1]; cy = (lo[1] + hi[1]) / 2
zf = np.percentile(vr_head[:, 2], 99.5)
out = (vr - [0, cy, zf]) / H
# The occluder sits a little inside the surface. The scan's normals point
# the wrong way in places (patches around the eyes and nose), which pushed the
# occluder out in front of the face there, so it is pulled in toward the
# head's vertical axis instead.
axis = np.c_[np.full(len(vr), -0.05), vr[:, 1], np.full(len(vr), -0.45)]
to_axis = axis - vr
to_axis /= np.linalg.norm(to_axis, axis=1, keepdims=True) + 1e-9
occ = (vr + to_axis * 0.09 - [0, cy, zf]) / H
# The head turns on the top of the spine, behind the jaw at the earlobes.
pivot = (np.array([-0.05, 0.6, -0.45]) - [0, cy, zf]) / H
print('verts', len(out), 'faces', len(faces), 'pivot', pivot.round(3))

buf = struct.pack('<4sII', b'HSR3', len(out), len(faces)) + struct.pack('<3f', *pivot)
buf += np.round(out * 30000).astype(np.int16).tobytes() + np.round(occ * 30000).astype(np.int16).tobytes()
# The density is shipped as its ingredients, so the page's tuning panel can
# re-mix it: ambient occlusion, the frontal light, how far each point faces
# the camera, the fade at the neck's base, and masks for the face, crown,
# ears and neck. The page combines them as
#   light = (1 - shadows + shadows * ao^2.2) * (0.6 + 0.4 * lam)
#   facing = floor + (1 - floor) * nz
#   part = 1 + (face - 1) * faceMask + (crown - 1) * crownMask + ...
#   weight = light * facing * fade * part
# with shadows 0.85, floor 0.1, face 1.9, crown 0.55, ears 0.9, neck 1 by
# default, which is what this script used to bake.
u8 = lambda a: np.round(np.clip(a, 0, 1) * 255).astype(np.uint8).tobytes()
for ch in (ao, lam, np.clip(nr[:, 2], 0, 1), neck, face, crown, ear, neckm, turn):
    buf += u8(ch)
if len(buf) % 2: buf += b'\0'
buf += faces.astype(np.uint16).tobytes()
open('head.bin', 'wb').write(buf); print(len(buf), 'bytes')
np.savez('surface.npz', v=out, f=faces, w=w / w.max())
