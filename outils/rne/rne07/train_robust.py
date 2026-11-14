"""RNE07 paired private A/B training with 2 temporal source windows and 4 LR modes.

Uses ONLY the 157 historical consented sources via an external private manifest.
All 41 newer holdout uploads are explicitly OUT of training. Prior RNE04 already
saw historical scenes: metrics here are INTERNAL and CANNOT validate generalization.
No public media, frame cache, manifest or trained model weights.
"""
from __future__ import annotations
import argparse,hashlib,json,random,time,sys
from pathlib import Path
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor,as_completed
import cv2,numpy as np,torch
from torch.nn import functional as F
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from triad import RNE03,alignment
from degradations import degrade,MODES

SOURCE_MODES={'control':('clean_area','jpeg55','blur_noise','clean_area'),
              'robust_candidate':('clean_area','jpeg55','blur_noise','h264_crf34')}

def validate_private_manifest(path:Path,cache:Path):
    rows=json.loads(path.read_text(encoding='utf8'))
    if not isinstance(rows,list) or len(rows)!=157:raise ValueError('Historical corpus incomplete')
    seen_sha=set();ids=[];ids_all=[]
    for row in rows:
        if row.get('private_training_consent') is not True or row.get('publication') is not False:
            raise PermissionError('Every source requires private consent and forbids publication')
        p=Path(row['path']);h=hashlib.sha256()
        with p.open('rb') as f:
            for b in iter(lambda:f.read(1<<20),b''):h.update(b)
        if h.hexdigest()!=row['sha256']:raise ValueError('Source integrity mismatch')
        if row['sha256'] not in seen_sha:seen_sha.add(row['sha256']);ids.append(row['id'])
        ids_all.append(row['id'])
    if len(seen_sha)!=154 or len(set(ids_all))!=157:
        raise ValueError('Unexpected historical corpus composition')
    for ident in ids:
        for moment in (0,1):
            if not (cache/f'{ident}_{moment:02d}.npz').is_file():
                raise ValueError('Missing private video triplet')
    return ids

def rgb(bgr):
    return torch.from_numpy(np.ascontiguousarray(bgr[:,:,::-1])).permute(2,0,1).float()/255

