const {test}=require('node:test'),assert=require('node:assert/strict');
const color=require('../experiences/nova-hd-color.js');
const evidence={confirmed:true,sourceMatrix:6,expectedMatrix:'smpte170m',expectedPrimaries:'bt709',sourceFullRange:false,sourceTransferCode:1};
function frame(format='NV12',extra={}) {return {format,colorSpace:{primaries:'bt709',transfer:'bt709',matrix:'bt709',fullRange:false,...extra},allocationSize(){throw Error('must not copy YUV')},copyTo(){throw Error('must not copy YUV')}};}
for(const fmt of ['NV12','I420',null])test('native mismatch preserves pixels and flags uncertainty '+fmt,async()=>{
 const f=frame(fmt);const r=await color.imagePourRendu(f,evidence,class {constructor(){throw Error('must not retag')}});
 assert.equal(r.frame,f);assert.equal(r.owned,false);assert.equal(r.proof.sourceMismatch,true);
 assert.equal(r.proof.sourceRetaggingApplied,false);assert.equal(r.proof.matrixConversion,false);
});
test('matching source keeps existing direct path',async()=>{
 const f=frame('I420',{matrix:'smpte170m'});const r=await color.imagePourRendu(f,evidence);
 assert.equal(r.frame,f);assert.equal(r.owned,false);assert.notEqual(r.proof.sourceMismatch,true);
});
test('HDR remains refused',async()=>{await assert.rejects(color.imagePourRendu(frame('NV12',{transfer:'smpte2084'}),evidence),/HDR/);});
test('10 bit mismatch remains refused',async()=>{await assert.rejects(color.imagePourRendu(frame('I420P10'),evidence));});
test('unproven source and incomplete frame remain refused',async()=>{await assert.rejects(color.imagePourRendu(frame('NV12',{primaries:null,transfer:null,fullRange:null}),{...evidence,confirmed:false}));});
