// Optional independent regression check: node validation/real-mp4.cjs /path/to/MP4
// No private media bundled.
const fs=require('node:fs'),assert=require('node:assert/strict'),cp=require('node:child_process');
const aac=require('../experiences/nova-aac-copy.js');
(async()=>{
 const file=process.argv[2];if(!file)throw Error('MP4 path required');
 const p=JSON.parse(cp.execFileSync('ffprobe',['-v','error','-show_streams','-of','json',file]));
 const v=p.streams.find(s=>s.codec_type==='video'),a=p.streams.find(s=>s.codec_type==='audio');
 const result=await aac.planifier(new Blob([fs.readFileSync(file)]),{durationSeconds:Number(v.duration)});
 assert.equal(result.storedPacketCount,Number(a.nb_frames));
 // Stored-packet audit precedes edit-list trimming (AAC priming included).
 const raw=JSON.parse(cp.execFileSync('ffprobe',['-v','error','-ignore_editlist','1','-select_streams','a:0','-show_packets','-show_entries','packet=pts_time,duration_time','-of','json',file])).packets;
 const first=Number(raw[0].pts_time),last=raw.at(-1);
 const end=Number(last.pts_time)+Number(last.duration_time);
 assert.equal(result.storedPacketCount,raw.length);
 assert.ok(Math.abs(result.storedLastPacketEndUs/1e6-end)<.001);
 assert.ok(Math.abs(result.storedFirstPacketUs/1e6-first)<.001);
 console.log('PASS independent ffprobe comparison:',result.storedPacketCount,'stored;',result.packets.length,'selected;',result.storedLastPacketEndUs/1000,'ms');
})();
