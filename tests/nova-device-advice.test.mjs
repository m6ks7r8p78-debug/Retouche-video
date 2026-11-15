import test from "node:test";
import assert from "node:assert/strict";
import P from "../experiences/nova-device-advice.js";
const base=()=>({
 schema:"retoucheproai.nova.iphone-lab.v1",
 sourceKind:"synthetic-generated",result:"success",errorCode:null,
 environment:{secureContext:true,videoEncoder:true,videoFrame:true,webAssembly:true},
 requestedAudio:"preserve",
 source:{containerVideo:"hevc",inputBytes:24000,sampleCount:15,durationMs:1000},
 output:{mode:"hevc-wasm",colorVerified:true,audio:"aac-copy",mp4SizeBytes:6000,
  mp4PayloadBytes:4200,wasmHeapCapacityPeakBytes:21037056,pipelineElapsedMs:450}
});
test("NOVA 0.25 : succès synthétique reste preuve d'un seul essai, jamais iPhone certifié",()=>{
 const a=P.assess(base());
 assert.equal(a.state,"one-run-success");
 assert.equal(a.evidence,"synthetic-run-in-current-browser");
 assert.equal(a.next,"test-an-authorized-local-file");
 assert.equal(a.physicalIphoneCertified,false);
 assert.equal(a.totalRamKnown,false);
 assert.equal(a.mediaModified,false);
 assert.equal(a.settingsChanged,false);
 assert.equal(a.automaticUpload,false);
 assert.match(P.message(a),/ce fichier seulement/);
});
test("NOVA 0.25 : fichier local réussi n'est jamais un test de modèle de téléphone",()=>{
 const a=P.assess({...base(),sourceKind:"local-user-file"});
 assert.equal(a.state,"one-run-success");
 assert.equal(a.evidence,"one-file-run-in-current-browser");
 assert.equal(a.next,"repeat-on-physical-iphone");
 assert.ok(!JSON.stringify(a).includes("iPhone15"));
});
test("NOVA 0.25 : codecs, contexte, page invisible ou échec -> abstention",()=>{
 const cases=[
  [{...base(),result:"refused",errorCode:"resource-budget-rejected"},"export-refused"],
  [{...base(),result:"cancelled"},"cancelled"],
  [{...base(),environment:{...base().environment,secureContext:false}},"required-browser-capability-unavailable"],
  [{...base(),environment:{...base().environment,videoEncoder:false}},"required-browser-capability-unavailable"],
  [{...base(),output:{...base().output,colorVerified:false}},"incomplete-output-audit"],
  [{...base(),output:{...base().output,wasmHeapCapacityPeakBytes:null}},"incomplete-output-audit"],
  [{...base(),output:{...base().output,mp4SizeBytes:25*1048576}},"pilot-resource-limit-exceeded"],
  [{...base(),source:{...base().source,sampleCount:91}},"source-limits-or-evidence-missing"],
  [{...base(),requestedAudio:"preserve",output:{...base().output,audio:"silent"}},"audio-not-preserved"],
  [{...base(),requestedAudio:"silent-explicit",output:{...base().output,audio:"aac-copy"}},"audio-consent-mismatch"]
 ];
 for(const [r,reason] of cases){
  const a=P.assess(r);
  assert.equal(a.state,"abstain",reason);
  assert.equal(a.reason,reason);
 }
 assert.equal(P.assess(base(),{visibility:"hidden"}).reason,"page-not-visible");
 assert.equal(P.assess(null).state,"abstain");
});
test("NOVA 0.25 : audio AAC réencodé reste avis consultatif, pas copie byte-identique",()=>{
 const a=P.assess({...base(),output:{...base().output,audio:"aac-encode"}});
 assert.equal(a.state,"caution");assert.equal(a.reason,"audio-reencoded-not-bit-identical");
 assert.match(P.message(a),/réencodé/);
});
test("NOVA 0.25 : coûts élevés sont mesurés sur cette exécution seulement",()=>{
 const a=P.assess({...base(),output:{...base().output,pipelineElapsedMs:7900}});
 assert.equal(a.state,"caution");assert.equal(a.reason,"high-observed-cost");
 assert.equal(a.next,"reduce-workload-next-run");assert.equal(a.nearLimit,true);
 assert.equal(a.settingsChanged,false);
});
test("NOVA 0.25 : rapport non fiable et métadonnées privées ne transitent jamais",()=>{
 const record={...base(),sourceKind:"local-user-file",
  privateName:"secret_user.mov",rawPixelBytes:"SECRET",userAgent:"Device identifier"};
 const a=P.assess(record),serialized=JSON.stringify(a);
 assert.equal(a.state,"one-run-success");
 for(const prohibited of ["secret_user.mov","SECRET","Device identifier","GPS","filePath"])
  assert.ok(!serialized.includes(prohibited));
 assert.deepEqual(Object.keys(a).sort(),[
  "automaticUpload","evidence","limits","mediaModified","nearLimit","next",
  "physicalIphoneCertified","reason","schema","settingsChanged","state","totalRamKnown"
 ].sort());
});

test("NOVA 0.25 : transmission JSON à liste blanche stricte",()=>{
 const a=P.publicFields(P.assess(base()));
 assert.equal(a.state,"one-run-success");
 assert.equal(a.physicalIphoneCertified,false);
 assert.equal(a.totalRamKnown,false);
 const poisoned=P.publicFields({...a,reason:"private_url_secret",
  next:"privateFile.mov",evidence:"personName",filename:"sensitive.mov"});
 assert.equal(poisoned.reason,"invalid-report");
 assert.equal(poisoned.next,"review-refusal");
 assert.equal(poisoned.evidence,"insufficient");
 assert.equal(JSON.stringify(poisoned).includes("sensitive.mov"),false);
 assert.equal(P.publicFields({schema:"wrong"}),null);
});
