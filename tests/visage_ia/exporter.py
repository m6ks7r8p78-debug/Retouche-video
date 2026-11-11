# Reproduit modeles/lourds/gfpgan14_int8w.onnx à partir des poids officiels GFPGAN v1.4 (Tencent ARC).
#   pip install torch onnx onnxruntime --index-url https://download.pytorch.org/whl/cpu
#   curl -LO https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth   (SHA-256 e2cd4703ab14f4d01fd1383a8a8b266f9a5833dacee8e6a79d3bf21a1b6be5ad)
#   git clone --depth 1 https://github.com/TencentARC/GFPGAN   (architecture « clean », sans extension CUDA)
#   python exporter.py GFPGANv1.4.pth GFPGAN/ && python quantifier.py gfpgan14_fp32.onnx gfpgan14_int8w.onnx
import sys, os, re, torch, tempfile
pth, src = sys.argv[1], sys.argv[2]; d = tempfile.mkdtemp()
stub = "class _R:\n    def register(self):\n        return lambda c: c\nARCH_REGISTRY = _R()"
for f in ["stylegan2_clean_arch.py", "gfpganv1_clean_arch.py"]:
    s = open(os.path.join(src, "gfpgan/archs", f)).read().replace("from basicsr.archs.arch_util import default_init_weights", "def default_init_weights(*a, **k): pass")
    s = s.replace("from basicsr.utils.registry import ARCH_REGISTRY", stub).replace("from .stylegan2_clean_arch", "from stylegan2_clean_arch")
    open(os.path.join(d, f), "w").write(s)
sys.path.insert(0, d); from gfpganv1_clean_arch import GFPGANv1Clean
m = GFPGANv1Clean(out_size=512, num_style_feat=512, channel_multiplier=2, decoder_load_path=None, fix_decoder=False, num_mlp=8, input_is_latent=True, different_w=True, narrow=1, sft_half=True)
m.load_state_dict(torch.load(pth, map_location="cpu", weights_only=True)["params_ema"], strict=True); m.eval()
class W(torch.nn.Module):
    def __init__(s, m): super().__init__(); s.m = m
    def forward(s, x): return s.m(x, return_rgb=False, randomize_noise=False)[0]   # bruit fixe : résultat reproductible
torch.onnx.export(W(m), torch.zeros(1, 3, 512, 512), "gfpgan14_fp32.onnx", input_names=["entree"], output_names=["sortie"], opset_version=17, dynamo=False)
print("gfpgan14_fp32.onnx écrit")
