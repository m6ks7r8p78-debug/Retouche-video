const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {buildBible,validateBible,buildEvidenceTemplate,augmentRenderManifest}=require('../continuity-bible.js');
const dir=path.resolve(__dirname,'../../../demo');
const p=JSON.parse(fs.readFileSync(path.join(dir,'project_p1.json')));
const m=JSON.parse(fs.readFileSync(path.join(dir,'manifest_p2.json')));
const clone=x=>structuredClone(x);
test('constructs a strict text-only P4 bible',()=>{const b=buildBible(p,m);assert.equal(b.schema_version,'cinema-p4-bible-v01');assert.equal(b.original_media_embedded,false);assert.equal(b.video_model_connected,false);assert.equal(b.identity_verified,false);assert.equal(b.clips.length,m.clips.length);assert.equal(b.edges.length,m.clips.length-1);});
test('retains references by exact ID across shots',()=>{const b=buildBible(p,m);assert.deepEqual(b.edges[0].shared_character_ids,['character_01']);assert.deepEqual(b.edges[0].props_absent_in_next_plan,['tasse']);});
test('user-authored appearance note carried but no identity claim',()=>{const b=buildBible(p,m,{character_01:'Cheveux bruns, manteau rouge'});assert.equal(b.characters[0].appearance_note,'Cheveux bruns, manteau rouge');assert.equal(b.characters[0].identity_proven,false);});
test('evidence template is deliberately unapproved without regions',()=>{const b=buildBible(p,m);const e=buildEvidenceTemplate(b);assert.equal(e.media_transfer_approved,false);assert.equal(e.checks[0].transition,'cut');assert.equal(e.checks[0].regions,null);});
test('does not embed imported reference',()=>{const q=clone(p);q.mode='photo';q.has_rights_confirmed=true;const b=buildBible(q,m);assert.equal(b.original_media_embedded,false);assert.ok(!JSON.stringify(b).includes('data:image'));});
test('refuses unconfirmed imported media',()=>{const q=clone(p);q.mode='photo';q.has_rights_confirmed=false;assert.throws(()=>buildBible(q,m),/Droits/);});
test('refuses stranger character IDs',()=>{const q=clone(m);q.clips[0].continuity.character_ids=['unknown'];assert.throws(()=>buildBible(p,q),/personnages/i);});
test('refuses unsafe clip IDs',()=>{const q=clone(m);q.clips[0].clip_id='../secret';assert.throws(()=>buildBible(p,q),/ID clip/);});
test('refuses duplicate clip IDs',()=>{const q=clone(m);q.clips[1].clip_id=q.clips[0].clip_id;assert.throws(()=>buildBible(p,q),/dupliqu/);});
test('refuses hidden reference media',()=>{const q=clone(m);q.consent.reference_media_included=true;assert.throws(()=>buildBible(p,q),/privées/);});
test('refuses unknown notes',()=>assert.throws(()=>buildBible(p,m,{ghost:'bonjour'}),/inconnu/));
test('refuses oversize notes',()=>assert.throws(()=>buildBible(p,m,{character_01:'x'.repeat(301)}),/longue/));
test('rejects fraudulent status declarations',()=>{const b=buildBible(p,m);b.identity_verified=true;assert.throws(()=>validateBible(b,m),/Faux statut/);});
test('rejects missing edges',()=>{const b=buildBible(p,m);b.edges=[];assert.throws(()=>validateBible(b,m),/Transitions/);});
test('stable deterministic structure',()=>assert.deepEqual(buildBible(p,m),buildBible(p,m)));

test('appearance locks enrich but do not authorize P2 clip rendering',()=>{
 const b=buildBible(p,m,{character_01:'Manteau rouge'}),v=augmentRenderManifest(m,b);
 assert.match(v.clips[0].prompt,/Manteau rouge/);assert.match(v.clips[1].prompt,/Manteau rouge/);
 assert.equal(v.model_engine,'not_connected');assert.equal(v.rendered_video,null);
 assert.equal(v.consent.remote_transfer_approved,false);
 assert.notDeepEqual(v,m);assert.doesNotMatch(m.clips[0].prompt,/Manteau rouge/);
});
test('unmodified manifest has identical prompts without locks',()=>{
 const b=buildBible(p,m);assert.deepEqual(augmentRenderManifest(m,b),m);
});
test('overlong prompt lock is refused rather than truncated',()=>{
 const q=clone(m);q.clips[0].prompt='x'.repeat(2950);
 const b=buildBible(p,q,{character_01:'veste rouge'});
 assert.throws(()=>augmentRenderManifest(q,b),/trop longue/);
});
