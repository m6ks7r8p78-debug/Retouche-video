/* Serveur de test : sert l'app (dossier parent) et un faux « serveur de modèles » aux pannes contrôlées.
   GET /__test/model.bin?k=clé&cut=N&bad=1&extra=1&slow=ms&norange=1&down=1  (fichier déterministe de 6 Mo)
     cut=N     : coupe la connexion après N octets (une seule fois par clé k)
     bad=1     : un octet modifié (empreinte fausse)          extra=1 : 1 Mo de trop
     slow=ms   : pause entre morceaux de 256 Ko                norange=1 : ignore l'en-tête Range (renvoie tout)
     down=1    : coupe immédiatement (réseau absent)           v=2 : deuxième « version » (contenu différent)
   GET /__test/info?v=1|2  -> {size, sha256}      GET /__test/log -> demandes reçues (pour vérifier les reprises) */
import http from "http";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +process.env.PORT || 8766;
const SIZE = 6 * 1048576;
function model(v) { const b = Buffer.alloc(SIZE); let x = v === 2 ? 99991 : 12345; for (let i = 0; i < SIZE; i++) { x = (x * 1103515245 + 12345) >>> 0; b[i] = x >>> 24 } return b }
const M = { 1: model(1), 2: model(2) }, SHA = { 1: crypto.createHash("sha256").update(M[1]).digest("hex"), 2: crypto.createHash("sha256").update(M[2]).digest("hex") };
const cutDone = new Set(), log = [];
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".webmanifest": "application/manifest+json", ".bin": "application/octet-stream", ".mp4": "video/mp4", ".onnx": "application/octet-stream" };

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname === "/__test/info") { const v = +u.searchParams.get("v") || 1; res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ size: M[v].length, sha256: SHA[v] })) }
  if (u.pathname === "/__test/log") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(log)); if (u.searchParams.get("clear")) log.length = 0; return }
  if (u.pathname === "/__test/model.bin") {
    const q = Object.fromEntries(u.searchParams), v = +q.v || 1, key = q.k || "";
    log.push({ k: key, range: req.headers.range || null, t: Date.now() });
    if (q.down) return req.socket.destroy();
    let body = M[v]; if (q.bad) { body = Buffer.from(body); body[1234567] ^= 0xff } if (q.extra) body = Buffer.concat([body, Buffer.alloc(1048576)]);
    let start = 0; const m = !q.norange && (req.headers.range || "").match(/bytes=(\d+)-/);
    if (m) start = +m[1];
    if (start >= body.length) { res.writeHead(416, { "content-range": "bytes */" + body.length }); return res.end() }
    const h = { "content-type": "application/octet-stream", "accept-ranges": "bytes", "content-length": body.length - start };
    if (m) { h["content-range"] = "bytes " + start + "-" + (body.length - 1) + "/" + body.length; res.writeHead(206, h) } else res.writeHead(200, h);
    const cut = q.cut != null && !cutDone.has(key) ? +q.cut : -1; let sent = 0;
    for (let o = start; o < body.length; o += 262144) {
      const ch = body.subarray(o, Math.min(body.length, o + 262144));
      if (cut >= 0 && sent + ch.length > cut) { cutDone.add(key); res.write(ch.subarray(0, Math.max(0, cut - sent))); await new Promise(r => setTimeout(r, 30)); return req.socket.destroy() }
      if (!res.write(ch)) await new Promise(r => res.once("drain", r));
      sent += ch.length; if (q.slow) await new Promise(r => setTimeout(r, +q.slow));
    }
    return res.end();
  }
  let f = path.join(ROOT, decodeURIComponent(u.pathname)); if (u.pathname.endsWith("/")) f = path.join(f, "index.html");
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end() }
  fs.stat(f, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404); return res.end("introuvable") }
    res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream", "content-length": st.size, "cache-control": "no-store" });
    fs.createReadStream(f).pipe(res);
  });
}).listen(PORT, "127.0.0.1", () => console.log("serveur de test sur http://localhost:" + PORT));
