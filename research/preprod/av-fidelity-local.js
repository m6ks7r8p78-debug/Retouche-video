/* RetoucheProAI — optional local MP4 A/V metadata audit.
 * Parses only the MP4 `moov` atom; never decodes or reads media payload `mdat`.
 * No fetch, XHR, beacons, storage or automatic export. No private identifiers.
 * An edit-list difference is a sync RISK, not proof of actual decoded A/V offset.
 */
(function (root) {
  'use strict';
  const MAX_MOV=16*1024*1024,MAX_ATOMS=150000,MAX_FILES=1024*1024*1024;
  const STATES=Object.freeze({OK:'metadata_consistent',REVIEW:'needs_review',ABSTAIN:'abstain_unsupported_mp4'});
  function err(code){let e=new Error(code);e.code=code;return e}
  const ascii=(a,o,n=4)=>String.fromCharCode(...a.subarray(o,o+n));
  function boxes(a,start=0,end=a.length){
    const dv=new DataView(a.buffer,a.byteOffset,a.byteLength),out=[];let off=start,loops=0;
    while(off+8<=end){
      if(++loops>MAX_ATOMS)throw err('atom_count_limit');
      let size=dv.getUint32(off),header=8;const type=ascii(a,off+4);
      if(size===1){if(off+16>end)throw err('truncated_extended_atom');const v=dv.getBigUint64(off+8);if(v>BigInt(Number.MAX_SAFE_INTEGER))throw err('atom_too_big');size=Number(v);header=16}
      if(size===0)size=end-off;
      if(size<header||off+size>end)throw err('malformed_atom');
      out.push({type,off,data:off+header,end:off+size});off+=size;
    }
    if(off!==end)throw err('trailing_atom_bytes');
    return out;
  }
  const one=(a,b,type)=>boxes(a,b.data,b.end).find(x=>x.type===type);
  const dv=a=>new DataView(a.buffer,a.byteOffset,a.byteLength);
  const readU32=(v,p,end)=>{if(p+4>end)throw err('truncated_field');return v.getUint32(p)};
  const readU64=(v,p,end)=>{if(p+8>end)throw err('truncated_field');const n=v.getBigUint64(p);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw err('large_time_unsupported');return Number(n)};
  function full(a,b){if(b.data+4>b.end)throw err('bad_full_box');return {version:a[b.data],body:b.data+4}}
  function mdhd(a,b){const v=dv(a),f=full(a,b);let ts,du;
    if(f.version===0){ts=readU32(v,f.body+8,b.end);du=readU32(v,f.body+12,b.end)}
    else if(f.version===1){ts=readU32(v,f.body+16,b.end);du=readU64(v,f.body+20,b.end)}
    else throw err('mdhd_version_unsupported');
    if(!ts)throw err('bad_media_timescale');return {timescale:ts,durationTicks:du};
  }
  function stsz(a,b){const v=dv(a),f=full(a,b);return readU32(v,f.body+4,b.end)}
  function stts(a,b){const v=dv(a),f=full(a,b),entries=readU32(v,f.body,b.end);
    if(entries>50000||f.body+4+entries*8>b.end)throw err('sample_timing_too_large');
    let count=0,duration=0;
    for(let i=0;i<entries;i++){const p=f.body+4+i*8;count+=v.getUint32(p);duration+=v.getUint32(p)*v.getUint32(p+4)}
    if(!Number.isSafeInteger(count)||!Number.isSafeInteger(duration))throw err('sample_timing_overflow');
    return {count,duration};
  }
  function edit(a,b,timescale,movieTimescale){
    if(!b)return {trimMs:null,segmentMs:null,entries:0};
    const v=dv(a),f=full(a,b),n=readU32(v,f.body,b.end),step=f.version===1?20:12;
    if(n>100||f.body+4+n*step>b.end)throw err('bad_edit_list');
    let firstTrim=null,segment=0;
    for(let i=0;i<n;i++){
      const p=f.body+4+i*step;
      const length=f.version===1?readU64(v,p,b.end):v.getUint32(p);
      const offset=f.version===1?Number(v.getBigInt64(p+8)):v.getInt32(p+4);
      segment+=length;
      if(offset>=0&&firstTrim===null)firstTrim=offset/timescale*1000;
    }
    return {trimMs:firstTrim===null?null:+firstTrim.toFixed(3),segmentMs:+(1000*segment/movieTimescale).toFixed(3),entries:n};
  }
  function mvhdTimescale(a,moov){const b=one(a,moov,'mvhd');if(!b)throw err('no_movie_header');const v=dv(a),f=full(a,b);
    if(f.version===0)return readU32(v,f.body+8,b.end);
    if(f.version===1)return readU32(v,f.body+16,b.end);
    throw err('movie_header_version_unsupported');
  }
  function track(a,b,movieTS){const mdia=one(a,b,'mdia');if(!mdia)return null;
    const h=one(a,mdia,'hdlr'),m=one(a,mdia,'mdhd'),minf=one(a,mdia,'minf');if(!h||!m||!minf)return null;
    const kind=ascii(a,h.data+8);if(kind!=='vide'&&kind!=='soun')return null;
    const media=mdhd(a,m),stbl=one(a,minf,'stbl');if(!stbl)throw err('no_sample_table');
    const z=one(a,stbl,'stsz'),t=one(a,stbl,'stts'),desc=one(a,stbl,'stsd');if(!z||!t||!desc)throw err('missing_sample_boxes');
    const sampleCount=stsz(a,z),timing=stts(a,t);
    if(sampleCount!==timing.count)throw err('sample_count_mismatch');
    const f=full(a,desc),v=dv(a),entries=readU32(v,f.body,desc.end);
    if(!entries||f.body+12>desc.end)throw err('missing_codec_entry');
    const codec=ascii(a,f.body+8);
    const edts=one(a,b,'edts');const elst=edts?one(a,edts,'elst'):null;
    const e=edit(a,elst,media.timescale,movieTS);
    let width=null,height=null;
    if(kind==='vide'){
      const tkhd=one(a,b,'tkhd');if(tkhd&&tkhd.end-tkhd.data>=8){width=v.getUint32(tkhd.end-8)/65536;height=v.getUint32(tkhd.end-4)/65536}
    }
    return {kind,codec,sampleCount,durationMs:+(1000*timing.duration/media.timescale).toFixed(3),
      timescale:media.timescale,editTrimMs:e.trimMs,editSegmentMs:e.segmentMs,editEntries:e.entries,
      ...(kind==='vide'?{width:Math.round(width||0),height:Math.round(height||0)}:{})};
  }
  function parseMoov(a){const bs=boxes(a),moov=bs.find(b=>b.type==='moov');if(!moov)throw err('no_moov_atom');
    const movieTS=mvhdTimescale(a,moov);if(!movieTS)throw err('bad_movie_timescale');
    const traks=boxes(a,moov.data,moov.end).filter(b=>b.type==='trak').map(b=>track(a,b,movieTS)).filter(Boolean);
    const video=traks.filter(x=>x.kind==='vide'),audio=traks.filter(x=>x.kind==='soun');
    if(video.length!==1||audio.length>1)throw err('multi_track_unsupported');
    return {video:video[0],audio:audio[0]||null};
  }
  async function inspect(file){
    if(!file||typeof file.size!=='number'||file.size<24||file.size>MAX_FILES||typeof file.slice!=='function')throw err('file_not_eligible');
    let pos=0,tries=0;
    while(pos+8<=file.size){
      if(++tries>10000)throw err('top_level_atom_limit');
      const a=new Uint8Array(await file.slice(pos,Math.min(file.size,pos+16)).arrayBuffer());
      if(a.length<8)break;
      const v=dv(a);let size=v.getUint32(0),header=8;const type=ascii(a,4);
      if(size===1){if(a.length<16)throw err('short_extended_header');size=readU64(v,8,a.length);header=16}
      if(size===0)size=file.size-pos;
      if(size<header||pos+size>file.size)throw err('bad_top_level_atom');
      if(type==='moov'){
        if(size>MAX_MOV)throw err('moov_too_large');
        const body=new Uint8Array(await file.slice(pos,pos+size).arrayBuffer());
        return parseMoov(body);
      }
      pos+=size;
    }
    throw err('moov_not_found');
  }
  function compare(a,b){
    if(!a?.video||!b?.video)throw err('no_video_track');
    const warnings=[],add=(code,detail)=>warnings.push({code,detail});
    const lostFrames=a.video.sampleCount-b.video.sampleCount;
    if(lostFrames>0)add('video_sample_count_reduced',`${lostFrames} frame(s) en moins ; un montage ou recadrage volontaire peut l'expliquer.`);
    if(lostFrames<0)add('video_sample_count_increased',`${-lostFrames} frame(s) en plus ; une interpolation volontaire peut l'expliquer.`);
    if(a.video.width!==b.video.width||a.video.height!==b.video.height)add('dimensions_changed','Résolution vidéo différente.');
    const videoDurationDiffMs=+(b.video.durationMs-a.video.durationMs).toFixed(3);
    if(Math.abs(videoDurationDiffMs)>35)add('video_duration_changed',`Différence de durée des échantillons : ${videoDurationDiffMs} ms.`);
    if(!!a.audio!==!!b.audio)add('audio_track_presence_changed','La présence d’une piste audio a changé.');
    let audioPacketsDiff=null,editTrimDiffMs=null;
    if(a.audio&&b.audio){
      audioPacketsDiff=b.audio.sampleCount-a.audio.sampleCount;
      if(audioPacketsDiff!==0)add('aac_sample_count_changed',`Variation du nombre d'échantillons compressés audio : ${audioPacketsDiff}.`);
      if(a.audio.codec!==b.audio.codec)add('audio_codec_changed','Le codec audio a changé.');
      if(a.audio.editTrimMs!==null&&b.audio.editTrimMs!==null){
        editTrimDiffMs=+(b.audio.editTrimMs-a.audio.editTrimMs).toFixed(3);
        if(Math.abs(editTrimDiffMs)>10)add('aac_edit_trim_changed',`Découpe initiale par edit list différente de ${editTrimDiffMs} ms : RISQUE de synchronisation, pas preuve du décalage audible.`)
      }else if(a.audio.editTrimMs!==b.audio.editTrimMs)add('aac_edit_list_missing','L’un des deux fichiers n’a pas de découpe audio comparable ; interprétation incertaine.');
    }
    const summary={schema:'retouche_av_metadata_audit_v1',status:warnings.length?STATES.REVIEW:STATES.OK,
      action:'no_automatic_change',method:'mp4_moov_header_only',confidence:'metadata_only',
      metrics:{sourceVideoSamples:a.video.sampleCount,exportVideoSamples:b.video.sampleCount,videoSamplesDelta:-lostFrames,
        videoDurationDeltaMs:videoDurationDiffMs,
        sourceDimensions:[a.video.width,a.video.height],exportDimensions:[b.video.width,b.video.height],
        sourceAudioSamples:a.audio?.sampleCount??null,exportAudioSamples:b.audio?.sampleCount??null,
        audioSamplesDelta:audioPacketsDiff,sourceAudioEditTrimMs:a.audio?.editTrimMs??null,
        exportAudioEditTrimMs:b.audio?.editTrimMs??null,audioEditTrimDeltaMs:editTrimDiffMs},
      warnings,limitations:'Le nombre de trames et les edit lists MP4 ne mesurent PAS le décalage réel du son décodé. Un montage, un changement de cadence ou un remux volontaire peut expliquer les écarts. Pas de conclusion sur la qualité visuelle.'};
    return Object.freeze(summary);
  }
  async function audit(original,exported){try{return compare(await inspect(original),await inspect(exported))}
    catch(e){return Object.freeze({schema:'retouche_av_metadata_audit_v1',status:STATES.ABSTAIN,
      action:'no_automatic_change',confidence:'none',warnings:[],metrics:null,
      errorCode:e?.code||'parse_error',limitations:'Fichier ou structure MP4 non pris en charge ; aucune conclusion.'})}}
  const api=Object.freeze({inspect,compare,audit,parseMoov,states:STATES});
  root.RetoucheLocalExportAudit=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);