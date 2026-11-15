"""Merge independently executed deterministic batches without hiding any cases."""
from __future__ import annotations
import json
import statistics
import sys
from pathlib import Path


def merge(paths, output):
    inputs=[json.loads(Path(p).read_text()) for p in paths]
    if not inputs or any(x['schema']!=inputs[0]['schema'] for x in inputs):raise ValueError('incompatible batch schemas')
    seeds=[];rows=[];ablations=[];meds=[];p95=[]
    for obj in inputs:
        if set(obj['seeds']) & set(seeds): raise ValueError('overlapping seeds')
        seeds.extend(obj['seeds']);rows.extend(obj['rows']);ablations.extend(obj['ablations'])
        meds.append(obj['runtime_ms']['median']);p95.append(obj['runtime_ms']['p95'])
    try:
        from benchmark_depthmotion import summarize
    except ImportError:
        sys.path.insert(0,str(Path(__file__).resolve().parent));from benchmark_depthmotion import summarize
    out={**inputs[0],'seeds':seeds,'rows':rows,'ablations':ablations,
         'result':summarize({},rows),'runtime_ms':{'batch_median_median':statistics.median(meds),
          'batch_p95_max':max(p95),'note':'timings are per-batch summaries, not pooled timings'},
         'integrity':{'rows_equal_seeds_times_cases':len(rows)==len(seeds)*11,
                      'ablations_equal_seeds_times_four':len(ablations)==len(seeds)*4}}
    Path(output).write_text(json.dumps(out,indent=2,ensure_ascii=False)+'\n')
    return out

if __name__=='__main__':
    if len(sys.argv)<4:raise SystemExit('usage: merge_batches out.json batch1.json batch2.json...')
    obj=merge(sys.argv[2:],sys.argv[1]);print(json.dumps({'summary':obj['result'],'integrity':obj['integrity']},indent=2))