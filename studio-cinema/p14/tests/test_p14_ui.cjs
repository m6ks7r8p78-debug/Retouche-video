const assert=require('node:assert/strict'),test=require('node:test'),p=require('../p14_ui_core.js');
const row={video_id:'DEMO',split:'train',scene_group:'fictional',source_filename_PRIVATE:'fiction.mp4',start_s:2,end_s:4,visual:{series:[]},audio:{rms:[]}};
const report={schema:'retouche-cinema-p14-visual-audio-candidates-v1',results:[row]};
const event={t_s:2.3,channel:'levres',observation:'contact',note:'à revoir'};
test('accept validated report',()=>assert.equal(p.validateReport(report),true));
test('reject bad report schema',()=>assert.throws(()=>p.validateReport({...report,schema:'made-up'})));
test('reject path traversal',()=>assert.throws(()=>p.validateReport({...report,results:[{...row,source_filename_PRIVATE:'../test.mp4'}]})));
test('reject absurd window',()=>assert.throws(()=>p.validateReport({...report,results:[{...row,end_s:20}]})));
test('allow manual observation',()=>assert.equal(p.prepareExport(row,[event]).observations.length,1));
test('refuse out-of-window time',()=>assert.throws(()=>p.prepareExport(row,[{...event,t_s:9}])));
test('refuse invalid channel',()=>assert.throws(()=>p.prepareExport(row,[{...event,channel:'identity'}])));
test('no proof of truth',()=>assert.equal(p.prepareExport(row,[event]).confirmed_ground_truth,false));
test('no pixels',()=>assert.equal(p.prepareExport(row,[event]).pixels_included,false));
test('too long note blocked',()=>assert.throws(()=>p.prepareExport(row,[{...event,note:'x'.repeat(401)}])));

