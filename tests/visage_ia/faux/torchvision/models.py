# alexnet minimal (architecture torchvision) pour lpips, sans dépendre de torchvision
import torch, torch.nn as nn
class AlexNet(nn.Module):
    def __init__(s):
        super().__init__()
        s.features = nn.Sequential(nn.Conv2d(3,64,11,4,2), nn.ReLU(True), nn.MaxPool2d(3,2), nn.Conv2d(64,192,5,padding=2), nn.ReLU(True), nn.MaxPool2d(3,2), nn.Conv2d(192,384,3,padding=1), nn.ReLU(True), nn.Conv2d(384,256,3,padding=1), nn.ReLU(True), nn.Conv2d(256,256,3,padding=1), nn.ReLU(True), nn.MaxPool2d(3,2))
class AlexNet_Weights: IMAGENET1K_V1 = 'v1'
def alexnet(weights=None, pretrained=False, **k):
    m = AlexNet()
    if weights or pretrained:
        sd = torch.hub.load_state_dict_from_url('https://download.pytorch.org/models/alexnet-owt-7be5be79.pth', map_location='cpu')
        m.load_state_dict({k: v for k, v in sd.items() if k.startswith('features')})
    return m
def vgg16(*a, **k): raise NotImplementedError
def squeezenet1_1(*a, **k): raise NotImplementedError
