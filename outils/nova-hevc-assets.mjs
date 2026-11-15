/* NOVA 0.18 — staging déterministe des composants MIT HEVC WASM.
 * Les fichiers sont copiés depuis @hevcjs/core@1.8.0, téléchargé sur le
 * runner CI; les navigateurs ne chargent rien depuis un CDN. Aucun asset
 * binaire n'est écrit dans git par cet outil.
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
const root=path.resolve(fileURLToPath(new URL("../",import.meta.url)));
const pkg=path.join(root,"node_modules/@hevcjs/core");
const dist=path.join(pkg,"dist");
const dest=path.join(root,"experiences/vendor/hevc");
const version="1.8.0",licenseUrl="https://github.com/lid-labs/hevc.js/blob/main/LICENSE";
const maxFile=2*1024*1024;
const sha256=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
const isFile=s=>/^[a-zA-Z0-9_-][a-zA-Z0-9_.\/-]*$/.test(s)&&
 !s.split("/").some(x=>x===".."||x===""||x==".");
function deps(source){
 const found=new Set();
 for(const match of source.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)["'](\.[^"']+)["']/g))
  found.add(match[1]);
 return [...found];
}
async function stagedFiles(){
 const found=new Set(["decoder-entry.js","wasm/hevc-decode.js","wasm/hevc-decode.wasm"]);
 const visit=async rel=>{
  if(!isFile(rel)||!rel.endsWith(".js"))throw Error("Module non autorisé: "+rel);
  const b=await fs.readFile(path.join(dist,rel));
  if(b.byteLength>maxFile)throw Error("JS trop volumineux: "+rel);
  for(const dep of deps(b.toString("utf8"))){
   const target=path.posix.normalize(path.posix.join(path.posix.dirname(rel),dep));
   if(!isFile(target)||!target.endsWith(".js"))throw Error("Import non local: "+dep);
   if(!found.has(target)){found.add(target);await visit(target)}
  }
 };
 await visit("decoder-entry.js");
 return [...found].sort();
}
async function stage(){
 const p=JSON.parse(await fs.readFile(path.join(pkg,"package.json"),"utf8"));
 if(p.name!=="@hevcjs/core"||p.version!==version||p.license!=="MIT")
  throw Error("Version/licence décodeur non approuvées");
 const paths=await stagedFiles();
 await fs.rm(dest,{recursive:true,force:true});
 await fs.mkdir(dest,{recursive:true});
 const records=[];
 for(const rel of paths){
  if(!isFile(rel))throw Error("Chemin non autorisé");
  const b=await fs.readFile(path.join(dist,rel));
  if(b.byteLength===0||b.byteLength>maxFile)throw Error("Asset HEVC invalide: "+rel);
  if(rel.endsWith(".wasm")&&
    !(b[0]===0&&b[1]===97&&b[2]===115&&b[3]===109))
   throw Error("Binaire WASM sans magic");
  await fs.mkdir(path.dirname(path.join(dest,rel)),{recursive:true});
  await fs.writeFile(path.join(dest,rel),b);
  records.push({path:rel,bytes:b.byteLength,sha256:sha256(b)});
 }
 const manifest={library:"@hevcjs/core",version,license:"MIT",licenseUrl,
  origin:"https://github.com/lid-labs/hevc.js",assets:records};
 await fs.writeFile(path.join(dest,"integrity.json"),JSON.stringify(manifest,null,2)+"\n");
 return manifest;
}
async function verify(){
 const data=JSON.parse(await fs.readFile(path.join(dest,"integrity.json"),"utf8"));
 if(data.library!=="@hevcjs/core"||data.version!==version||data.license!=="MIT"||
    !Array.isArray(data.assets)||data.assets.length<3||data.assets.length>24)
  throw Error("Manifest HEVC invalide");
 const seen=new Set();
 for(const item of data.assets){
  if(!isFile(item.path)||seen.has(item.path)||item.path.startsWith("/"))
   throw Error("Chemin asset incorrect");
  seen.add(item.path);
  const b=await fs.readFile(path.join(dest,item.path));
  if(item.bytes!==b.byteLength||item.sha256!==sha256(b)||
     b.byteLength<1||b.byteLength>maxFile)
   throw Error("Intégrité HEVC échouée: "+item.path);
 }
 for(const key of ["decoder-entry.js","wasm/hevc-decode.js","wasm/hevc-decode.wasm"])
  if(!seen.has(key))throw Error("Composant WASM obligatoire absent : "+key);
 return data;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const command=process.argv[2];
 if(command!=="stage"&&command!=="verify")throw Error("Usage: stage|verify");
 const result=command==="stage"?await stage():await verify();
 console.log("NOVA_HEVC_INTEGRITY "+JSON.stringify(result));
}
export {stage,verify,stagedFiles,deps,sha256};
