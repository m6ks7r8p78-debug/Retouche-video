const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'..');
const c=require(fs.existsSync(path.join(base,'p10_consensus_core.js'))?'../p10_consensus_core.js':'../public/p10_consensus_core.js');
const s={schema:'retouche-cinema-p9-private-human-annotations-v1',source:{local_filename:'demo-fictif.mp4',duration_s:8,video_id:'F001'},annotations:[{channel:'levres',phase:'contact',visibility:'observe',start_s:2,end_s:3,point:[.5,.5]}, {channel:'fumee',phase:'expiration',visibility:'observe',start_s:4,end_s:5,point:[.5,.55],smoke_origin:'mouth'}]};
const copy=()=>JSON.parse(JSON.stringify(s));
test('two identical annotations',()=>{const r=c.compare(copy(),copy());assert.equal(r.counts.matched,2);assert.equal(r.counts.disagreements,0)});
test('not a truth or training gate',()=>{const r=c.compare(copy(),copy());assert.equal(r.ready_for_training,false);assert.equal(r.consensus_proves_realism,false)});
test('mismatched clip id rejected',()=>{const b=copy();b.source.video_id='OTHER';assert.throws(()=>c.compare(copy(),b))});
test('timing conflict',()=>{const b=copy();b.annotations[0].start_s=2.3;assert.ok(c.compare(copy(),b).disagreements.some(x=>x.issues.includes('décalage temporel')))});
test('spatial conflict',()=>{const b=copy();b.annotations[0].point=[.95,.95];assert.ok(c.compare(copy(),b).disagreements.some(x=>x.issues.includes('position spatiale différente')))});
test('smoke source conflict',()=>{const b=copy();b.annotations[1].smoke_origin='tip';assert.ok(c.compare(copy(),b).disagreements.some(x=>x.issues.includes('origine de fumée différente')))});
test('non-observed mismatch',()=>{const b=copy();b.annotations[0].visibility='incertain';assert.ok(c.compare(copy(),b).counts.disagreements)});
test('unmatched observation',()=>{const b=copy();b.annotations.pop();assert.ok(c.compare(copy(),b).disagreements.some(x=>x.b_index===null))});
test('invalid coordinates',()=>{const b=copy();b.annotations[0].point=[-1,2];assert.throws(()=>c.validate(b))});
test('duplicate matches only once',()=>{const b=copy();b.annotations.push({...b.annotations[0]});const r=c.compare(copy(),b);assert.equal(r.counts.matched,2);assert.ok(r.counts.disagreements)});

