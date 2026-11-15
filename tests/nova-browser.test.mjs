import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const root=path.resolve(fileURLToPath(new URL("../",import.meta.url)));
function server(){
 return http.createServer(async(req,res)=>{
   const u=new URL(req.url,"http://localhost");const p=path.resolve(root,"."+u.pathname);
   if(!p.startsWith(root+path.sep)){res.writeHead(403).end();return}
   try{
     const b=await fs.readFile(p);
     res.setHeader("Content-Type",p.endsWith(".html")?"text/html;charset=utf-8":p.endsWith(".js")?"text/javascript;charset=utf-8":"application/octet-stream");
     res.end(b);
   }catch{res.writeHead(404).end("Not found")}
 });
}
for(const width of [390,1350]){
 test("NOVA : parcours photo local, mobile "+width,async()=>{
   const app=server();await new Promise(r=>app.listen(0,"127.0.0.1",r));
   const browser=await chromium.launch({headless:true,...(process.env.CHROME?{executablePath:process.env.CHROME}:{})});
   try{
     const page=await browser.newPage({viewport:{width,height:850},acceptDownloads:true});
     const errors=[],externals=[];
     page.on("pageerror",e=>errors.push(e.message));
     page.on("request",r=>{if(!r.url().startsWith("http://127.0.0.1:")&&!r.url().startsWith("blob:")&&!r.url().startsWith("data:"))externals.push(r.url())});
     await page.goto("http://127.0.0.1:"+app.address().port+"/experiences/nova.html");
     assert.match(await page.title(),/NOVA/);
     const sample=await page.evaluate(()=>{
       const c=document.createElement("canvas");c.width=96;c.height=64;
       const x=c.getContext("2d");x.fillStyle="#232d2a";x.fillRect(0,0,96,64);
       x.fillStyle="#7d8a76";x.fillRect(26,12,40,36);
       return c.toDataURL("image/png").split(",")[1];
     });
     await page.locator("#file").setInputFiles({name:"source.png",mimeType:"image/png",buffer:Buffer.from(sample,"base64")});
     await page.waitForFunction(()=>!document.querySelector("#run").disabled);
     await page.locator("#run").click();
     await page.waitForFunction(()=>!document.querySelector("#save").disabled);
     assert.equal(await page.locator("#before").isVisible(),true);
     assert.equal(await page.locator("#after").isVisible(),true);
     assert.match(await page.locator("#metrics").innerText(),/Régions inspectées/);
     assert.match(await page.locator("#zoneInfo").innerText(),/régions adaptées/);
     const zonesButton=page.locator("#showZones");
     if(await zonesButton.isVisible()){
       await zonesButton.click();
       assert.equal(await zonesButton.getAttribute("aria-pressed"),"true");
       assert.equal(await page.locator("#zonesOverlay").isVisible(),true);
       await zonesButton.click();
       assert.equal(await page.locator("#zonesOverlay").isVisible(),false);
     }
     await page.locator("#compare").evaluate(el=>{el.value="70";el.dispatchEvent(new Event("input",{bubbles:true}))});
     assert.match(await page.locator("#after").evaluate(el=>el.style.clipPath),/30%/);
     const download=page.waitForEvent("download");
     await page.locator("#save").click();
     const file=await download;
     assert.match(file.suggestedFilename(),/nova_apercu\.png$/);
     assert.deepEqual(errors,[]);
     assert.deepEqual(externals,[]);
     if(width===390){
       const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
       assert.ok(overflow<4,"Horizontal overflow: "+overflow);
     }
     await page.close();
   }finally{await browser.close();await new Promise(r=>app.close(r))}
 });
}
