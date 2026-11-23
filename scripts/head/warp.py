"""
Pull the scan's face partway toward Gabriel's proportions.

Inputs: scan-lm-px.npy (MediaPipe landmarks found on a front render of the
scan, with scan-render-meta.npy for the render's mapping) and lm-disp.npy
(the scan's landmarks and their displacement toward the mean of Gabriel's two
frontal selfies, both mirrored to remove pose). Horizontal measures agreed
between the selfies (eye span, nose and mouth width) and are applied at 85%;
vertical ones did not (the phone was held at different angles) and get 25%.
A thin-plate warp spreads the displacement over the face; anchors around it
and a fade toward the back keep the skull, ears and neck as they were.

  python3 warp.py   # writes warp.npy, read by surface.py
"""
import numpy as np, trimesh
from scipy.interpolate import RBFInterpolator

s = trimesh.load('LeePerrySmith.glb', force='mesh')
s.merge_vertices(merge_tex=True, merge_norm=True)
v = s.vertices
D = np.load('lm-disp.npy'); P = D[:, :2]
d = np.c_[0.85 * D[:, 2], 0.25 * D[:, 3]]
c = P.mean(0)
ring = np.array([c + np.array([np.cos(a) * 1.55 * r, np.sin(a) * 2.0 * r])
                 for a in np.linspace(0, 2 * np.pi, 48, endpoint=False) for r in (1.35, 1.7)])
rbf = RBFInterpolator(np.vstack([P, ring]), np.vstack([d, np.zeros((len(ring), 2))]),
                      kernel='thin_plate_spline', smoothing=0.002)
disp = rbf(v[:, :2]) * np.clip((v[:, 2] - 0.3) / 0.9, 0, 1)[:, None]
np.save('warp.npy', np.c_[disp, np.zeros(len(v))].astype(np.float32))
print('max move', np.linalg.norm(disp, axis=1).max().round(3))
