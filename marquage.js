/* ===== v5.8 : marquage lisible par machine des contenus modifiés par IA générative =====
   Règlement européen sur l'IA (AI Act), article 50, paragraphe 2 (applicable depuis le 2 août 2026) : les images dont une partie
   a été inventée par une IA doivent porter un marquage détectable par machine. On écrit dans le fichier les métadonnées XMP
   standard de l'IPTC (« DigitalSourceType » = composite avec média généré par IA), reconnues par Google, Adobe, Meta, etc.
   Les simples améliorations (couleurs, netteté, agrandissement) relèvent de l'exception « édition standard » et ne sont pas marquées.
   L'image elle-même n'est pas modifiée : seules des métadonnées sont ajoutées. */
window.MARQUAGE = (() => {
  const TYPE = "http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia";
  const esc = s => String(s).replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);
  function xmp({ outil = "RetoucheProAI", modele = "", date = new Date().toISOString() } = {}) {
    return '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
      '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
      '<rdf:Description rdf:about="" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"' +
      ' Iptc4xmpExt:DigitalSourceType="' + TYPE + '" xmp:CreatorTool="' + esc(outil) + '" xmp:MetadataDate="' + esc(date) + '">' +
      '<dc:description><rdf:Alt><rdf:li xml:lang="x-default">' + esc("Image modifiée : certaines zones ont été générées par IA" + (modele ? " (" + modele + ")" : "") + " avec " + outil + ".") +
      '</rdf:li></rdf:Alt></dc:description></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
  }
  const enc = s => new TextEncoder().encode(s);
  /* JPEG : segment APP1 « http://ns.adobe.com/xap/1.0/ » inséré juste après le début du fichier (et après un éventuel APP0 JFIF) */
  function jpeg(u8, x) {
    if (u8[0] !== 0xFF || u8[1] !== 0xD8) throw new Error("pas un JPEG");
    const ns = enc("http://ns.adobe.com/xap/1.0/\0"), data = enc(x), len = 2 + ns.length + data.length;
    if (len > 65535) throw new Error("XMP trop long");
    let p = 2; if (u8[2] === 0xFF && u8[3] === 0xE0) p = 4 + ((u8[4] << 8) | u8[5]);
    const seg = new Uint8Array(4 + ns.length + data.length); seg.set([0xFF, 0xE1, len >> 8, len & 255]); seg.set(ns, 4); seg.set(data, 4 + ns.length);
    const o = new Uint8Array(u8.length + seg.length); o.set(u8.subarray(0, p)); o.set(seg, p); o.set(u8.subarray(p), p + seg.length); return o;
  }
  /* PNG : morceau iTXt « XML:com.adobe.xmp » placé après IHDR */
  const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })();
  const crc = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0 };
  function png(u8, x) {
    const sig = [137, 80, 78, 71, 13, 10, 26, 10]; for (let i = 0; i < 8; i++) if (u8[i] !== sig[i]) throw new Error("pas un PNG");
    const ihdrFin = 8 + 12 + ((u8[8] << 24) | (u8[9] << 16) | (u8[10] << 8) | u8[11]);
    const corps = new Uint8Array([...enc("iTXt"), ...enc("XML:com.adobe.xmp"), 0, 0, 0, 0, 0, ...enc(x)]);
    const n = corps.length - 4, ch = new Uint8Array(12 + n), dv = new DataView(ch.buffer);
    dv.setUint32(0, n); ch.set(corps, 4); dv.setUint32(8 + n, crc(corps));
    const o = new Uint8Array(u8.length + ch.length); o.set(u8.subarray(0, ihdrFin)); o.set(ch, ihdrFin); o.set(u8.subarray(ihdrFin), ihdrFin + ch.length); return o;
  }
  /* renvoie un nouveau fichier marqué ; en cas de format inattendu, renvoie l'original (jamais d'échec d'export à cause du marquage) */
  async function marquer(blob, info) {
    try {
      const u8 = new Uint8Array(await blob.arrayBuffer()), x = xmp(info);
      const r = blob.type === "image/png" ? png(u8, x) : blob.type === "image/jpeg" ? jpeg(u8, x) : null;
      return r ? new Blob([r], { type: blob.type }) : blob;
    } catch (e) { return blob }
  }
  return { marquer, xmp, _jpeg: jpeg, _png: png, TYPE };
})();
