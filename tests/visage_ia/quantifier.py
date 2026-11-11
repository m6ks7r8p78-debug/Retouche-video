# poids seulement : chaque grand tenseur float -> int8 par canal (axe 0) + DequantizeLinear ; calculs en float32
import onnx, numpy as np, sys
from onnx import numpy_helper, helper, TensorProto
m = onnx.load(sys.argv[1]); g = m.graph
new_init, nodes = [], []
n = 0
for t in list(g.initializer):
    a = numpy_helper.to_array(t)
    if a.dtype != np.float32 or a.size < 4096 or a.ndim < 2:
        new_init.append(t); continue
    flat = a.reshape(a.shape[0], -1)
    s = np.abs(flat).max(1) / 127.0; s[s == 0] = 1e-8
    q = np.clip(np.round(flat / s[:, None]), -127, 127).astype(np.int8).reshape(a.shape)
    new_init += [numpy_helper.from_array(q, t.name + '_q'), numpy_helper.from_array(s.astype(np.float32), t.name + '_s'), numpy_helper.from_array(np.zeros(a.shape[0], np.int8), t.name + '_z')]
    nodes.append(helper.make_node('DequantizeLinear', [t.name + '_q', t.name + '_s', t.name + '_z'], [t.name], axis=0)); n += 1
del g.initializer[:]; g.initializer.extend(new_init)
old = list(g.node); del g.node[:]; g.node.extend(nodes + old)
onnx.save(m, sys.argv[2]); print(n, 'tenseurs quantifiés')
