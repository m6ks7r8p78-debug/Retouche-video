/* Retouche 3D AI Lab v1.9 — original adult procedural characters, 100% local.
   Neither neural inference nor reconstruction of a real filmed person.
   Browser/Node UMD, no external assets or requests. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.Retouche3DGenerator=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function parsePrompt(raw){
 const text=String(raw||'').trim();if(!text||text.length>4000)throw Error('Description requise (maximum 4 000 caractères).');
 const s=normalize(text); const ageTokens=s.match(/\b(\d{1,2})\s*(?:ans|years? old)\b/);
 if((ageTokens&&Number(ageTokens[1])<18)||/\b(enfant|mineur|mineure|adolescent|adolescente|ado|teen|child|little girl|little boy|fillette|garconnet|bebe|fillettes)\b/.test(s))
   throw Error('Ce prototype crée uniquement des personnages explicitement adultes (18 ans et plus).');
 const gender=/\b(homme|masculin|monsieur|man|male)\b/.test(s)?'homme':/\b(femme|feminin|woman|female|dame)\b/.test(s)?'femme':'neutre';
 const hair=/\b(blond|blonde|blonds|blondes|blondie)\b/.test(s)?'blond':/\b(brun|brune|bruns|brunes|chatain|chatains)\b/.test(s)?'brun':/\b(roux|rousse|auburn)\b/.test(s)?'roux':/\b(cheveux noirs?|chevelure noire|black hair)\b/.test(s)?'noir':'brun';
 const longHair=/cheveux\s+(longs?|mi[- ]longs?)/.test(s)||/longue chevelure|long hair/.test(s)||gender==='femme'&&!/cheveux\s+courts?|short hair/.test(s);
 const clothes=/\b(robe|dress)\b/.test(s)?'robe':/\b(costume|smoking|suit|tailleur|veste)\b/.test(s)?'costume':/\b(jean|decontract|casual|t[- ]shirt|tshirt|pantalon)\b/.test(s)?'casual':'elegant';
 const elegant=/\b(classe|elegant|elegante|chic|charme|charmant|charmante|sexy|aguicheur|aguicheuse|raffine)\b/.test(s);
 const smokeRequested=/\b(fume|fumant|fumante|fumer|cigarette|cigare|pipe)\b/.test(s);
 const smoke=smokeRequested&&!/\b(ne fume pas|sans cigarette|sans fumer|non fumeur|non fumeuse)\b/.test(s);
 const smokeHand=/\b(main gauche|dans sa main gauche|de la main gauche)\b/.test(s)?'gauche':'droite';
 const tobacco=smoke?(/\bcigare\b/.test(s)?'cigare':/\bpipe\b/.test(s)?'pipe':'cigarette'):null;
 const wave=/\b(salue|saluer|saluant|bonjour|coucou|waving|wave)\b/.test(s)||/fait signe|agite la main/.test(s);
 const walk=/\b(marche|marcher|marchant|walking|walk|promene|promener)\b/.test(s);
 const tilt=/\b(penche|pencher|inclin(?:e|er)) (?:legerement )?(?:la |sa )?tete\b/.test(s);
 const smokeStyle=smoke?(/\b(lentement|doucement|nonchalant|nonchalante|lent|lente|slowly)\b/.test(s)?'lent':/\b(rapide|rapidement|vite|quickly)\b/.test(s)?'rapide':'standard'):null;
 const blink=/\b(cligne|cligner|clignant|clignement|recligne|recligner|blink|blinking)\b/.test(s);
 const smileAction=/\b(sourit|sourire|souriant|souriante|smile|smiling)\b/.test(s);
 const breathe=/\b(respire|respirer|respiration|inspire|inspirer|expire|expirer|breath|breathe)\b/.test(s);
 const glasses=/\b(lunettes|glasses)\b/.test(s);
 const smiles=/\b(sourire|souriant|souriante|jolie|charmant|charmante|aguicheur|aguicheuse|joyeux|joyeuse|sourit|smiling)\b/.test(s);
 const outfitSegment=(s.match(/(?:robe|costume|veste|tenue|tailleur|pantalon|t[- ]shirt|chemise|dress|suit)\W+(?:(?:de couleur|en)\W+)?(?:noire?|rouge|bordeaux|bleue?|marine|blanche?|white|black|red|blue)/)||[])[0]||'';
 const outfitColor=/rouge|bordeaux|red/.test(outfitSegment)?'rouge':/bleu|marine|blue/.test(outfitSegment)?'bleu':/blanc|white/.test(outfitSegment)?'blanc':/noir|black/.test(outfitSegment)?'noir':'marine';
 const eyes=/yeux\s+(?:de couleur\s+)?verts?|green eyes/.test(s)?'vert':/yeux\s+(?:de couleur\s+)?bleus?|blue eyes/.test(s)?'bleu':/yeux\s+(?:de couleur\s+)?noirs?|dark eyes/.test(s)?'sombre':'brun';
 const skinTone=/peau\s+(?:tres\s+)?foncee?/.test(s)?'foncee':/peau\s+(?:mate|olive)/.test(s)?'mate':/peau\s+claire?/.test(s)?'claire':'standard';
 // Extraire les occurrences dans leur ordre, sans inventer les gestes non reconnus.
 // « deux fois » après un geste duplique cette étape (max 3 répétitions) ; les autres
 // réapparitions explicites restent des étapes distinctes.
 const events=[];
 const patterns=[
  ['fumer',/\b(fume|fumer|fumant|fumante|cigarette|cigare|pipe|refume|refumer)\b/g,smoke],
  ['saluer',/\b(salue|saluer|saluant|bonjour|coucou|waving|wave)\b|fait signe|agite la main/g,wave],
  ['marcher',/\b(marche|marcher|marchant|walking|walk|promene|promener)\b/g,walk],
  ['incliner',/\b(penche|pencher|inclin(?:e|er)) (?:legerement )?(?:la |sa )?tete\b/g,tilt],
  ['cligner',/\b(cligne|cligner|clignant|clignement|recligne|recligner|blink|blinking)\b/g,blink],
  ['sourire',/\b(sourit|sourire|souriant|souriante|smile|smiling)\b/g,smileAction],
  ['respirer',/\b(respire|respirer|respiration|inspire|inspirer|expire|expirer|breath|breathe)\b/g,breathe]
 ];
 for(const [name,re,enabled] of patterns){if(!enabled)continue;let m;
  while((m=re.exec(s))!==null){const tail=s.slice(m.index+m[0].length,m.index+m[0].length+35);
   const repetition=tail.match(/^\s*(?:(?:des?\s+yeux|de la main)\s*)?(?:a nouveau\s*)?(?:\b(2|3|deux|trois)\s*fois\b)/);
   const count=repetition?({'2':2,'3':3,'deux':2,'trois':3}[repetition[1]]):1;
   for(let j=0;j<count;j++)events.push({name,index:m.index,repeat:j,token:m[0]});
   if(m.index===re.lastIndex)re.lastIndex++;
  }
 }
 events.sort((a,b)=>a.index-b.index||a.repeat-b.repeat);
 // Éviter un double comptage dans « fume une cigarette » ou « salue, fait signe ».
 // Une conjonction temporelle explicite préserve les gestes réellement répétés.
 const dedup=[];
 for(const ev of events){const prev=dedup[dedup.length-1];
   const between=prev&&s.slice(prev.index,ev.index);
   if(prev&&prev.name===ev.name&&ev.repeat===0&&ev.index!==prev.index&&ev.index-prev.index<36&&
      !/\b(puis|ensuite|apres|encore|nouveau)\b/.test(between||'')&&!/\brefume(?:r)?\b/.test(ev.token))continue;
   dedup.push(ev);
 }
 const actions=dedup.map(x=>x.name).slice(0,12);
 const truncated=dedup.length>12;
 if(actions.length===0)actions.push('pose');
 const matched=[];
 if(/\b(femme|homme|man|woman|dame)\b/.test(s))matched.push('type adulte');
 if(/blond|brun|rousse|roux|chatain|cheveux noir/.test(s))matched.push('cheveux');
 if(/robe|costume|veste|jean|pantalon|casual|decontract/.test(s))matched.push('tenue');
 if(elegant)matched.push('style');if(glasses)matched.push('lunettes');if(/yeux\s+(verts?|bleus?|noirs?)/.test(s))matched.push('yeux');if(/peau (mate|claire|foncee)/.test(s))matched.push('teint');
 if(smoke)matched.push('geste de fumer'+(smokeStyle!=='standard'?' ('+smokeStyle+')':''));if(wave)matched.push('salut');if(walk)matched.push('marche sur place');if(tilt)matched.push('inclinaison de tête');if(blink)matched.push('clignement des yeux');if(smileAction)matched.push('sourire animé');if(breathe)matched.push('respiration stylisée');if(smoke)matched.push('main '+smokeHand);
 const unhandled=[];
 if(/photoreal|hyperreal|ultrareal|comme une vraie photo|realisme absolu/.test(s))unhandled.push('photoréalisme non disponible');
 if(/parle|parler|discute|voix|dialogue|chant|chante/.test(s))unhandled.push('parole et voix non générées');
 if(/danse|danser|dance|dancing/.test(s))unhandled.push('danse non animée');
 if(/assis|assise|s.asseoit|se couche|allonge|allongee/.test(s))unhandled.push('position assise/allongée non disponible');
 if(/decor|arriere.plan|ville|plage|salon|restaurant/.test(s))unhandled.push('décor non créé');
 if(/reprodui|exactement comme|identique a une personne/.test(s))unhandled.push('copie fidèle de personne non disponible');
 if(truncated)unhandled.push('scénario limité à 12 gestes dans ce prototype');
 if([/\bcigarette\b/,/\bcigare\b/,/\bpipe\b/].filter(re=>re.test(s)).length>1)unhandled.push('changement de type de cigarette/cigare/pipe au fil du scénario non disponible');
 return {adult:true,ageLabel:'adulte 18+',gender,hair,longHair,clothes,elegant,smoke,wave,walk,tilt,blink,smileAction,breathe,smokeHand,smokeStyle,tobacco,actions,glasses,smiles,outfitColor,eyes,skinTone,matched,unhandled,originalText:text,
  disclaimer:'Personnage synthétique stylisé, créé par formes paramétriques. Aucune identité réelle ni anatomie fidèle.'};
}
function build(config){
 const c=typeof config==='string'?parsePrompt(config):config;
 if(!c||!c.adult)throw Error('Configuration adulte requise.');
 const hairColors={blond:[.83,.66,.32,1],brun:[.24,.13,.10,1],roux:[.65,.22,.10,1],noir:[.09,.085,.105,1]};
 const clothing={noir:[.10,.11,.15,1],marine:[.15,.24,.40,1],bleu:[.14,.29,.63,1],rouge:[.62,.16,.23,1],blanc:[.86,.87,.88,1]};
 const materials=[
   {name:'peau_synthetique',color:({standard:[.81,.57,.43,1],claire:[.91,.73,.61,1],mate:[.66,.43,.29,1],foncee:[.38,.24,.18,1]}[c.skinTone]||[.81,.57,.43,1])},
   {name:'cheveux_'+c.hair,color:hairColors[c.hair]||hairColors.brun},
   {name:'tenue_'+c.outfitColor,color:clothing[c.outfitColor]||clothing.marine},
   {name:'ombre_yeux',color:[.075,.075,.09,1]},
   {name:'blanc_yeux',color:[.96,.95,.90,1]},
   {name:'levres',color:[.57,.19,.27,1]},
   {name:'chaussures',color:[.13,.11,.13,1]},
   {name:'cigarette',color:[.93,.90,.79,1]},
   {name:'braise',color:[.98,.32,.12,1]},
   {name:'chemise',color:[.91,.92,.96,1]},
   {name:'verres',color:[.34,.53,.61,1]},
   {name:'iris_'+c.eyes,color:({brun:[.30,.21,.12,1],bleu:[.18,.47,.66,1],vert:[.21,.47,.31,1],sombre:[.08,.08,.09,1]}[c.eyes]||[.30,.21,.12,1])},
   {name:'fumee_synthetique',color:[.79,.87,.90,.28]}
 ];
 const nodeList=[];const meshes=[];
 function node(name,parent=null,t=[0,0,0],scale=null,mat=null){
   const n={name,translation:t.slice()};if(scale){n.scale=scale.slice();n.mesh=0;n.extras={materialIndex:mat===null?0:mat};}
   let id=nodeList.push(n)-1;if(parent!==null)nodeList[parent].children=(nodeList[parent].children||[]).concat([id]);return id;
 }
 const root=node('synthetic_adult_root');
 const legSpan=c.gender==='femme'?.13:.16;
 const torsoY=c.gender==='femme'?1.32:1.32;
 const torsoW=c.gender==='femme'?.245:.28;
 const torso=node('torse',root,[0,torsoY,0],[torsoW,.37,.15],c.clothes==='costume'?2:2);
 node('bassin',root,[0,1.0,0],[c.gender==='femme'?.275:.24,.18,.16],2);
 if(c.clothes==='robe')node('robe_jupe',root,[0,0.96,0],[.315,.37,.205],2);
 if(c.clothes==='costume'||c.clothes==='elegant')node('chemise',root,[0,1.38,.142],[.10,.22,.016],9);
 node('cou',root,[0,1.66,0],[.085,.145,.085],0);
 // Le pivot de tête est distinct de son volume : les traits et cheveux suivent la rotation.
 const head=node('tete_pivot',root,[0,1.83,0]);
 node('tete_volume',head,[0,0,0],[.185,.222,.177],0);
 node('coiffure_calotte',head,[0,.175,-.022],[.197,.122,.192],1);
 const length=c.longHair?.30:.12;
 for(let j=0;j<5;j++){
   const x=-.15+j*.075;node('meche_'+j,head,[x,.12-length*.38,-.095],[.052,length,.075],1);
 }
 const eyes={};const eyebrows={};
 for(const [side,sgn] of [['gauche',-1],['droite',1]]){
   const eye=node('oeil_pivot_'+side,head,[sgn*.080,.024,.157]);
   node('oeil_'+side,eye,[0,0,0],[.040,.031,.016],4);
   node('iris_'+side,eye,[0,0,.017],[.016,.020,.009],11);
   eyes[side]=eye;
   eyebrows[side]=node('sourcil_'+side,head,[sgn*.083,.093,.157],[.054,.012,.013],1);
 }
 node('nez',head,[0,-.045,.173],[.034,.053,.038],0);
 const mouth=node('bouche_pivot',head,[0,-.099,.164]);
 node('bouche',mouth,[0,0,0],[c.smiles?.071:.055,.013,.012],5);
 if(c.glasses){node('lunette_gauche',head,[-.081,.028,.18],[.07,.047,.012],10);node('lunette_droite',head,[.081,.028,.18],[.07,.047,.012],10);node('pont_lunette',head,[0,.031,.181],[.027,.012,.011],3);}
 const puffs=[];
 if(c.smoke){for(let i=0;i<3;i++)puffs.push(node('fumee_volute_'+(i+1),head,[.025+(i-1)*.032,-.078+i*.065,.22+i*.022],[.0001,.0001,.0001],12));}
 const limb={};
 for(const [side,sgn] of [['gauche',-1],['droite',1]]){
   const sh=node('epaule_'+side,root,[sgn*(torsoW+.047),1.51,0]);
   node('bras_haut_'+side,sh,[0,-.19,0],[.092,.245,.095],c.clothes==='robe'?0:2);
   const el=node('coude_'+side,sh,[0,-.41,0]);
   node('avant_bras_'+side,el,[0,-.18,0],[.08,.212,.084],c.clothes==='robe'?0:2);
   const wr=node('poignet_'+side,el,[0,-.41,0]);
   node('main_'+side,wr,[0,-.063,0],[.09,.12,.073],0);
   limb[side]={shoulder:sh,elbow:el,wrist:wr};
   if(side===c.smokeHand&&c.smoke){
    if(c.tobacco==='pipe'){node('pipe_tuyau',wr,[.02,-.105,.050],[.021,.083,.022],3);node('pipe_foyer',wr,[.02,-.195,.057],[.047,.042,.045],3);node('pipe_braise',wr,[.02,-.230,.057],[.027,.008,.027],8);}
    else{const cigar=c.tobacco==='cigare';node('cigarette_tige',wr,[.02,-.130,.053],[cigar?.031:.017,.10,cigar?.029:.017],cigar?3:7);node('cigarette_braise',wr,[.02,-.223,.053],[cigar?.027:.018,.013,cigar?.027:.018],8);}
   }
   const hip=node('hanche_'+side,root,[sgn*legSpan,.89,0]);
   node('cuisse_'+side,hip,[0,-.24,0],[.112,.31,.114],c.clothes==='robe'?0:2);
   const knee=node('genou_'+side,hip,[0,-.50,0]);limb[side].hip=hip;limb[side].knee=knee;node('mollet_'+side,knee,[0,-.22,0],[.091,.29,.095],0);
   node('chaussure_'+side,knee,[0,-.49,.095],[.105,.095,.21],6);
 }
 const quat=angle=>[0,0,Math.sin(angle/2),Math.cos(angle/2)];
 function track(node,times,angles){return {node,times,path:'rotation',values:angles.map(quat),rotation:angles.map(quat)};}
 function scaleTrack(node,times,values){return {node,times,path:'scale',values:values.map(x=>x.slice())};}
 const animations=[];const poseT=[0,1.5,3.0,4.5];
 animations.push({name:'pose',label:'Pose douce + clignement',duration:4.5,channels:[
  track(head,poseT,[0,.045,-.045,0]),track(limb.gauche.shoulder,poseT,[0,.055,-.055,0]),
  ...Object.values(eyes).map(id=>scaleTrack(id,[0,1.04,1.11,1.20,3.29,3.36,3.45,4.5],[[1,1,1],[1,1,1],[1,.075,1],[1,1,1],[1,1,1],[1,.075,1],[1,1,1],[1,1,1]]))
 ]});
 if(c.smoke){const hand=limb[c.smokeHand];const duration=c.smokeStyle==='lent'?7:c.smokeStyle==='rapide'?3.3:5;
  const ts=[0,.15*duration,.38*duration,.58*duration,.80*duration,duration];
  animations.push({name:'fumer',label:'Porter à la bouche (stylisé)',duration,channels:[
   track(hand.shoulder,ts,[0,c.smokeHand==='gauche'?.38:-.38,c.smokeHand==='gauche'?1.14:-1.14,c.smokeHand==='gauche'?1.14:-1.14,c.smokeHand==='gauche'?.38:-.38,0]),
   track(hand.elbow,ts,[0,c.smokeHand==='gauche'?.70:-.70,c.smokeHand==='gauche'?2.03:-2.03,c.smokeHand==='gauche'?2.03:-2.03,c.smokeHand==='gauche'?.70:-.70,0]),
   track(hand.wrist,ts,[0,c.smokeHand==='gauche'?.1:-.1,c.smokeHand==='gauche'?.22:-.22,c.smokeHand==='gauche'?.22:-.22,c.smokeHand==='gauche'?.1:-.1,0]),
   track(head,ts,[0,0,-.05,-.05,0,0]),
   scaleTrack(mouth,ts,[[1,1,1],[1,1,1],[.90,1.42,1],[.82,2.05,1],[1,1,1],[1,1,1]]),
   ...Object.values(eyes).map(id=>scaleTrack(id,ts,[[1,1,1],[1,1,1],[1,.7,1],[1,.64,1],[1,1,1],[1,1,1]])),
   ...puffs.map((id,i)=>scaleTrack(id,ts,[[.0001,.0001,.0001],[.0001,.0001,.0001],[.0001,.0001,.0001],[.020+i*.007,.033+i*.013,.016+i*.006],[.045+i*.007,.070+i*.015,.040+i*.008],[.0001,.0001,.0001]]))
  ]});
 }
 if(c.wave){const ts=[0,.5,1.0,1.4,1.8,2.2,2.65,3.1];
  animations.push({name:'saluer',label:'Saluer de la main',duration:3.1,channels:[
    track(limb.droite.shoulder,ts,[0,-.7,-1.45,-1.45,-1.45,-1.45,-.7,0]),
    track(limb.droite.elbow,ts,[0,-.5,-1.22,-.92,-1.25,-.92,-.5,0]),
    track(limb.droite.wrist,ts,[0,0,-.15,.22,-.22,.20,0,0])
  ]});
 }
 if(c.walk){const ts=[0,.4,.8,1.2,1.6,2.0,2.4];
  animations.push({name:'marcher',label:'Marcher sur place',duration:2.4,channels:[
    track(limb.droite.hip,ts,[0,.22,0,-.22,0,.22,0]),
    track(limb.gauche.hip,ts,[0,-.22,0,.22,0,-.22,0]),
    track(limb.droite.knee,ts,[0,.17,.28,.09,0,.17,0]),
    track(limb.gauche.knee,ts,[0,.12,0,.18,.29,.12,0]),
    track(limb.droite.shoulder,ts,[0,-.13,0,.13,0,-.13,0]),
    track(limb.gauche.shoulder,ts,[0,.13,0,-.13,0,.13,0])
  ]});
 }
 if(c.tilt){const ts=[0,.5,1.25,1.9,2.4,3.0];animations.push({name:'incliner',label:'Incliner la tête',duration:3,channels:[track(head,ts,[0,-.15,-.22,.16,.12,0])]});}
 if(c.blink){const ts=[0,.35,.44,.53,.9,1.13,1.23,1.35,1.8];
  animations.push({name:'cligner',label:'Cligner des yeux',duration:1.8,channels:Object.values(eyes).map(id=>scaleTrack(id,ts,[[1,1,1],[1,1,1],[1,.065,1],[1,1,1],[1,1,1],[1,.065,1],[1,.065,1],[1,1,1],[1,1,1]]))});
 }
 if(c.smileAction){const ts=[0,.4,.85,1.55,2.4,3.2];
  animations.push({name:'sourire',label:'Sourire (stylisé)',duration:3.2,channels:[
   scaleTrack(mouth,ts,[[1,1,1],[1.2,.95,1],[1.48,.78,1],[1.48,.78,1],[1.2,.95,1],[1,1,1]]),
   ...Object.values(eyes).map(id=>scaleTrack(id,ts,[[1,1,1],[1,.95,1],[1,.86,1],[1,.86,1],[1,.95,1],[1,1,1]])),
   track(eyebrows.gauche,ts,[0,.07,.14,.14,.07,0]),track(eyebrows.droite,ts,[0,-.07,-.14,-.14,-.07,0])
  ]});
 }
 if(c.breathe){const ts=[0,.7,1.5,2.2,3.1,4.0],base=torsoW;
  animations.push({name:'respirer',label:'Respirer (torse stylisé)',duration:4.0,channels:[
    scaleTrack(torso,ts,[[base,.37,.15],[base*1.025,.374,.155],[base*1.065,.382,.164],[base*1.065,.382,.164],[base*1.01,.371,.152],[base,.37,.15]])
  ]});
 }
 // Séquence temporelle : chaque geste revient à la pose neutre ; 250 ms de transition.
 // Les pistes de chaque articulation sont complétées à 0 lorsque l'action n'agit pas dessus.
 let timeline=[];
 if(c.actions.length>1){
   let cursor=0;const gap=.25;
   for(const name of c.actions){const clip=animations.find(a=>a.name===name);if(!clip)continue;
     timeline.push({action:name,label:clip.label,start:cursor,end:cursor+clip.duration,duration:clip.duration});cursor+=clip.duration+gap;
   }
   const keys=[...new Set(timeline.flatMap(t=>animations.find(a=>a.name===t.action).channels.map(ch=>ch.node+':'+(ch.path||'rotation'))))].sort();
   const tracks=keys.map(key=>{const [idString,path]=key.split(':'),id=Number(idString),times=[],values=[];
     const identity=path==='scale'?(nodeList[id].scale||[1,1,1]).slice():[0,0,0,1];
     function push(t,v){if(times.length&&Math.abs(times[times.length-1]-t)<1e-7){values[values.length-1]=v.slice();return;}times.push(t);values.push(v.slice());}
     push(0,identity);
     for(const step of timeline){const clip=animations.find(a=>a.name===step.action),ch=clip.channels.find(v=>v.node===id&&(v.path||'rotation')===path);
       push(step.start,identity);
       if(ch){for(let i=0;i<ch.times.length;i++)push(step.start+ch.times[i],(ch.values||ch.rotation)[i]);}
       push(step.end,identity);push(step.end+gap,identity);
     }
     return {node:id,path,times,values,...(path==='rotation'?{rotation:values}:{})};
   });
   const duration=timeline[timeline.length-1].end;
   animations.push({name:'scenario',label:'Scénario complet ('+timeline.map(t=>t.action).join(' → ')+')',duration,channels:tracks});
 }
 const selectedAnimation=timeline.length?'scenario':animations.find(a=>a.name===c.actions[0])?.name||'pose';
 return {nodes:nodeList,materials,animations,channels:animations[0].channels,selectedAnimation,config:c,timeline,meshes,scene:0};
}
function sphereGeometry(lat=10,lon=16){let pos=[],norm=[],ind=[];
 for(let j=0;j<=lat;j++){let phi=Math.PI*j/lat;for(let i=0;i<=lon;i++){let theta=2*Math.PI*i/lon;let x=Math.sin(phi)*Math.cos(theta),y=Math.cos(phi),z=Math.sin(phi)*Math.sin(theta);pos.push(x,y,z);norm.push(x,y,z);}}
 for(let j=0;j<lat;j++)for(let i=0;i<lon;i++){let a=j*(lon+1)+i,b=a+lon+1;ind.push(a,b,a+1,b,b+1,a+1)}
 return {pos,norm,ind};
}
function encodeGLB(model){
 const g=sphereGeometry(),buffers=[],views=[],accessors=[];
 let bytes=[],pos=0;
 function write(bytesIn,target){const arr=bytesIn instanceof Uint8Array?bytesIn:new Uint8Array(bytesIn);while(pos%4){bytes.push(0);pos++}const offset=pos;for(const b of arr)bytes.push(b);pos+=arr.length;const v={buffer:0,byteOffset:offset,byteLength:arr.length};if(target)v.target=target;views.push(v);return views.length-1;}
 function accessor(a,ctype,type,target){const view=write(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),target);const count=a.length/({SCALAR:1,VEC3:3,VEC4:4}[type]);const obj={bufferView:view,componentType:ctype,count,type};if(type==='VEC3'){const mins=[Infinity,Infinity,Infinity],maxs=[-Infinity,-Infinity,-Infinity];for(let i=0;i<a.length;i+=3)for(let j=0;j<3;j++){mins[j]=Math.min(mins[j],a[i+j]);maxs[j]=Math.max(maxs[j],a[i+j]);}obj.min=mins;obj.max=maxs;}if(type==='SCALAR'&&count>0){obj.min=[Math.min(...a)];obj.max=[Math.max(...a)];}accessors.push(obj);return accessors.length-1;}
 const ap=accessor(new Float32Array(g.pos),5126,'VEC3',34962),an=accessor(new Float32Array(g.norm),5126,'VEC3',34962),ai=accessor(new Uint16Array(g.ind),5123,'SCALAR',34963);
 const meshes=model.materials.map((m,i)=>({name:'matiere_'+m.name,primitives:[{attributes:{POSITION:ap,NORMAL:an},indices:ai,material:i}]}));
 const nodes=model.nodes.map(n=>{let c={name:n.name,translation:n.translation.slice()};if(n.scale)c.scale=n.scale.slice();if(n.children)c.children=n.children.slice();if(n.mesh!==undefined)c.mesh=n.extras?.materialIndex??0;return c;});
 const animations=[];
 for(const clip of model.animations){const samplers=[],channels=[];
  for(const motion of clip.channels){let ti=accessor(new Float32Array(motion.times),5126,'SCALAR');let path=motion.path||'rotation';let values=motion.values||motion.rotation;let data=accessor(new Float32Array(values.flat()),5126,path==='scale'?'VEC3':'VEC4');let si=samplers.length;samplers.push({input:ti,output:data,interpolation:'LINEAR'});channels.push({sampler:si,target:{node:motion.node,path}});}
  animations.push({name:clip.name,samplers,channels});
 }
 while(pos%4){bytes.push(0);pos++}
 const doc={asset:{version:'2.0',generator:'Retouche 3D AI Lab v1.9 procedural adults'},scene:0,scenes:[{nodes:[0]}],nodes,meshes,
  materials:model.materials.map(m=>({name:m.name,pbrMetallicRoughness:{baseColorFactor:m.color,metallicFactor:0,roughnessFactor:.77},doubleSided:true,...(m.color[3]<1?{alphaMode:'BLEND'}:{})})),
  buffers:[{byteLength:bytes.length}],bufferViews:views,accessors,animations,
  extras:{synthetic:true,notPhotorealistic:true,notReconstructedFromVideo:true,age:'adult 18+',generatorVersion:'1.9',animationNames:animations.map(a=>a.name),timeline:model.timeline,smokeHand:model.config.smokeHand,tobacco:model.config.tobacco,caveat:'procedural nodes with facial pivot + eyes and mouth scales, no skinning or faithful human motion'}};
 let json=new TextEncoder().encode(JSON.stringify(doc));const pad=(4-json.length%4)%4;const output=new Uint8Array(12+8+json.length+pad+8+bytes.length);const dv=new DataView(output.buffer);
 output.set([103,108,84,70],0);dv.setUint32(4,2,true);dv.setUint32(8,output.length,true);dv.setUint32(12,json.length+pad,true);output.set([74,83,79,78],16);output.set(json,20);output.fill(32,20+json.length,20+json.length+pad);let offset=20+json.length+pad;dv.setUint32(offset,bytes.length,true);output.set([66,73,78,0],offset+4);output.set(new Uint8Array(bytes),offset+8);
 return {bytes:output,document:doc};
}
return {parsePrompt,build,encodeGLB};
});