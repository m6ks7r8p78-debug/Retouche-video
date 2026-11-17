const fs=require('fs'),vm=require('vm'),assert=require('assert');
async function scenario(mode){
 const ids=['nova601Run','nova601Status','nova601Json','nova601Share','nova601Copy','nova601Show','nova601ReportText','nova601ColorPanel'];
 const el=Object.fromEntries(ids.map(id=>[id,{hidden:true,value:'',textContent:'',events:{},addEventListener(n,f){this.events[n]=f},removeAttribute(){},focus(){},select(){}}]));
 const matrix={source:{matrix:6},meanAbsRgb255:2.458,maxAbsRgb255:15};
 const ctx={document:{getElementById:id=>el[id],addEventListener(){}},location:{hash:'#nova601ColorPanel'},window:{addEventListener(){}},navigator:{},AbortController,Blob,URL,
 NOVA_HEVC_PAIR:{runPair:async()=>({results:[matrix],status:'measured-not-source-certified'})},
 NOVA_EXPORT_COLOR_TEST:{run:async({signal})=>{if(mode==='fail')throw Error('unsupported');if(mode==='cancel'){await el.nova601Run.events.click();assert(signal.aborted);throw Error('cancelled')}return {status:'measured-not-source-certified',results:[{sourceMatrix:6,meanAbsRgb255:1,maxAbsRgb255:3}]}}}};
 vm.runInNewContext(fs.readFileSync('experiences/nova-hevc-pair-ui.js','utf8'),ctx);
 await el.nova601Run.events.click();
 if(mode==='cancel'){assert(!el.nova601Share.hidden);assert(el.nova601Status.textContent.includes('interrompu'));await el.nova601Show.events.click();const partial=JSON.parse(el.nova601ReportText.value);assert.equal(partial.results[0].maxAbsRgb255,15);assert.equal(partial.exportReplay.status,'cancelled');assert(!('results' in partial.exportReplay));return}
 assert.equal(el.nova601Share.hidden,false);assert.equal(el.nova601Copy.hidden,false);
 await el.nova601Show.events.click();const report=JSON.parse(el.nova601ReportText.value);
 assert.equal(report.results[0].maxAbsRgb255,15);
 assert.equal(report.exportReplay.status,mode==='fail'?'unavailable':'measured-not-source-certified');
 if(mode==='fail')assert(!('results' in report.exportReplay));
 await el.nova601Copy.events.click();assert(!el.nova601ReportText.hidden);
}
(async()=>{for(const mode of ['ok','fail','cancel'])await scenario(mode);console.log('PASS: report contains both stages; unavailable export preserves reading without score; cancellation preserves completed reading and marks export cancelled; copy fallback shows report. DOM simulated.');})().catch(e=>{console.error(e);process.exit(1)});
