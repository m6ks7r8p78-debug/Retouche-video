/* Tests v4.7 : barre de vitesse sous la vidéo (0,75× → 1,30×, pas de 0,05) et comparatif avant / après à curseur.
   node tests/vitesse.test.mjs [medias] [sorties]  — durées vérifiées avec ffprobe ; captures d'écran au format iPhone. */
import { spawn, execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), PORT = 8771, MED = path.resolve(process.argv[2] || path.join(HERE, "medias")), OUT = path.resolve(process.argv[3] || path.join(HERE, "sorties", "vitesse"));
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" }); await new Promise(r => setTimeout(r, 600));
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--use-angle=swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto("http://localhost:" + PORT + "/index.html"); await p.waitForFunction(() => window.SR);
const res = []; const test = async (n, f) => { let ok = false, info = ""; try { const r = await f(); ok = r.ok; info = r.info } catch (e) { info = "exception : " + e.message.split("\n")[0] } res.push(ok); console.log((ok ? "✓ " : "✗ ") + n + " — " + info) };
const save = async f => { const d = await p.evaluate(async () => { const a = new Uint8Array(await (await fetch(outUrl)).arrayBuffer()); let s = ""; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s) }); fs.writeFileSync(f, Buffer.from(d, "base64")); return f };
const probe = f => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,duration", "-of", "json", f]).toString()).streams;
const setSpeed = n => p.evaluate(n => { const e = $("#spd"); e.value = n; e.dispatchEvent(new Event("input")); e.dispatchEvent(new Event("change")) }, n);
await p.evaluate(() => { const e = document.querySelector("#o_max"); e.checked = false; e.dispatchEvent(new Event("change")) });
await p.setInputFiles("#f", path.join(MED, "video_vieuxtel.mp4")); await p.waitForFunction(() => v.videoWidth > 0);
await p.waitForFunction(() => !REC.pr, null, { timeout: 120000 }).catch(() => {});
await p.click('[data-q="-1"]');
const src = +(await p.evaluate(() => v.duration));

await test("Barre de vitesse placée entre la barre de lecture et les trois boutons", async () => {
  const r = await p.evaluate(() => { const y = s => document.querySelector(s).getBoundingClientRect(); return { tm: y("#tm").bottom, sp: y("#spdw").top, sb: y("#spdw").bottom, row: y("#pp").top, vis: !$("#spdw").hidden && y("#spdw").height > 0 } });
  return { ok: r.vis && r.sp >= r.tm - 1 && r.sb <= r.row + 1, info: JSON.stringify(r) } });
await test("Bornes et pas : 0,75 → 1,30 par 0,05 (12 positions)", async () => {
  const r = await p.evaluate(() => { const e = $("#spd"), out = []; for (let n = 60; n <= 140; n += 1) { e.value = n; out.push(SPD.k()) } e.value = 100; SPD.ui(); return [...new Set(out)] });
  const want = [.75, .8, .85, .9, .95, 1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3];
  return { ok: JSON.stringify(r) === JSON.stringify(want), info: r.join(" ") } });
await test("Aperçu : la lecture suit la vitesse, puis revient à 1× à la pause (mesures de l'app intactes)", async () => {
  await setSpeed(120); await p.click("#pp"); await p.waitForTimeout(300);
  const a = await p.evaluate(() => [v.playbackRate, $("#spdv").textContent]); await p.click("#pp"); await p.waitForTimeout(100);
  const c = await p.evaluate(() => v.playbackRate);
  return { ok: a[0] === 1.2 && a[1] === "1,20×" && c === 1, info: "lecture " + a[0] + " (" + a[1] + "), pause " + c } });
