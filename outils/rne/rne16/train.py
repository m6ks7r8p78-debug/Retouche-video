"""Train from scratch on synthetic procedural scenes. Zero personal-media access.

Losses must not be tuned on held-out procedural image families. Saves the
weights ONLY to user-private file, not to GitHub or any application.
"""
from __future__ import annotations
import argparse,json,random,time,math
from pathlib import Path
import torch
from torch.nn import functional as F
from rne16 import RNE16ANCRE,psnr,state_for_private_saving
from procedural import dataset,TRAIN_FAMILIES,TEST_FAMILIES

def batchify(data,indices):
    return tuple(torch.stack([data[i][j] for i in indices]) for j in range(4))

def eval_model(model,items):
    model.eval()
    data=[]
    with torch.no_grad():
        for n in range(0,len(items),16):
            c,p,t,hr=tuple(torch.stack([s[i] for s in items[n:n+16]]) for i in range(4))
            bic=F.interpolate(c,scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1)
            single=model(c)
            dual=model(c,p,t)
            for j in range(len(c)):
                data.append({'bic':psnr(bic[j],hr[j]),'spatial':psnr(single[j],hr[j]),'dual':psnr(dual[j],hr[j]),'occlusion':int((t[j]==0).any())})
    model.train()
    return {key:round(sum(x[key] for x in data)/len(data),5) for key in ('bic','spatial','dual')}|{
       'n':len(data),'dual_better_than_bic':sum(x['dual']>x['bic'] for x in data),
       'dual_better_than_spatial':sum(x['dual']>x['spatial'] for x in data),
       'dual_losses_more_than_half_db':sum(x['dual']<x['bic']-.5 for x in data),
       'sample_variants':[list(TEST_FAMILIES)[i%len(TEST_FAMILIES)] for i in range(min(3,len(data)))]}

def run(out:Path,steps:int=280):
    torch.set_num_threads(2)
    torch.manual_seed(16);random.seed(16)
    model=RNE16ANCRE()
    train=dataset(450,True,side=48)
    # Holdout families are not touched until all training has completed.
    opt=torch.optim.Adam(model.parameters(),lr=.001)
    tic=time.perf_counter(); curve=[]
    for i in range(steps):
        ids=[random.randrange(len(train)) for _ in range(12)]
        c,p,t,hr=batchify(train,ids)
        bic=F.interpolate(c,scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1)
        spatial=model(c)
        dual=model(c,p,t)
        # Spatial arm prevents temporal reliance for normal frames or motion errors.
        loss=F.mse_loss(dual,hr)+.4*F.mse_loss(spatial,hr)+.002*torch.mean((dual-bic)**2)
        # Train conservatively; do not add perceptual GAN to invent pixel details.
        opt.zero_grad(set_to_none=True)
        loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1.)
        opt.step()
        if i in (0,9,49,99,199,steps-1):
            curve.append({'step':i+1,'loss':round(float(loss.detach()),7)})
    elapsed=time.perf_counter()-tic
    test=dataset(150,False,side=48)
    scores=eval_model(model,test)
    # no selection on holdout; one fixed training configuration only
    out.mkdir(parents=True,exist_ok=True)
    torch.save(state_for_private_saving(model),out/'rne16_ancre_synthetic_only_weights.pt')
    meta={'project':'RetoucheProAI','model':'RNE16-ANCRE','status':'EXPERIMENTAL_NOT_DEPLOYED',
          'trained_from_scratch':True,'personal_corpus_used':False,
          'source_train':'procedural synthetic generators ONLY','training_families':TRAIN_FAMILIES,
          'heldout_synthetic_families':TEST_FAMILIES,'train_cases':len(train),'test_cases':len(test),
          'steps':steps,'random_seed':16,'elapsed_train_seconds':round(elapsed,2),
          'train_loss_curve':curve,'holdout_psnr_db':scores,
          'parameters':sum(p.numel() for p in model.parameters()),
          'limitations':['Same overall procedural engine but different families and seeds',
            'No video-native temporal consistency benchmark','No real natural-video validation',
            'No AR original-filtered ground truth', 'No Safari iPhone validation',
            'No identity or anatomy guarantees','No private-weight publication or deployment'],
          'training_reuses_reserved_41':False,'deploy_allowed':False}
    (out/'train_report.json').write_text(json.dumps(meta,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps(meta,ensure_ascii=False))
    return meta

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--steps',type=int,default=280)
    a=parser.parse_args();run(a.out,a.steps)
