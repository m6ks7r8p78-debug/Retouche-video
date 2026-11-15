#!/usr/bin/env node
/* NOVA 0.23 — bundle statique pour un futur aperçu HTTPS distinct.
 * Aucun déploiement ni média privé : seulement code, WASM, licence.
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
const root=path.resolve(fileURLToPath(new URL("../",import.meta.url)));
const out=path.resolve(process.argv[2]||path.join(root,"dist","nova-iphone-preview"));
const experience=path.join(root,"experiences");
const names=(await fs.readdir(experience)).filter(n=>n==="nova.html"||
 n.startsWith("nova-")&&n.endsWith(".js"));
const paths=["mp4-muxer.js",...names.map(n=>"experiences/"+n)];
async function walk(dir){
 for(const e of await fs.readdir(path.join(root,dir),{withFileTypes:true})){
  const rel=path.posix.join(dir,e.name);
  if(e.isDirectory())await walk(rel);
  else if(e.isFile())paths.push(rel);
  else throw Error("lien de fichier externe interdit : "+rel);
 }
}
await walk("experiences/vendor/hevc");
await fs.rm(out,{recursive:true,force:true});
await fs.mkdir(out,{recursive:true});
const manifest=[];
for(const rel of paths){
 if(!/^(mp4-muxer\.js|experiences\/nova[\w.-]*\.(?:js|html)|experiences\/vendor\/hevc\/[\w./-]+)$/.test(rel))
  throw Error("fichier non autorisé : "+rel);
 const from=path.join(root,rel),to=path.join(out,rel),bytes=await fs.readFile(from);
 await fs.mkdir(path.dirname(to),{recursive:true});
 await fs.writeFile(to,bytes);
 manifest.push({path:rel,bytes:bytes.length,sha256:crypto.createHash("sha256").update(bytes).digest("hex")});
}
const html=await fs.readFile(path.join(out,"experiences/nova.html"),"utf8");
const scripts=[...html.matchAll(/<script\s+src="([^"]+)"/g)].map(x=>x[1]);
for(const script of scripts){
 if(/^(?:https?:|\/\/|data:)/.test(script))throw Error("script tiers interdit");
 const destination=path.resolve(out,"experiences",script);
 if(!destination.startsWith(out+path.sep))throw Error("chemin de script invalide");
 await fs.access(destination);
}
for(const required of [
 "experiences/nova-worker.js","experiences/nova-iphone-lab-ui.js",
 "experiences/nova-iphone-report.js","experiences/vendor/hevc/wasm/hevc-decode.wasm",
 "experiences/vendor/hevc/wasm/hevc-decode.js",
 "experiences/vendor/hevc/decoder-entry.js",
 "experiences/vendor/hevc/chunk-M6WO4WIK.js",
 "experiences/vendor/hevc/LICENSE.txt"
])if(!manifest.some(x=>x.path===required))throw Error("dépendance absente : "+required);
const home=[
 '<!doctype html><html lang="fr"><meta charset="utf-8">',
 '<meta name="viewport" content="width=device-width,initial-scale=1">',
 '<title>NOVA — aperçu expérimental isolé</title>',
 '<main style="max-width:38rem;margin:12vh auto;padding:1.5rem;font:16px system-ui">',
 '<h1>NOVA — laboratoire iPhone</h1>',
 '<p>Prévisualisation technique isolée, non destinée à la production.',
 'Les vidéos restent traitées dans le navigateur, sans téléversement.</p>',
 '<p>Le test Safari est volontaire et son rapport JSON n’est jamais envoyé automatiquement.</p>',
 '<p><a href="./experiences/nova.html">Ouvrir le laboratoire NOVA</a></p></main></html>'
].join("\n");
await fs.writeFile(path.join(out,"index.html"),home);
manifest.push({path:"index.html",bytes:Buffer.byteLength(home),
 sha256:crypto.createHash("sha256").update(home).digest("hex")});
const record={kind:"NOVA iPhone HTTPS preview, NOT DEPLOYED",version:"0.23",
 publication:"none",privateMediaIncluded:false,files:manifest.sort((a,b)=>a.path.localeCompare(b.path))};
await fs.writeFile(path.join(out,"asset-manifest.json"),JSON.stringify(record,null,2)+"\n");
console.log(JSON.stringify({version:record.version,files:manifest.length,
 bytes:manifest.reduce((n,f)=>n+f.bytes,0),out},null,2));
