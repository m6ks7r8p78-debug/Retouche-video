import test from "node:test";
import assert from "node:assert/strict";
import C from "../experiences/nova-color709.js";
function square(r,g,b,a=255){
 const data=new Uint8ClampedArray(16);
 for(let i=0;i<4;i++){data[i*4]=r;data[i*4+1]=g;data[i*4+2]=b;data[i*4+3]=a}
 return data;
}
test("NOVA BT709 : noir, blanc, gris sRGB -> Y' légal et chroma neutre",()=>{
 const black=C.convertir(square(0,0,0),2,2);
 assert.deepEqual(Array.from(black),[16,16,16,16,128,128]);
 const white=C.convertir(square(255,255,255),2,2);
 assert.deepEqual(Array.from(white),[235,235,235,235,128,128]);
 const gray=C.convertir(square(128,128,128),2,2);
 assert.ok(gray[0]>16&&gray[0]<235);
 assert.equal(gray[4],128);assert.equal(gray[5],128);
});
test("NOVA BT709 : chromas opposés et pixels bornés",()=>{
 const red=C.convertir(square(255,0,0),2,2);
 const blue=C.convertir(square(0,0,255),2,2);
 assert.ok(red[5]>128&&red[4]<128);
 assert.ok(blue[4]>128&&blue[5]<128);
 for(const data of [red,blue])for(const x of data)assert.ok(x>=16&&x<=240);
});
test("NOVA BT709 : formats incomplets, alpha, surdimensionnement refusés",()=>{
 assert.throws(()=>C.convertir(square(255,0,0,0),2,2),/alpha/);
 assert.throws(()=>C.convertir(square(1,2,3),3,2),/dimensions/);
 assert.throws(()=>C.convertir(new Uint8Array(5),2,2),/RGBA/);
 assert.throws(()=>C.convertir(new Uint8Array(640*362*4),640,362),/budget/);
});
