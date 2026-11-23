"""
Build the plexus head: a sculpted bald head drawn as nodes joined by lines,
like a wireframe hologram.

Source: "Infinite, 3D Head Scan" by Lee Perry-Smith, CC BY 3.0
(https://creativecommons.org/licenses/by/3.0/), via three.js
(examples/models/gltf/LeePerrySmith/LeePerrySmith.glb). Changes: cropped to
head and neck, vertices used as nodes and edges as lines, shading baked into
node weights.

The scan's own triangulation is kept: it is denser where the face has detail
(eyes, nose, lips, ears), which is what gives the wireframe its definition.
Faces turned away from the camera are dropped; the neck fades out. The
whole head also goes in as an occluder mesh (see below).

  python3 plexus.py LeePerrySmith.glb   # writes head.bin (HNET)
"""
import numpy as np, sys, struct
import trimesh

s = trimesh.load(sys.argv[1] if len(sys.argv) > 1 else 'LeePerrySmith.glb', force='mesh')
s.merge_vertices()
v, f = s.vertices.astype(np.float64), s.faces
n = s.vertex_normals

NECK_CUT, NECK_FADE = -2.2, -0.9     # scan units: chin is near y = -0.7
region = (v[:, 1] > NECK_CUT) & ((v[:, 1] > -0.9) | (np.abs(v[:, 0]) < 1.9))
keep = (n[:, 2] > -0.25) & region
idx = -np.ones(len(v), int); idx[keep] = np.arange(keep.sum())
v3, n3 = v[keep], n[keep]
edges = set()
for t in f:
    for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
        if keep[a] and keep[b]:
            i, j = sorted((idx[a], idx[b])); edges.add((i, j))
edges = np.array(sorted(edges), dtype=np.int64)

fade = np.clip((v3[:, 1] - NECK_CUT) / (NECK_FADE - NECK_CUT), 0, 1) ** 2 * np.clip((n3[:, 2] + 0.25) / 0.45, 0, 1)
# Light from the front, a little left and above.
Lk = np.array([-0.45, 0.35, 0.82]); Lk /= np.linalg.norm(Lk)
shade = 0.16 + 0.84 * np.clip(n3 @ Lk, 0, 1) ** 1.4
fade = fade * shade
# Even out brightness: the scan is densest around the eyes, nose and lips, and
# there the nodes and lines piled up into a glare. Each node is weighted by
# the surface area around it, so light follows the surface, not the mesh.
area = np.zeros(len(v))
fa = np.linalg.norm(np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]]), axis=1) / 6
for k in range(3): np.add.at(area, f[:, k], fa)
a3 = area[keep]
fade = fade * np.clip(a3 / np.median(a3), 0.25, 1.6) ** 0.6
fade = fade / np.percentile(fade, 99.5)
fade = np.clip(fade, 0, 1)

lo, hi = v3.min(0), v3.max(0); H = hi[1] - lo[1]; cy = (lo[1] + hi[1]) / 2
zf = np.percentile(v3[:, 2], 99.5)
out = (v3 - [0, cy, zf]) / H
pivot = (np.array([0, -1.0, -0.6]) - [0, cy, zf]) / H
order = np.random.default_rng(3).permutation(len(out))
inv = np.empty_like(order); inv[order] = np.arange(len(order))
out, fade = out[order], fade[order]
edges = np.sort(inv[edges], axis=1).astype(np.uint16)
print('nodes', len(out), 'edges', len(edges), 'width/height', round((hi[0] - lo[0]) / H, 3), 'pivot', pivot.round(3))
# Occluder: the whole head region, back included, pulled slightly inside its
# surface. The page draws it into the depth buffer only, so nodes and lines
# on the far side are hidden, as on a solid head.
oidx = -np.ones(len(v), int); oidx[region] = np.arange(region.sum())
ofaces = f[region[f].all(1)]
ov = (v[region] - n[region] * 0.035 - [0, cy, zf]) / H
ofaces = oidx[ofaces].astype(np.uint16)
print('occluder', len(ov), 'verts', len(ofaces), 'faces')

q = np.round(out * 30000).astype(np.int16)
oq = np.round(ov * 30000).astype(np.int16)
buf = struct.pack('<4sIIII', b'HNT2', len(out), len(edges), len(ov), len(ofaces)) + struct.pack('<3f', *pivot)
buf += q.tobytes() + oq.tobytes() + np.round(fade * 255).astype(np.uint8).tobytes()
if len(buf) % 2: buf += b'\0'
buf += edges.tobytes() + ofaces.tobytes()
open('head.bin', 'wb').write(buf); print(len(buf), 'bytes')
np.savez('plexus.npz', v=out, e=edges, fade=fade, pivot=pivot)
