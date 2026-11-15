"""Pre-fixed group-exclusive five-fold evaluation of RNE 0.8 quality routing."""
from __future__ import annotations
import argparse,json,hashlib
from collections import defaultdict
from pathlib import Path
import numpy as np
from sklearn.model_selection import GroupKFold
from adaptive_selector import FEATURE_NAMES,train_policy,save_policy


def evaluate(data,output,weights):
    raw=json.loads(Path(data).read_text())
    rows=raw['rows']
    if len(rows)!=1232 or raw['distinct_sources']!=154 or raw['features']!=list(FEATURE_NAMES):
        raise ValueError('Expected intact 154 historic clips with 2 times and 4 modes')
    id_set={r['opaque_id'] for r in rows}
    if len(id_set)!=154:raise ValueError('Incomplete historic clips')
    by_key={(r['opaque_id'],r['moment'],r['mode']) for r in rows}
    if len(by_key)!=len(rows) or any((name,m,mode) not in by_key for name in id_set for m in (0,1) for mode in ('clean_area','jpeg55','blur_noise','h264_crf34')):
        raise ValueError('Missing a historical audit/training row')
    tr=[r for r in rows if r['moment']==0]
    vl=[r for r in rows if r['moment']==1]
    groups=np.array([r['group'] for r in vl])
    gid=set(groups)
    if len(gid)<5:raise ValueError('Not enough scene groups')
    Xv=np.array([r['features'] for r in vl]);yv=np.array([r['gain_db'] for r in vl])
    modes=np.array([r['mode'] for r in vl])
    train_by_group=defaultdict(list)
    for r in tr:train_by_group[r['group']].append(r)
    predictions=np.full(len(vl),np.nan)
    train_seen_in_fold=[];folds=[]
    for fold,(idx_tr,idx_te) in enumerate(GroupKFold(n_splits=5).split(Xv,yv,groups)):
        train_groups=set(groups[idx_tr]);eval_groups=set(groups[idx_te]);assert not train_groups&eval_groups
        training=[r for g in train_groups for r in train_by_group[g]]
        pol=train_policy([r['features'] for r in training],[r['gain_db'] for r in training],ridge_lambda=35.)
        predictions[idx_te]=pol.predict_expected_gain(Xv[idx_te])
        folds.append({'fold':fold,'training_groups':len(train_groups),'test_groups':len(eval_groups),
                      'evaluation_videos':len({vl[i]['opaque_id'] for i in idx_te})})
    assert np.isfinite(predictions).all()
    choices=predictions>=.20
    def result(ids):
        v=yv[ids];pred=predictions[ids];c=choices[ids]
        orig_reg=int((v<-.5).sum())
        return {'samples':len(v),'rneselected':int(c.sum()),
                'original_rne_mean_gain_db':round(float(np.mean(v)),5),
                'selector_mean_gain_db':round(float(np.mean(v*c)),5),
                'always_rne_regressions_below_minus_half':orig_reg,
                'selector_regressions_below_minus_half':int(((v<-.5)&c).sum()),
                'fraction_passed_through_bicubic':round(float(np.mean(~c)),4),
                'selector_better_than_always_rne_on_mean':bool(np.mean(v*c)>np.mean(v)),
                'oracle_gain_db_upper_bound_not_deployable':round(float(np.mean(np.maximum(0.,v))),5)}
    output_doc={'protocol':'RNE08 pre-fixed five-fold scene-group-exclusive quality routing (controller only). RNE04 weights saw old corpus.',
     'historical_corpus_sources':154,'historical_corpus_files':157,'no_training_on_new41':True,
     'features_no_reference_inference':list(FEATURE_NAMES),'quality_target_PSNR_only_for_private_train':True,
     'validation_moment_not_used_in_policy_fit':1,
     'threshold_db_preset':.20,'ridge_lambda_preset':35.0,
     'folds':folds,'results':{'all':result(np.arange(len(vl))),
                    **{k:result(np.where(modes==k)[0]) for k in sorted(set(modes))}},
     'not_independent_for_neural_model':True,'automatic_deployment':False,
     'not_evaluated_on_new41':True,'iphone_safari_tested':False,
     'inference_safety':'Bicubic by default; only manually opted-in lab preview; no file export',
     'controller_rne_PSRN_safety_not_verified_on_new_scenes':True}
    pol=train_policy([r['features'] for r in tr],[r['gain_db'] for r in tr],ridge_lambda=35.)
    save_policy(pol,weights)
    path=Path(output);path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(output_doc,indent=2),encoding='utf8')
    print(json.dumps(output_doc,indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser()
    for v in ('input','output','weights'):p.add_argument('--'+v,required=True)
    a=p.parse_args();evaluate(a.input,a.output,a.weights)