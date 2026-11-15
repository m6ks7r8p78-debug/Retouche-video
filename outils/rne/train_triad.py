"""Private RNE 0.3 training: 157 catalog videos, 127 train/12 validation/18 heldout.
All training data/weights/reports are private. No network or Git write.
"""
from __future__ import annotations
import cv2,numpy as np,torch,json,random,time,sys,argparse
from pathlib import Path
from torch import nn
from torch.nn import functional as F
from collections import defaultdict
from triad import RNE03,alignment
from engine import load_model as load_rne01
from temporal import load_temporal as load_rne02
from prepare_triad import verify_manifest,require_outside_git
def arguments():
 parser=argparse.ArgumentParser(description='RNE 0.3: private, reproducible three-frame training')
 parser.add_argument('--manifest',type=Path,required=True)
 parser.add_argument('--cache-dir',type=Path,required=True)
 parser.add_argument('--output',type=Path,required=True)
 parser.add_argument('--base-weights',type=Path,required=True)
 parser.add_argument('--temporal-weights',type=Path,required=True)
 parser.add_argument('--steps',type=int,default=600)
 parser.add_argument('--batch',type=int,default=8)
 parser.add_argument('--seed',type=int,default=20261114)
 parser.add_argument('--expected-count',type=int)
 parser.add_argument('--authorized-private-training',action='store_true',required=True)
 args=parser.parse_args()
 if not args.authorized_private_training:raise PermissionError('Explicit owner consent required')
 if not 20<=args.steps<=5000 or not 1<=args.batch<=32:raise ValueError('Training budget invalid')
 return args

args=arguments()
root=require_outside_git(args.output)
manifest=json.loads(args.manifest.read_text(encoding='utf-8'))
verify_manifest(manifest,expected_count=args.expected_count)
byid={x['id']:x for x in manifest}
cache=args.cache_dir.resolve()
if not cache.is_dir():raise ValueError('Expected private preprocessed triplet cache')
root.mkdir(parents=True,exist_ok=True)
cv2.setNumThreads(1)
torch.set_num_threads(2)
seed=args.seed
random.seed(seed);torch.manual_seed(seed)

