"""Conservative RNE16 promotion review. Synthetic PSNR is never a production pass."""
from __future__ import annotations
from dataclasses import dataclass
import math

@dataclass(frozen=True)
class GateResult:
    status:str
    blockers:tuple[str,...]
    promotion_allowed:bool=False
    production_deployment_allowed:bool=False


def check_results(training:dict, frozen:dict)->GateResult:
    if training.get('model')!='RNE16-ANCRE' or frozen.get('model')!='RNE16-ANCRE':
        raise ValueError('RNE16 reports required')
    if training.get('source_train')!='procedural synthetic generators ONLY':
        raise ValueError('Training origin cannot be verified')
    if training.get('training_reuses_reserved_41') is not False or frozen.get('source_private_media_used') is not False:
        raise ValueError('Cannot assume reserved/private data protection')
    groups=frozen.get('families',{})
    if not groups or any(not isinstance(v,dict) for v in groups.values()):
        raise ValueError('Missing synthetic families')
    blockers=['no_real_before_after_video_ground_truth','no_native_temporal_consistency_test','no_iphone_safari_test']
    for name,g in sorted(groups.items()):
        gain=g.get('dual_gain_vs_bicubic_db')
        if type(gain) not in (int,float) or not math.isfinite(gain):
            raise ValueError('Bad PSNR metric')
        if gain<=0:blockers.append(f'no_positive_mean_gain:{name}')
        if g.get('severe_losses_gt_0_5db',0)>0:
            blockers.append(f'severe_loss_on_frozen_test:{name}')
    return GateResult('BLOCKED_RESEARCH_ONLY',tuple(blockers))