def make_example(path:Path,mode:str,seed:int,teacher:RNE03,patch=96):
    with np.load(path,allow_pickle=False) as z:
        frames=[z[k] for k in ('prev2','prev1','current')]
    h,w=frames[0].shape[:2]
    if min(h,w)<patch:raise ValueError('Source patch too small')
    rng=np.random.default_rng(seed)
    x=int(rng.integers(w-patch+1));y=int(rng.integers(h-patch+1))
    hr=[np.ascontiguousarray(f[y:y+patch,x:x+patch]) for f in frames]
    older,prev,cur=degrade(hr,mode,seed+13)
    one,c1=alignment(cur,prev);two,c2=alignment(cur,older)
    prev2,pc=alignment(prev,older)
    with torch.no_grad():
        a=rgb(prev)[None];b=rgb(prev2)[None]
        confidence=torch.from_numpy(pc.copy())[None,None]
        predicted=teacher(a,b,b,confidence,confidence).squeeze(0)
        bic=F.interpolate(a,scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1).squeeze(0)
        residual=np.ascontiguousarray((predicted-bic).permute(1,2,0).numpy(),dtype=np.float32)
    if np.array_equal(cur,prev):flow=np.zeros((*cur.shape[:2],2),np.float32)
    else:
        flow=cv2.calcOpticalFlowFarneback(cv2.cvtColor(cur,cv2.COLOR_BGR2GRAY),
                 cv2.cvtColor(prev,cv2.COLOR_BGR2GRAY),None,.5,3,15,3,5,1.2,0)
    h,w=cur.shape[:2];yy,xx=np.mgrid[0:2*h,0:2*w].astype(np.float32)
    flow=cv2.resize(flow,(2*w,2*h),interpolation=cv2.INTER_LINEAR)*2
    xx+=flow[:,:,0];yy+=flow[:,:,1]
    prior=cv2.remap(residual,xx,yy,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
    trust=cv2.resize(c1,(2*w,2*h),interpolation=cv2.INTER_LINEAR)
    trust*=((xx>2)&(xx<2*w-3)&(yy>2)&(yy<2*h-3))
    return {'cur':rgb(cur),'one':rgb(one),'two':rgb(two),
       'c1':torch.from_numpy(c1.copy())[None],
       'c2':torch.from_numpy(c2.copy())[None],'high':rgb(hr[-1]),
       'prior':torch.from_numpy(np.ascontiguousarray(prior)).permute(2,0,1),
       'trust':torch.from_numpy(np.ascontiguousarray(trust))[None],'mode':mode}

def pack(rows,key):return torch.stack([r[key] for r in rows])

@torch.inference_mode()
def measure(model,examples):
    model.eval();out=defaultdict(lambda:defaultdict(list))
    for off in range(0,len(examples),16):
        rows=examples[off:off+16];g=lambda k:pack(rows,k)
        cur,one,two,c1,c2,high=[g(k) for k in ('cur','one','two','c1','c2','high')]
        pred=model(cur,one,two,c1,c2)
        bic=F.interpolate(cur,scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1)
        pscore=-10*torch.log10(((pred-high)**2).flatten(1).mean(1).clamp(min=1e-10))
        bscore=-10*torch.log10(((bic-high)**2).flatten(1).mean(1).clamp(min=1e-10))
        dx=torch.abs((pred[:,:,:,1:]-pred[:,:,:,:-1])-
                     (high[:,:,:,1:]-high[:,:,:,:-1])).flatten(1).mean(1)
        dy=torch.abs((pred[:,:,1:,:]-pred[:,:,:-1,:])-
                     (high[:,:,1:,:]-high[:,:,:-1,:])).flatten(1).mean(1)
        edge=(dx+dy)/2
        motion=(torch.abs((pred-bic)-g('prior'))*g('trust')).flatten(1).sum(1)/(
            g('trust').flatten(1).sum(1)*3+1e-6)
        for j,r in enumerate(rows):
            obj=out[r['mode']]
            for key,v in (('psnr',pscore[j]),('bic',bscore[j]),
                          ('edge',edge[j]),('motion',motion[j])):obj[key].append(float(v))
    result={}
    for mode,values in out.items():
        p=np.asarray(values['psnr']);b=np.asarray(values['bic'])
        result[mode]={'samples':len(p),'psnr_db':round(float(p.mean()),5),
           'psnr_bicubic_db':round(float(b.mean()),5),
           'gain_vs_bicubic_db':round(float((p-b).mean()),5),
           'edge_gradient_mae':round(float(np.mean(values['edge'])),6),
           'detail_motion_proxy_mae':round(float(np.mean(values['motion'])),6),
           'regressions_gt_0_5db_vs_bicubic':int(((p-b)<-.5).sum())}
    return result

def paired_train(manifest:Path,cache:Path,checkpoint:Path,output:Path,
                 steps:int=120,batch:int=8,seed:int=707):
    if not 20<=steps<=1000 or not 1<=batch<=16 or steps*batch<154*4:
        raise ValueError('Invalid budget; must cover every historical video')
    output=output.resolve()
    if any((p/'.git').is_dir() for p in (output,*output.parents)):
        raise ValueError('Private weights cannot be saved inside a Git checkout')
    ids=validate_private_manifest(manifest,cache)
    torch.set_num_threads(2);cv2.setNumThreads(1);torch.manual_seed(seed)
    base=torch.load(checkpoint,weights_only=True,map_location='cpu')
    teacher=RNE03()
    if not isinstance(base,dict) or set(base)!=set(teacher.state_dict()):
        raise ValueError('Incompatible private checkpoint')
    teacher.load_state_dict(base,strict=True);teacher.eval()
    t0=time.monotonic()
    cache_dir=output.parent/'examples_PRIVATE';cache_dir.mkdir(parents=True,exist_ok=True)
    jobs=[(moment,i,ident,j,mode) for moment in range(2)
          for i,ident in enumerate(ids) for j,mode in enumerate(MODES)]
    def build(job):
        moment,i,ident,j,mode=job
        path=cache_dir/f'{ident}_{moment}_{mode}.pt'
        if not path.is_file():
            example=make_example(cache/f'{ident}_{moment:02d}.npz',mode,
                                 seed+100000*moment+1009*i+j,teacher)
            torch.save(example,path)
        return (moment,i,mode),path
    examples={}
    with ThreadPoolExecutor(max_workers=6) as pool:
        for job in as_completed([pool.submit(build,j) for j in jobs]):
            key,p=job.result()
            examples[key]=torch.load(p,weights_only=True,map_location='cpu')
    order=list(range(154*4));rng=random.Random(seed);rng.shuffle(order)
    while len(order)<steps*batch:
        order.extend(rng.sample(range(154*4),min(154*4,steps*batch-len(order))))
    models={};training={}
    for name,modes in SOURCE_MODES.items():
        net=RNE03();net.load_state_dict(base,strict=True);net.train()
        optimizer=torch.optim.Adam(net.parameters(),lr=.00008)
        losses=[]
        for step in range(steps):
            rows=[examples[(0,ix//4,modes[ix%4])]
                  for ix in order[step*batch:(step+1)*batch]]
            g=lambda k:pack(rows,k)
            cur,one,two,c1,c2,high=[g(k) for k in ('cur','one','two','c1','c2','high')]
            pred=net(cur,one,two,c1,c2)
            bic=F.interpolate(cur,scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1)
            spatial=F.mse_loss(pred,high)
            temporal=(torch.abs((pred-bic)-g('prior'))*g('trust')).sum()/(
                       g('trust').sum()*3+1e-6)
            loss=spatial+.025*temporal
            optimizer.zero_grad(set_to_none=True);loss.backward()
            torch.nn.utils.clip_grad_norm_(net.parameters(),1.);optimizer.step()
            losses.append(float(loss.detach()))
        net.cpu().eval();models[name]=net
        output.mkdir(parents=True,exist_ok=True)
        torch.save(net.state_dict(),output/f'rne07_{name}_PRIVATE.pt')
        training[name]={'first30_loss':round(float(np.mean(losses[:30])),7),
                        'last30_loss':round(float(np.mean(losses[-30:])),7)}
    audit=[examples[(1,i,mode)] for i in range(154) for mode in MODES]
    metrics={'frozen_rne04':measure(teacher,audit)}
    for name,model in models.items():metrics[name]=measure(model,audit)
    changes={}
    for mode in MODES:
        old=metrics['control'][mode];new=metrics['robust_candidate'][mode]
        changes[mode]={
          'delta_psnr_robust_minus_control_db':round(new['psnr_db']-old['psnr_db'],5),
          'delta_edge_robust_minus_control':round(new['edge_gradient_mae']-old['edge_gradient_mae'],7),
          'delta_motion_proxy_robust_minus_control':round(new['detail_motion_proxy_mae']-old['detail_motion_proxy_mae'],7),
          'gain_robust_vs_frozen_db':round(new['psnr_db']-metrics['frozen_rne04'][mode]['psnr_db'],5)}
    from robust_gate import evaluate
    decision=evaluate(changes)
    report={'protocol':'RNE07 private historical in-sample A/B with real H264 simulation',
       'catalogue_checked':157,'unique_sources':154,'triplets_extracted':308,
       'training_examples':616,'audit_examples':len(audit),
       'true_h264_encoding_used':True,'new41_trained':False,
       'same_initial_weights_batch_order_and_optimizer':True,
       'steps_per_arm':steps,'batch':batch,'training_loss':training,
       'metrics_on_old_seen_scenes':metrics,'deltas_by_mode':changes,
       'internal_gate':decision,'candidate_promoted':False,
       'real_video_holdout_proof':False,'iphone_safari_tested':False,
       'elapsed_seconds':round(time.monotonic()-t0,2)}
    output.mkdir(parents=True,exist_ok=True)
    (output/'report_PRIVATE.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser()
    for name in ('manifest','cache','checkpoint','output'):
        p.add_argument('--'+name,type=Path,required=True)
    p.add_argument('--steps',type=int,default=120)
    p.add_argument('--batch',type=int,default=8)
    p.add_argument('--private-training-authorized',action='store_true',required=True)
    p.add_argument('--acknowledge-in-sample',action='store_true',required=True)
    a=p.parse_args()
    if not(a.private_training_authorized and a.acknowledge_in_sample):
        raise PermissionError('Private training permission and scope required')
    report=paired_train(a.manifest,a.cache,a.checkpoint,a.output,a.steps,a.batch)
    print(json.dumps({'deltas_by_mode':report['deltas_by_mode'],
        'internal_gate':report['internal_gate']},ensure_ascii=False,indent=2))