await p.screenshot({ path: path.join(OUT, "lecteur_vitesse.png") });
for (const [n, name] of [[75, "x075.mp4"], [130, "x130.mp4"]]) {
  await test("Export à " + (n / 100).toFixed(2).replace(".", ",") + "× : durée " + (src / (n / 100)).toFixed(2) + " s, son présent", async () => {
    await setSpeed(n); await p.evaluate(() => $("#ex").onclick());
    await p.waitForFunction(() => !exporting && !analyzing && /Terminé|Échec/.test(document.querySelector("#st1").textContent), null, { timeout: 1800000 });
    const f = await save(path.join(OUT, name)), st = probe(f), vd = st.find(x => x.codec_type === "video"), ad = st.find(x => x.codec_type === "audio"), want = src / (n / 100);
    return { ok: Math.abs(vd.duration - want) < .12 && !!ad && Math.abs(ad.duration - want) < .2, info: "vidéo " + (+vd.duration).toFixed(2) + " s, son " + (ad ? (+ad.duration).toFixed(2) + " s" : "absent") } });
  await test("Comparatif à curseur proposé, original synchronisé à la même vitesse", async () => {
    const r = await p.evaluate(() => ({ ba: !$("#ba").hidden, k: baK, old: !!document.querySelector(".bag") }));
    return { ok: r.ba && Math.abs(r.k - n / 100) < 1e-9 && !r.old, info: JSON.stringify(r) } });
}
await setSpeed(100);
await test("Export à 1× : chemin habituel (pas de plan Time Repair), comparatif à curseur", async () => {
  await p.evaluate(() => { window.__sawPlan = false; const o = TR.go; TR.go = function () { window.__sawPlan = true; return o.apply(this, arguments) }; $("#ex").onclick() });
  await p.waitForFunction(() => !exporting && /Terminé|Échec/.test(document.querySelector("#st1").textContent), null, { timeout: 1800000 });
  const f = await save(path.join(OUT, "x100.mp4")), vd = probe(f).find(x => x.codec_type === "video");
  const r = await p.evaluate(() => ({ plan: window.__sawPlan, ba: !$("#ba").hidden, k: baK }));
  return { ok: !r.plan && r.ba && r.k === 1 && Math.abs(vd.duration - src) < .12, info: "durée " + (+vd.duration).toFixed(2) + " s, " + JSON.stringify(r) } });
await test("Curseur : glisser le doigt sur la vidéo déplace la séparation (original à gauche, résultat à droite)", async () => {
  await p.waitForFunction(() => $("#bar").readyState >= 2 && $("#bao").readyState >= 2, null, { timeout: 20000 });
  await p.evaluate(() => { $("#bar").currentTime = 1.5; $("#bao").currentTime = 1.5 }); await p.waitForTimeout(400);
  const box = await (await p.$("#bsx")).boundingBox(); await p.locator("#bsx").scrollIntoViewIfNeeded();
  const bb = await (await p.$("#bsx")).boundingBox();
  await p.mouse.move(bb.x + bb.width * .5, bb.y + bb.height / 2); await p.mouse.down(); await p.mouse.move(bb.x + bb.width * .3, bb.y + bb.height / 2, { steps: 5 }); await p.mouse.up();
  const r = await p.evaluate(() => ({ sp: +baSp.toFixed(2), clip: $("#bar").style.clipPath, line: $("#bsl").style.left, rng: +$("#bsp").value }));
  await p.screenshot({ path: path.join(OUT, "comparatif_curseur.png") });
  const fits = box.width <= 390 && bb.height <= 844 * .56 + 2;
  return { ok: Math.abs(r.sp - .3) < .03 && /inset\(0(px)? 0(px)? 0(px)? 3\d/.test(r.clip) && Math.abs(r.rng - 300) < 30 && fits, info: JSON.stringify(r) + " ; boîte " + Math.round(bb.width) + "×" + Math.round(bb.height) } });
await test("Curseur du dessous : même effet", async () => {
  await p.evaluate(() => { const e = $("#bsp"); e.value = 800; e.dispatchEvent(new Event("input")) });
  const r = await p.evaluate(() => ({ sp: baSp, line: $("#bsl").style.left }));
  return { ok: r.sp === .8 && parseFloat(r.line) === 80, info: JSON.stringify(r) } });
await test("Lecture du comparatif : les deux vidéos avancent ensemble", async () => {
  await p.click("#bap"); await p.waitForTimeout(1200); const r = await p.evaluate(() => ({ a: baR.currentTime, o: baO.currentTime, off: baOff, k: baK })); await p.click("#bap");
  return { ok: Math.abs(r.o - (r.off + r.a * r.k)) < .2 && r.a > .3, info: JSON.stringify(r) } });
await test("Aucune erreur JavaScript", async () => ({ ok: !errs.length, info: errs.join(" | ") || "aucune" }));
await b.close(); srv.kill();
console.log(res.filter(x => x).length + "/" + res.length + " réussis");
process.exit(res.every(x => x) ? 0 : 1);