def lowres(img,rng):
 h,w=img.shape[:2];lo=cv2.resize(img,(w//2,h//2),interpolation=cv2.INTER_AREA)
 if rng.random()<.3:
  ok,encoded=cv2.imencode('.jpg',lo,[cv2.IMWRITE_JPEG_QUALITY,int(rng.choice([50,65,80,90]))]);
  if ok:lo=cv2.imdecode(encoded,cv2.IMREAD_COLOR)
 if rng.random()<.4:
  noise=np.random.default_rng(rng.getrandbits(64)).normal(0,rng.choice([1.5,3.,5.]),lo.shape)
  lo=np.clip(lo.astype(np.float32)+noise,0,255).astype(np.uint8)
 return lo

def to_tensor(img):
 return torch.from_numpy(np.ascontiguousarray(img[:,:,::-1])).permute(2,0,1).float()/255

def make_case(path,random_seed):
 rng=random.Random(random_seed)
 with np.load(path) as x:
  p2,p1,hr = x['prev2'],x['prev1'],x['current']
 l2,l1,lc=[lowres(z,rng) for z in (p2,p1,hr)]
 a1,c1=alignment(lc,l1);a2,c2=alignment(lc,l2)
 return {'cur':to_tensor(lc),'p1':to_tensor(a1),'p2':to_tensor(a2),
         'c1':torch.from_numpy(c1.copy())[None], 'c2':torch.from_numpy(c2.copy())[None],
         'hr':to_tensor(hr)}

def patch(case,rng,sz=32,augment=False):
 h,w=case['cur'].shape[-2:];sz=min(sz,h,w)
 y=rng.randrange(h-sz+1);x=rng.randrange(w-sz+1)
 p={k:(v[:,2*y:2*(y+sz),2*x:2*(x+sz)] if k=='hr' else v[:,y:y+sz,x:x+sz]) for k,v in case.items()}
 if augment:
  if rng.random()<.5:p={k:v.flip(-1) for k,v in p.items()}
  if rng.random()<.5:p={k:v.flip(-2) for k,v in p.items()}
 return p

def metric(model,cases,rng_seed,per=4,compare=False,base=None,old=None):
 rng=random.Random(rng_seed);scores=[];by_group=defaultdict(list)
 with torch.inference_mode():
  for id,case in cases:
   for z in range(per):
    p=patch(case,rng,sz=32)
    c=p['cur'][None];p1=p['p1'][None];p2=p['p2'][None];co1=p['c1'][None];co2=p['c2'][None];hi=p['hr'][None]
    bic=F.interpolate(c,scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1)
    pred=model(c,p1,p2,co1,co2,bic)
    def score(x):return 10*np.log10(1/max(float(F.mse_loss(x,hi)),1e-10))
    bi,sc=score(bic),score(pred)
    if compare:
     b=base(c);t=old(c,p1,co1,b)
     rec={'bic':bi,'rne01':score(b),'rne02':score(t),'rne03':sc}
    else:rec={'bic':bi,'rne03':sc}
    scores.append(rec);by_group[byid[id]['group']].append(rec)
 sums={k:float(np.mean([z[k] for z in scores])) for k in scores[0]}
 result={'samples':len(scores),'clips':len({id for id,_ in cases}),'groups':len(by_group),
         'psnr_db':{k:round(v,5) for k,v in sums.items()},
         'gain_vs_bicubic_db':round(sums['rne03']-sums['bic'],5),
         'per_patch_regressions_gt_half_db':int(sum(x['rne03']<x['bic']-.5 for x in scores)),
         'groups_gain_vs_bicubic':int(sum(np.mean([r['rne03']-r['bic'] for r in v])>0 for v in by_group.values()))}
 if compare:
  result['gain_vs_rne02_db']=round(sums['rne03']-sums['rne02'],5)
  result['per_patch_regressions_gt_half_vs_rne02']=int(sum(x['rne03']<x['rne02']-.5 for x in scores))
 return result

start=time.monotonic();data=defaultdict(list)
paths=sorted(cache.glob('*_*.npz'))
for j,path in enumerate(paths):
 id=path.stem.rsplit('_',1)[0]
 if id not in byid:raise ValueError('Unknown cache identifier')
 split=byid[id]['split']
 case=make_case(path,seed+sum(ord(ch)*i for i,ch in enumerate(id,1))*17+int(path.stem.rsplit('_',1)[-1])*31)
 data[split].append((id,case))
 if (j+1)%80==0:print('prepared',j+1,'/',len(paths),'sec',round(time.monotonic()-start,1),flush=True)
for split in ('train','validation','test'):
 expected={x['id'] for x in manifest if x['split']==split}
 actual={id for id,_ in data[split]}
 if expected!=actual:raise ValueError('Not all manifest media were extracted for split '+split)
if len(paths)<len(manifest):raise ValueError('Missing private triplets')
print('CASES_READY', {k:len(v) for k,v in data.items()},round(time.monotonic()-start,2),flush=True)

model=RNE03(); optimizer=torch.optim.Adam(model.parameters(),lr=.001)
print('PARAMETERS',sum(p.numel() for p in model.parameters()),flush=True)
validation_init=metric(model,data['validation'],seed+37)
print('INIT_VALIDATION',json.dumps(validation_init),flush=True)
iterations=args.steps;batch=args.batch
rng=random.Random(seed);training=list(data['train']);rng.shuffle(training);cursor=0
checkpoints=[];best_gain=-100;best=None;best_iter=None;losses=[]
for step in range(1,iterations+1):
 if cursor+batch>len(training):rng.shuffle(training);cursor=0
 batch_cases=training[cursor:cursor+batch];cursor+=batch
 samples=[patch(c,rng,sz=32,augment=True) for _,c in batch_cases]
 def stack(k):return torch.stack([s[k] for s in samples])
 c=stack('cur');o1=stack('p1');o2=stack('p2');co1=stack('c1');co2=stack('c2');hi=stack('hr')
 pred=model(c,o1,o2,co1,co2)
 loss=F.mse_loss(pred,hi)
 optimizer.zero_grad(set_to_none=True);loss.backward();nn.utils.clip_grad_norm_(model.parameters(),1.);optimizer.step()
 losses.append(float(loss.detach()))
 if step in sorted(set([max(20,iterations//4),max(20,iterations//2),max(20,iterations*3//4),iterations])):
  model.eval();validation=metric(model,data['validation'],seed+37)
  checkpoints.append({'step':step,'validation':validation})
  if validation['gain_vs_bicubic_db']>best_gain:
   best_gain=validation['gain_vs_bicubic_db'];best={k:v.detach().cpu().clone() for k,v in model.state_dict().items()};best_iter=step
  print('CHECKPOINT',step,json.dumps(validation),flush=True)
  model.train()
 if step==iterations//2:
  for g in optimizer.param_groups:g['lr']=.0003
model.load_state_dict(best);model.eval()
base=load_rne01(args.base_weights).eval()
old=load_rne02(args.temporal_weights).eval()
# Run the once-designated test set only AFTER training + checkpoint choice.
test=metric(model,data['test'],seed+12001,per=4,compare=True,base=base,old=old)
print('SEALED_TEST',json.dumps(test),flush=True)
weights=root/'rne03_triframe_private.pt';torch.save(model.state_dict(),weights)
report={'version':'RNE 0.3','corpus_videos':len(manifest),'sha_verified':len(manifest),
 'training_videos':len({id for id,_ in data['train']}),'validation_videos':len({id for id,_ in data['validation']}),'test_videos':len({id for id,_ in data['test']}),
 'split_by_conservative_scene_component':True,'groups_total':len({x['group'] for x in manifest}),
 'training_triples':len(data['train']),'validation_triples':len(data['validation']),'test_triples':len(data['test']),
 'source_triplets_natural_motion':True,'degradation_lowres_synthetic':True,
 'architecture':'three real sequential video frames; bidirectional consistency flow gating; trained luminance residual; 2x',
 'parameters':sum(p.numel() for p in model.parameters()),'iterations':iterations,'best_iteration_val':best_iter,
 'validation_init':validation_init,'checkpoints':checkpoints,'test_once':test,
 'loss_begin':round(float(np.mean(losses[:20])),6),'loss_end':round(float(np.mean(losses[-20:])),6),
 'elapsed_seconds':round(time.monotonic()-start,2),'private_weights':weights.name,
 'safety':'research only, no SDK NVIDIA, not deployed, no Git private data publication',
 'limitations':['3-frame source clip references already encoded and may be filtered','no true original HR ground truth for irrevocably missing details','test groups were never used for RNE0.1/0.2 or this training, but grouping only heuristic','PSNR on patches not human realism','no real iPhone WebGPU test, no 4K speed test']}
(root/'rne03_training_report_private.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print('REPORT_DONE',json.dumps({k:report[k] for k in ['corpus_videos','training_videos','validation_videos','test_videos','parameters','iterations','best_iteration_val','elapsed_seconds']}),flush=True)