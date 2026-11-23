import numpy as np, cv2, sys
from ai_edge_litert.interpreter import Interpreter
img = cv2.imread(sys.argv[1])[:, :, ::-1]
cx, cy, s = float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
x0, y0 = int(cx - s/2), int(cy - s/2)
crop = img[y0:y0+int(s), x0:x0+int(s)]
inp = cv2.resize(crop, (192,192)).astype(np.float32)/255.
it = Interpreter('wheel/mediapipe/modules/face_landmark/face_landmark.tflite'); it.allocate_tensors()
i = it.get_input_details()[0]; it.set_tensor(i['index'], inp[None]); it.invoke()
outs = {o['name']: it.get_tensor(o['index']) for o in it.get_output_details()}
for k,v in outs.items(): print(k, v.shape, v.ravel()[:3])
lm = [v for v in outs.values() if v.size == 1404][0].reshape(468,3)
lm[:, :2] = lm[:, :2] / 192 * s + [x0, y0]; lm[:, 2] = lm[:, 2] / 192 * s
np.save(sys.argv[5], lm)
vis = img[:, :, ::-1].copy()
for x,y,_ in lm: cv2.circle(vis, (int(x),int(y)), 4, (0,255,0), -1)
cv2.imwrite(sys.argv[5].replace('.npy','.jpg'), cv2.resize(vis[y0:y0+int(s), x0:x0+int(s)], (600,600)))
