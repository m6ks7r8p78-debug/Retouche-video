const {test}=require('node:test'),assert=require('node:assert/strict');
const {appliquer}=require('../experiences/nova-detail.js');
function img(w,h,pixel){const data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const q=pixel(x,y);data.set([q[0],q[1],q[2],255],(y*w+x)*4)}return {width:w,height:h,data};}
const gray=v=>[v,v,v];
test('disabled is byte identical and returns the original buffer',()=>{const a=img(8,8,(x,y)=>gray((x*31+y*7)%256));const b=appliquer(a);assert.equal(b.data,a.data);assert.equal(b.report.changedPixels,0)});
test('uniform areas unchanged',()=>{for(const v of [0,16,64,128,224,255]){const a=img(8,8,()=>gray(v));assert.deepEqual(appliquer(a,{enabled:true}).data,a.data)}});
test('low-amplitude noise unchanged',()=>{const a=img(16,16,(x,y)=>gray(128+(x*7+y*3)%5-2));assert.deepEqual(appliquer(a,{enabled:true}).data,a.data)});
test('isolated impulse unchanged',()=>{const a=img(7,7,(x,y)=>gray(x===3&&y===3?160:100));assert.deepEqual(appliquer(a,{enabled:true}).data,a.data)});
test('soft contour changes are bounded and do not modify input',()=>{
 const levels=[24,24,32,96,160,224,231,231],a=img(8,8,x=>gray(levels[x]));const backup=a.data.slice(),r=appliquer(a,{enabled:true});
 assert.ok(r.report.changedPixels>0);assert.ok(r.report.maxChannelDelta<=3);assert.deepEqual(a.data,backup);
 for(let i=0;i<a.data.length;i++)assert.ok(Math.abs(a.data[i]-r.data[i])<=3);
 assert.equal(r.report.reconstructedDetails,false);assert.equal(r.report.resolutionIncreased,false);
});
test('color channel differences are preserved',()=>{
 const levels=[40,40,48,100,160,200,210,210],a=img(8,8,x=>[levels[x]+10,levels[x],levels[x]-10]);const r=appliquer(a,{enabled:true});
 assert.ok(r.report.changedPixels>0);for(let i=0;i<r.data.length;i+=4){assert.equal(r.data[i]-r.data[i+1],10);assert.equal(r.data[i+1]-r.data[i+2],10);assert.equal(r.data[i+3],255)}
});
test('highlights and deep shadows remain unchanged',()=>{const a=img(8,8,(x,y)=>gray((x+y)%2?240:16));assert.deepEqual(appliquer(a,{enabled:true}).data,a.data)});
test('invalid dimensions and transparency rejected',()=>{assert.throws(()=>appliquer({width:4,height:4,data:new Uint8Array(3)},{enabled:true}));const a=img(4,4,()=>gray(128));a.data[3]=0;assert.throws(()=>appliquer(a,{enabled:true}),/alpha/)});
