/* RetoucheProAI NOVA 0.5 : démultiplexage MP4 expérimental en lecture.
 * Adapté de demuxVideo() d'app.js (même dépôt). Tables stts/ctts/stsc/stsz/
 * stco/co64/stss, edit-list simple et timestamps PTS en microsecondes.
 * Pour les formats/compositions non couverts : retourner null, pas de faux PTS.
 * Vidéos privées jamais chargées en réseau ; lecture par file.slice() local.
 */
var NOVA_DEMUX=(()=>{
"use strict";
/* Orientation iPhone : seulement les matrices orthogonales de 90 degrés,
 * y compris miroir. Refuser sans inventer d'autres pixels les matrices
 * avec shear, perspective, mise à l'échelle ou valeurs imprécises.
 */
function analyserOrientation(W,H,m){
 if(!Number.isInteger(W)||!Number.isInteger(H)||W<2||H<2||
    !Array.isArray(m)||m.length!==9||!m.every(Number.isFinite))return null;
 const near=(v,x)=>Math.abs(v-x)<2/65536;
 if(!near(m[2],0)||!near(m[5],0)||!near(m[8],1))return null;
 const [a,b,,c,d]=m;
 const q=[a,b,c,d].map(x=>Math.round(x));
 if(q.some((x,i)=>![-1,0,1].includes(x)||!near([a,b,c,d][i],x)))return null;
 const [A,B,C,D]=q;
 if(Math.abs(A*D-B*C)!==1||Math.abs(A)+Math.abs(B)!==1||
    Math.abs(C)+Math.abs(D)!==1)return null;
 const corners=[[0,0],[W,0],[0,H],[W,H]];
 const xs=corners.map(([x,y])=>A*x+C*y),ys=corners.map(([x,y])=>B*x+D*y);
 const minx=Math.min(...xs),miny=Math.min(...ys);
 const dw=Math.max(...xs)-minx,dh=Math.max(...ys)-miny;
 if(dw<2||dh<2||dw*dh!==W*H)return null;
 // Les translations tkhd ne sont pas de simples décorations : refuser
 // tout décalage non canonique, sinon l'export pourrait recadrer la vidéo.
 // Zéro (matrices anciennes) ou le décalage normalisé exact sont admis.
 const tx=minx===0?0:-minx,ty=miny===0?0:-miny;
 if(!(near(m[6],0)||near(m[6],tx))||
    !(near(m[7],0)||near(m[7],ty)))return null;
 return Object.freeze({mat:[A,B,C,D,tx,ty],dw,dh,
   mirrored:A*D-B*C<0,oriented:dw!==W||dh!==H});
}
async function analyser(file){
  const rd=async(a,b)=>new DataView(await file.slice(a,b).arrayBuffer());
  let off=0,moov=null;
  while(off<file.size){
    const d=await rd(off,Math.min(off+16,file.size));if(d.byteLength<8)break;
    let size=d.getUint32(0);const type=String.fromCharCode(d.getUint8(4),d.getUint8(5),d.getUint8(6),d.getUint8(7));let hdr=8;
    if(size===1){size=Number(d.getBigUint64(8));hdr=16}else if(size===0)size=file.size-off;
    if(type==="moov"){moov=[off+hdr,off+size];break}
    if(size<8)break;off+=size;
  }
  if(!moov)return null;
  const buf=new Uint8Array(await file.slice(moov[0],moov[1]).arrayBuffer()),dv=new DataView(buf.buffer);
  const tp=o=>String.fromCharCode(buf[o],buf[o+1],buf[o+2],buf[o+3]);
  const kids=(s,e)=>{const r=[];let o=s;while(o+8<=e){let sz=dv.getUint32(o);const t=tp(o+4);let h=8;if(sz===1){sz=Number(dv.getBigUint64(o+8));h=16}else if(sz===0)sz=e-o;if(sz<8||o+sz>e)break;r.push({t,s:o+h,e:o+sz,b:o});o+=sz}return r};
  const find=(s,e,path)=>{let cur=[{s,e}];for(const p of path){const nx=[];for(const c of cur)for(const k of kids(c.s,c.e))if(k.t===p)nx.push(k);cur=nx}return cur};
  for(const trak of find(0,buf.length,["trak"])){
    const hd=find(trak.s,trak.e,["mdia","hdlr"])[0];if(!hd||tp(hd.s+8)!=="vide")continue;
    const mh=find(trak.s,trak.e,["mdia","mdhd"])[0];if(!mh)return null;
    const ts=buf[mh.s]===1?dv.getUint32(mh.s+20):dv.getUint32(mh.s+12);
    const th=find(trak.s,trak.e,["tkhd"])[0];
    if(!th||![0,1].includes(buf[th.s]))return null;
    const mo=th.s+(buf[th.s]===1?52:40),mt=[];
    if(mo+36>th.e)return null;
    for(let i=0;i<9;i++)mt.push(dv.getInt32(mo+i*4)/(i%3===2?1073741824:65536));
    const st=find(trak.s,trak.e,["mdia","minf","stbl"])[0];if(!st)return null;
    const sub=n=>kids(st.s,st.e).find(k=>k.t===n);
    const stsd=sub("stsd"),stts=sub("stts"),stsc=sub("stsc"),stsz=sub("stsz"),co=sub("stco")||sub("co64"),stss=sub("stss"),ctts=sub("ctts");
    if(!stsd||!stts||!stsc||!stsz||!co)return null;
    const ent=stsd.s+8,et=tp(ent+4),ee=ent+dv.getUint32(ent);
    if(!["avc1","avc3","hvc1","hev1","vp09"].includes(et))return null;
    const W=dv.getUint16(ent+32),H=dv.getUint16(ent+34);
    const ch=kids(ent+86,ee);let codec,desc;
    if(et.startsWith("avc")){
      const c=ch.find(k=>k.t==="avcC");if(!c)return null;
      const h=x=>x.toString(16).padStart(2,"0");codec="avc1."+h(buf[c.s+1])+h(buf[c.s+2])+h(buf[c.s+3]);desc=buf.slice(c.s,c.e);
    }else if(et==="vp09"){
      const c=ch.find(k=>k.t==="vpcC");if(!c)return null;
      const h=x=>String(x).padStart(2,"0");codec="vp09."+h(buf[c.s+4])+"."+h(buf[c.s+5])+"."+h(buf[c.s+6]>>4);desc=undefined;
    }else{
      const c=ch.find(k=>k.t==="hvcC");if(!c)return null;
      const b=c.s,sp=buf[b+1]>>6,tier=(buf[b+1]>>5)&1,idc=buf[b+1]&31;
      let cf=(buf[b+2]<<24|buf[b+3]<<16|buf[b+4]<<8|buf[b+5])>>>0,r=0;for(let i=0;i<32;i++){r=(r<<1)|(cf&1);cf>>>=1}r>>>=0;
      const cb=[];for(let i=0;i<6;i++)cb.push(buf[b+6+i]);while(cb.length>1&&cb[cb.length-1]===0)cb.pop();
      codec=(et==="hvc1"?"hvc1.":"hev1.")+["","A","B","C"][sp]+idc+"."+r.toString(16)+"."+(tier?"H":"L")+buf[b+12]+"."+cb.map(x=>x.toString(16).toUpperCase()).join(".");desc=buf.slice(c.s,c.e);
    }
    // tailles, décalages
    const fixed=dv.getUint32(stsz.s+4),ns=dv.getUint32(stsz.s+8);
    const nc=dv.getUint32(co.s+4),c64=co.t==="co64";
    const offs=[];for(let i=0;i<nc;i++)offs.push(c64?Number(dv.getBigUint64(co.s+8+i*8)):dv.getUint32(co.s+8+i*4));
    const ne=dv.getUint32(stsc.s+4),sc=[];for(let i=0;i<ne;i++)sc.push([dv.getUint32(stsc.s+8+i*12),dv.getUint32(stsc.s+12+i*12)]);
    const so=new Array(ns),sz=new Array(ns);let si=0;
    for(let c=0;c<nc&&si<ns;c++){let per=sc[0][1];for(const e of sc)if(e[0]<=c+1)per=e[1];let o=offs[c];for(let k=0;k<per&&si<ns;k++){const s=fixed||dv.getUint32(stsz.s+12+si*4);so[si]=o;sz[si]=s;o+=s;si++}}
    if(si<ns)return null;
    // temps
    const dts=new Array(ns);{const n1=dv.getUint32(stts.s+4);let q=stts.s+8,t=0,i=0;for(let e=0;e<n1;e++){const c=dv.getUint32(q),dl=dv.getUint32(q+4);q+=8;for(let k=0;k<c&&i<ns;k++){dts[i++]=t;t+=dl}}if(i<ns)return null}
    const cto=new Array(ns).fill(0);if(ctts){const n2=dv.getUint32(ctts.s+4),sg=buf[ctts.s]===1;let q=ctts.s+8,i=0;for(let e=0;e<n2;e++){const c=dv.getUint32(q),o=sg?dv.getInt32(q+4):dv.getUint32(q+4);q+=8;for(let k=0;k<c&&i<ns;k++)cto[i++]=o}}
    const key=new Array(ns).fill(!stss);if(stss){const n3=dv.getUint32(stss.s+4);for(let i=0;i<n3;i++){const x=dv.getUint32(stss.s+8+i*4)-1;if(x>=0&&x<ns)key[x]=true}}
    const cts=dts.map((d,i)=>d+cto[i]);
    // Contrat NOVA : les edit lists simples décalent la présentation du média.
    // Les edit lists multi-segments, vides, ralenties ou non standard sont refusées.
    const edits=find(trak.s,trak.e,["edts","elst"])[0];
    let editMediaTime=0,editSupported=true;
    if(edits){
      if(edits.s+8>edits.e||(dv.getUint32(edits.s)&0xffffff)!==0)return null;
      const version=buf[edits.s],count=dv.getUint32(edits.s+4),entry=edits.s+8;
      if(count!==1||![0,1].includes(version)||
         entry+(version===1?20:12)>edits.e)return null;
      if(version===0){
        editMediaTime=dv.getInt32(entry+4);
        editSupported=dv.getUint32(entry+8)===65536;
      }else{
        editMediaTime=Number(dv.getBigInt64(entry+8));
        editSupported=dv.getUint32(entry+16)===65536;
      }
      if(!editSupported||editMediaTime<0||!Number.isSafeInteger(editMediaTime))return null;
    }
    if(ns<1||ns>5000||!Number.isFinite(ts)||ts<=0||dv.getUint32(stsd.s+4)!==1)return null;
    const ptsUs=new Array(ns);
    for(let i=0;i<ns;i++){
      if(!Number.isSafeInteger(so[i])||!Number.isSafeInteger(sz[i])||sz[i]<=0||
         so[i]<0||so[i]+sz[i]>file.size)return null;
      ptsUs[i]=Math.round((cts[i]-editMediaTime)*1000000/ts);
      if(!Number.isSafeInteger(ptsUs[i]))return null;
    }
    // Seules les matrices de présentation orthogonales peuvent être
    // reproduites exactement par l'export expérimental.
    const orientation=analyserOrientation(W,H,mt);
    if(!orientation)return null;
    return {codec,desc,W,H,ts,ns,so,sz,cts,dts,key,ptsUs,editMediaTime,
      ...orientation,source:"mp4-tables"};
  }
  return null;
}
return Object.freeze({analyser,analyserOrientation});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_DEMUX;
