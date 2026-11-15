"""Create two entirely synthetic camera-cut examples for the local P4 continuity QA.
This script uses flat graphic shapes, NO human photos, AI weights or network access.
"""
import hashlib
import json
from pathlib import Path
import sys
import cv2
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'studio-cinema/p4'))
import continuity_gate as gate

root=Path(__file__).resolve().parent
manifest=gate.load_json(root/'manifest_p2.json')
a,b=[c['clip_id'] for c in manifest['clips']]

def render(path,color):
    path.parent.mkdir(parents=True,exist_ok=True)
    writer=cv2.VideoWriter(str(path),cv2.VideoWriter_fourcc(*'mp4v'),12,(320,180))
    assert writer.isOpened(),path
    for i in range(36):
        img=np.full((180,320,3),(33,40,44),np.uint8)
        cv2.rectangle(img,(110,45),(210,151),color,-1)
        cv2.circle(img,(160,59),14,(160,165,169),-1)
        cv2.line(img,(136,95),(118,129),(210,210,210),3)
        cv2.line(img,(184,95),(202,129),(210,210,210),3)
        writer.write(img)
    writer.release()

def run(name,variant_color):
    base=root/name
    render(base/(a+'.mp4'),(40,45,214))
    render(base/(b+'.mp4'),variant_color)
    ev={'schema_version':'cinema-p4-evidence-v01','media_transfer_approved':False,
        'clip_sha256':{id:gate.sha256_file(base/(id+'.mp4')) for id in [a,b]},
        'checks':[{'check_id':'actor_clothing','from_clip':a,'to_clip':b,
            'entity_id':'character_01','transition':'continuous',
            'regions':{'before':[.33,.2,.34,.7],'after':[.33,.2,.34,.7]}}]}
    (base/'evidence.json').write_text(json.dumps(ev,indent=2,ensure_ascii=False)+'\n')
    report=gate.assess(manifest,ev,base)
    (base/'report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
    return report['checks'][0]['status'],report['checks'][0].get('metrics')

if __name__=='__main__':
    print('même tenue :',run('same_clothes',(40,45,214)))
    print('tenue différente :',run('changed_clothes',(215,50,40)))
