import numpy as np, fast_simplification, struct
from scipy.spatial import cKDTree
d = np.load('head3d.npz'); v, f, w = d['v'], d['f'], d['w']
v2, f2 = fast_simplification.simplify(v, f, target_reduction=0.93)
w2 = w[cKDTree(v).query(v2)[1]]
# Drop triangles that carry no weight (the back of the head, the neck's end).
keep = w2[f2].max(1) > 0.004
f2 = f2[keep]
used = np.unique(f2); remap = -np.ones(len(v2), int); remap[used] = np.arange(len(used))
v2, w2, f2 = v2[used], w2[used], remap[f2]
print(len(v2), len(f2))
# Normalise: unit height over the weighted part, centred on x and y.
lo, hi = v2.min(0), v2.max(0)
H = hi[1] - lo[1]; cy = (hi[1] + lo[1]) / 2
pivot = np.array([0, 0.4, -4.3])
vn = (v2 - [0, cy, 0]) / H
pn = (pivot - [0, cy, 0]) / H
print('width/height', (hi[0]-lo[0])/H, 'z', vn[:,2].min(), vn[:,2].max(), 'pivot', pn)
q = np.round(vn * 30000).astype(np.int16)
wq = np.round(w2 / w2.max() * 255).astype(np.uint8)
buf = struct.pack('<4sII', b'HEAD', len(v2), len(f2)) + struct.pack('<3f', *pn) + q.tobytes() + wq.tobytes()
if len(buf) % 2: buf += b'\0'
buf += f2.astype(np.uint16).tobytes()
open('head.bin', 'wb').write(buf); print(len(buf), 'bytes')
np.savez('head-lo.npz', v=v2, f=f2, w=w2)
