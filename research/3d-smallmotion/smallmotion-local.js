/* RetoucheProAI Local Motion Lab - browser-only proposal detector.
   Input: two ImageData-shaped {width,height,data} objects, contiguous RGBA.
   No network, uploads, model weights, or identifiable features. The result is
   a geometric motion hypothesis, NOT a semantic object or depth inference. */
(function(root){
'use strict';
const median=a=>{a.sort((x,y)=>x-y);return a[Math.floor(a.length/2)]};
function gray(im){
 if(!im||!Number.isInteger(im.width)||!Number.isInteger(im.height)||im.width<64||im.height<64||im.width>320||im.height>240||im.data.length!==im.width*im.height*4)throw Error('Images RGBA invalides ou trop grandes');
 const n=im.width*im.height, out=new Uint8Array(n),rgb=im.data;
 for(let k=0;k<n;k++)out[k]=((rgb[k*4]*77+rgb[k*4+1]*150+rgb[k*4+2]*29)>>8);
 return out;
}
function analyze(a,b){
 if(!b||a.width!==b.width||a.height!==b.height)throw Error('Images de dimensions différentes');
 const w=a.width,h=a.height,ga=gray(a),gb=gray(b);
 // Too little texture means flow cannot be inferred reliably.
 let globalMean=0,globalSq=0,allDelta=[];
 for(let k=0;k<ga.length;k+=5){const v=ga[k];globalMean+=v;globalSq+=v*v;allDelta.push(Math.abs(v-gb[k]));}
 globalMean/=allDelta.length;globalSq=globalSq/allDelta.length-globalMean*globalMean;
 if(globalSq<30)return {status:'abstain_texture',candidates:[],confidence:'insuffisante'};
 const step=8,radius=3, tiles=[];
 for(let y=10;y<h-10;y+=step)for(let x=10;x<w-10;x+=step){
  let sum=0,sumsq=0,n=0;
  for(let py=-radius;py<=radius;py++)for(let px=-radius;px<=radius;px++){const z=ga[(y+py)*w+x+px];sum+=z;sumsq+=z*z;n++;}
  if((sumsq/n-(sum/n)**2)<35)continue;
  let best=Infinity,bestDx=0,bestDy=0;
  for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
   if(y+dy-radius<0||y+dy+radius>=h||x+dx-radius<0||x+dx+radius>=w)continue;
   let cost=0;
   for(let py=-radius;py<=radius;py++)for(let px=-radius;px<=radius;px++)cost+=Math.abs(ga[(y+py)*w+x+px]-gb[(y+dy+py)*w+x+dx+px]);
   if(cost<best){best=cost;bestDx=dx;bestDy=dy;}
  }
  // Avoid interpreting bad matches as movement evidence.
  if(best/n>36)continue;
  tiles.push({x,y,dx:bestDx,dy:bestDy,score:best/n});
 }
 if(tiles.length<24)return {status:'abstain_matches',candidates:[],confidence:'insuffisante',matched:tiles.length};
 const globalDx=median(tiles.map(t=>t.dx)), globalDy=median(tiles.map(t=>t.dy));
 const alignedDiff=[];
 for(let y=5;y<h-5;y+=3)for(let x=5;x<w-5;x+=3){
   const xx=x+globalDx,yy=y+globalDy;
   if(xx>=0&&xx<w&&yy>=0&&yy<h)alignedDiff.push(Math.abs(ga[y*w+x]-gb[yy*w+xx]));
 }
 if(median(alignedDiff)>55)return {status:'abstain_cut_or_flash',candidates:[],confidence:'insuffisante',matched:tiles.length};
 // Candidate tiles with displacement distinct from the dominant field.
 const selected=tiles.filter(t=>Math.hypot(t.dx-globalDx,t.dy-globalDy)>=2.2&&t.score<24);
 const q=new Map(selected.map(t=>[`${t.x},${t.y}`,t])),seen=new Set(),regions=[];
 for(const t of selected){
  const start=`${t.x},${t.y}`;if(seen.has(start))continue;
  const stack=[t];seen.add(start);const group=[];
  while(stack.length){const v=stack.pop();group.push(v);
   for(const [mx,my] of [[-8,0],[8,0],[0,-8],[0,8]]){
    const k=`${v.x+mx},${v.y+my}`;if(q.has(k)&&!seen.has(k)){seen.add(k);stack.push(q.get(k));}
   }
  }
  if(group.length<3||group.length>tiles.length*.35)continue;
  const xs=group.map(v=>v.x),ys=group.map(v=>v.y);
  const left=Math.max(0,Math.min(...xs)-5),top=Math.max(0,Math.min(...ys)-5);
  const width=Math.min(w-left,Math.max(...xs)-Math.min(...xs)+10),height=Math.min(h-top,Math.max(...ys)-Math.min(...ys)+10);
  if(width<10||height<10||width*height>w*h*.17)continue;
  regions.push({box:[left,top,width,height],support:group.length,description:'Région de mouvement visuel possible'});
 }
 regions.sort((x,y)=>y.support-x.support);
 return {status:regions.length?'local_motion_candidate':'no_supported_local_motion',
   candidates:regions.slice(0,4),globalMotionPx:[globalDx,globalDy],matched:tiles.length,
   confidence:'non calibrée',limitations:'Essai local 2D : pas de segmentation, identité, contact, profondeur 3D ni preuve de mouvement indépendant'};
}
root.RetoucheLocalMotion={analyze,build:'smallmotion-pwa-bundle-v1'};
if(typeof module!=='undefined'&&module.exports)module.exports=root.RetoucheLocalMotion;
})(typeof globalThis!=='undefined'?globalThis:this);