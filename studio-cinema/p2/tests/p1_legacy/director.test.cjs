const test=require('node:test'), assert=require('node:assert/strict');
const d=require('../../cinema-director-p1-core.js');
const make=(description,overrides={})=>d.buildProject({description,...overrides});
test('default text-only project, no pixels or AI-render claims',()=>{
 const p=make('Une femme marche dans une rue. Ensuite elle boit un café.');
 assert.equal(p.mode,'text');assert.equal(p.media,null);assert.equal(p.video_model_connected,false);
 assert.equal(p.rendered_video,null);assert.equal(p.privacy.uploaded_to_server,false);
 assert.ok(p.characters[0].description.includes('femme adulte'));
 assert.equal(p.shots.length,2);assert.equal(d.totalDuration(p),45);
});
test('duration words, numeric and compound time',()=>{
 for(const [s,n] of [['deux minutes',120],['1 minute',60],['30 secondes',30],['1 min 30 s',90],['9:16',45],['3 min',180]]) assert.equal(d.getDesiredDuration(s),n,s);
});
test('character continuity, changing locations and props',()=>{
 const p=make('Une femme brune de 35 ans marche dans une rue, puis entre dans un café et boit une tasse, ensuite elle téléphone. Film de deux minutes.');
 assert.equal(p.characters[0].description,'femme adulte aux cheveux bruns de 35 ans');
 assert.equal(p.shots.length,3);assert.equal(p.shots[0].location,'rue');assert.equal(p.shots[1].location,'cafe');assert.equal(p.shots[2].location,'cafe');
 assert.deepEqual(p.props.map(x=>x.id),['tasse','telephone']);assert.ok(p.shots.every(s=>s.character_ids[0]==='character_01'));
 assert.equal(d.totalDuration(p),120);
});
test('character second actor is flagged for review',()=>{
 const p=make('Une femme discute avec une amie dans le salon.');
 assert.equal(p.characters.length,2);assert.ok(d.diagnostics(p).some(x=>x.includes('Deux personnages')));
});
test('image references require file and rights',()=>{
 assert.throws(()=>make('Une personne sourit',{mode:'photo'}),/Ajoute/);
 assert.throws(()=>make('Une personne sourit',{mode:'photo',media:{name:'photo.jpg',type:'image/jpeg',size:5}}),/droits/i);
 const p=make('Une personne sourit',{mode:'photo',hasRights:true,media:{name:'photo.jpg',type:'image/jpeg',size:5}});
 assert.equal(p.media.name,'photo.jpg');assert.equal(p.media.transferred,false);assert.equal(p.media.embedded,false);
});
test('video refs same protection and bounded size',()=>{
 assert.throws(()=>make('Une femme marche',{mode:'video',media:{name:'movie.mov',type:'video/quicktime',size:220*1024*1024},hasRights:true}),/200 Mo/);
 const p=make('Une femme marche',{mode:'video',media:{name:'movie.mov',type:'video/quicktime',size:5000},hasRights:true});
 assert.equal(p.media.transferred,false);
});
test('prevents silent empties and huge prompt',()=>{
 assert.throws(()=>make('   '),/Décris/);assert.throws(()=>make('a'.repeat(4001)),/Décris/);
});
test('bounded shots and deterministic stable ids',()=>{
 const s=Array.from({length:30},(_,i)=>'La personne marche '+i+'.').join(' ');
 const a=make(s),b=make(s);assert.equal(a.shots.length,16);assert.deepEqual(a,b);
 assert.equal(d.nextId(a),'shot_17');
});
test('import preserves data but strips rendered content and media embedding',()=>{
 const p=make('Une femme lit dans un salon.');p.rendered_video='https://evil.invalid';p.video_model_connected=true;
 p.shots[0].render_uri='https://evil.invalid/x';p.privacy.uploaded_to_server=true;
 const q=d.validateImported(p);
 assert.equal(q.rendered_video,null);assert.equal(q.shots[0].render_uri,null);assert.equal(q.privacy.uploaded_to_server,false);
});
test('rejects import with duplicate shot IDs, invalid time, missing characters',()=>{
 const p=make('Une femme marche dans la rue. Ensuite elle regarde la mer.');
 p.shots[1].id=p.shots[0].id;assert.throws(()=>d.validateImported(p),/non conforme/);
 const q=make('Une femme marche.');q.shots[0].duration_seconds=0;assert.throws(()=>d.validateImported(q),/non conforme/);
 const z=make('Une femme marche.');z.shots[0].character_ids=['inconnu'];assert.throws(()=>d.validateImported(z),/non conforme/);
});
test('contrast: camera plan and locations',()=>{
 const p=make('Un homme marche dans une rue. Ensuite il regarde son téléphone.');
 assert.equal(p.shots[0].camera,'Plan d’ensemble');assert.equal(p.shots[1].camera,'Plan rapproché');
});

