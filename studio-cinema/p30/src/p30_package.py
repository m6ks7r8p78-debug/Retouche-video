"""Cinema P30 — deterministic, self-contained synthetic iPhone manual test ZIP.

Reads generated P29 preview only; never reads personal media.
A SHA256 inventory and exact byte-for-byte P29 safe evidence validation protect
against accidentally bundling arbitrary data or an altered demo.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

SCHEMA="retouche-cinema-p30-iphone-manual-package-v1"
P29_SCHEMA="retouche-cinema-p29-synthetic-mobile-preview-v1"
P30_MANUAL_PAGE="test-iphone.html"
P29_FILES=("index.html","preview.js","preview.css","preview-data.js")
P30_FILES=("test-iphone.html","iphone-check.css","iphone-check.js")
FILE_LIMIT=100_000
GUIDE="""CINEMA P30 — MODE D'EMPLOI IPHONE (DÉMONSTRATION FICTIVE)

CE QUE CE TEST FAIT :
Il présente des chiffres provenant de dessins vectoriels fictifs et teste
l'affichage, les boutons et la possibilité de conserver un rapport JSON local.
Il ne peut pas importer de vidéo, exporter une vidéo, modifier vos médias ou
envoyer un fichier sur un serveur. Il ne confirme aucun résultat sur des vidéos réelles.

OUVRIR DEPUIS L'IPHONE :
1. Télécharger le fichier Cinema_P30_iPhone_demo.zip depuis l'artefact GitHub
   du laboratoire. Sur iPhone : Fichiers > Téléchargements > toucher le ZIP
   pour l'extraire.
2. Pour un test HTTP(S) fonctionnel de Safari, publier MANUELLEMENT le contenu
   du ZIP sur un hébergement HTTPS de démonstration que vous contrôlez,
   distinct de retoucheproai.com et de l'application publique. Aucun
   déploiement ne peut être déclenché par le laboratoire.
3. Safari iPhone : ouvrir l'adresse HTTPS temporaire de l'index.html.
   L'écran doit indiquer « Démonstration synthétique », puis 9/9 et 3/9.
   Toucher « Pourquoi cet avertissement ? » pour ouvrir et refermer.
4. Ouvrir « Vérifier sur mon iPhone » (lien sur la même page).
   Cocher uniquement les observations réellement constatées.
   Toucher « Créer mon rapport local ».
5. Utiliser « Copier le rapport » ou « Enregistrer en JSON ».
   Si le téléchargement est refusé, sélectionner et copier le texte du champ.
   Aucun rapport n'est envoyé automatiquement. Vous décidez de le transmettre.

IMPORTANT :
- Une page HTML ouverte avec file:// via Fichiers n'exécute pas toujours les
  scripts comme une page HTTPS ; ne pas considérer cet essai comme un test
  Safari physique réussi en cas de blocage des fichiers locaux.
- Le rapport est une déclaration de l'utilisateur, sans attestation matérielle
  indépendante. Une case cochée ne certifie pas l'iPhone ou Safari.
- Le test ne comprend aucun import, conversion, IA neuronale, format 4K/HDR,
  export sur X, ni preuve de qualité humaine. Pas de photo/vidéo personnelle.
- Ne pas publier de médias privés et ne pas déployer sur retoucheproai.com.
- Le ZIP contient un MANIFEST_SHA256.txt ; vérifier l'intégrité du paquet
  avant de l'employer lorsque votre environnement le permet.
- Le téléphone iPhone et Safari doivent être testés par l'utilisateur lui-même.

PREUVE TECHNIQUE : synthétique et navigateur Linux seulement avant ce test.
"""
LANDING='<nav class="p30-next" aria-label="Parcours de test manuel P30"><a href="./test-iphone.html">Vérifier sur mon iPhone — test manuel</a></nav>'
LANDING_STYLE='<style> .p30-next{margin:22px 0 0}.p30-next a{display:block;text-align:center;max-width:480px;padding:16px;border:1px solid #3048d3;background:#3048d3;color:white;border-radius:14px;font-weight:700;text-decoration:none;min-height:48px}.p30-next a:focus-visible{outline:3px solid #5769f4;outline-offset:4px}</style>'


def sha(data:bytes)->str:
    return hashlib.sha256(data).hexdigest()


def valid_p29(folder:Path):
    report_path=folder/"p29_synthetic_preview_report.json"
    if not report_path.is_file() or report_path.is_symlink():
        raise ValueError("P29 generated proof JSON missing")
    report=json.loads(report_path.read_text(encoding="utf-8"))
    if report.get("schema")!=P29_SCHEMA or report.get("preview_only") is not True:
        raise ValueError("P29 evidence schema mismatch")
    p=report.get("proof",{})
    wanted={
       "schema":P29_SCHEMA,
       "status":"verified_synthetic_preview_only",
       "source_label":"Démonstration de laboratoire — dessins fictifs",
       "benchmark_cases":9,
       "cases_color_error_increase":9,
       "cases_file_larger_no_gain":3,
       "cases_temporal_pixel_change":9,
       "cases_audio_preserved":9,
       "user_video_analyzed":False,
       "may_modify_or_export_video":False,
       "physical_iphone_safari_tested":False,
       "recommendation":None
    }
    if type(p) is not dict or p!=wanted:
        raise ValueError("P29 bounded synthetic evidence incomplete or modified")
    if report.get("files")!=["index.html","preview.js","preview.css","preview-data.js"]:
        raise ValueError("P29 file list changed")
    text='"use strict";\nwindow.CINEMA_P29_SYNTHETIC=Object.freeze(' + json.dumps(
        p,ensure_ascii=False,separators=(",",":")) + ');\n'
    if (folder/"preview-data.js").read_bytes()!=text.encode("utf-8"):
        raise ValueError("P29 source data differs from validated evidence")
    for name in P29_FILES:
        file=folder/name
        if file.is_symlink() or not file.is_file() or not 1<=file.stat().st_size<=FILE_LIMIT:
            raise ValueError("Missing or oversized P29 source asset: "+name)
    html=(folder/"index.html").read_text(encoding="utf-8")
    if "connect-src 'none'" not in html or "media-src 'none'" not in html or (
        "Aucune de vos vidéos n'a été analysée." not in html):
        raise ValueError("P29 source page removed privacy boundary")
    return p


def source_p30():
    path=Path(__file__).resolve().parents[1]/"preview"
    for name in P30_FILES:
        file=path/name
        if file.is_symlink() or not file.is_file() or not 1<=file.stat().st_size<=FILE_LIMIT:
            raise ValueError("Missing or oversized P30 source asset: "+name)
    html=(path/P30_MANUAL_PAGE).read_text(encoding="utf-8")
    if ("connect-src 'none'" not in html or "Aucune" not in html or
        'id="report-json"' not in html or 'type="file"' in html):
        raise ValueError("P30 manual checklist not privacy-safe")
    return path


def bundle(source:Path,out:Path):
    source=Path(source)
    out=Path(out)
    valid_p29(source)
    p30=source_p30()
    out.mkdir(parents=True,exist_ok=True)
    directory=out/"Cinema_P30_iPhone_demo"
    directory.mkdir(parents=True,exist_ok=True)
    files={}
    for name in P29_FILES:
        data=(source/name).read_bytes()
        if name=="index.html":
            text=data.decode("utf-8")
            if text.count("</head>")!=1 or text.count("<footer>")!=1:
                raise ValueError("Source P29 HTML changed unexpectedly")
            # CSS cannot be inlined under CSP. Use package-only external style.
            text=text.replace('<footer>',LANDING+'\n    <footer>',1)
            text=text.replace('</head>','<link rel="stylesheet" href="./iphone-check.css">\n</head>',1)
            data=text.encode("utf-8")
        files[name]=data
    for name in P30_FILES:
        files[name]=(p30/name).read_bytes()
    files["GUIDE_IPHONE.txt"]=GUIDE.encode("utf-8")
    for name,content in files.items():
        if Path(name).name!=name or len(content)>FILE_LIMIT:
            raise ValueError("Unsafe static package file")
        (directory/name).write_bytes(content)
    inventory={name:sha(files[name]) for name in sorted(files)}
    manifest=("SHA-256 — fichiers Cinema P30 (hors MANIFEST_SHA256.txt)\n"+
       "".join(f"{inventory[name]}  {name}\n" for name in sorted(files)))
    files["MANIFEST_SHA256.txt"]=manifest.encode("utf-8")
    (directory/"MANIFEST_SHA256.txt").write_bytes(files["MANIFEST_SHA256.txt"])
    evidence={
      "schema":SCHEMA,"status":"synthetic_manual_package_built",
      "content_scope":"P29_P28_verified_fictional_only",
      "user_media_included":False,"external_network_resources":False,
      "automatic_media_export":False,"automatic_upload":False,
      "physical_iphone_safari_verified":False,
      "zip_name":"Cinema_P30_iPhone_demo.zip",
      "files_sha256":inventory,
    }
    evidence_bytes=(json.dumps(evidence,ensure_ascii=False,indent=2)+"\n").encode("utf-8")
    (out/"p30_package_proof.json").write_bytes(evidence_bytes)
    archive=out/"Cinema_P30_iPhone_demo.zip"
    with ZipFile(archive,"w",compression=ZIP_DEFLATED,compresslevel=9) as zip:
        for name in sorted(files):
            info=ZipInfo(name,date_time=(2020,1,1,0,0,0))
            info.compress_type=ZIP_DEFLATED
            info.external_attr=0o100644<<16
            zip.writestr(info,files[name],compress_type=ZIP_DEFLATED,compresslevel=9)
    with ZipFile(archive) as check:
        names=check.namelist()
        if names!=sorted(files) or any(check.read(n)!=files[n] for n in names):
            raise RuntimeError("P30 ZIP roundtrip failed")
        if check.testzip() is not None:
            raise RuntimeError("P30 ZIP CRC failed")
    evidence["zip_sha256"]=sha(archive.read_bytes())
    (out/"p30_package_proof.json").write_text(
       json.dumps(evidence,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return evidence


def cli():
    parser=argparse.ArgumentParser()
    parser.add_argument("--source",type=Path,required=True)
    parser.add_argument("--out",type=Path,required=True)
    args=parser.parse_args()
    report=bundle(args.source,args.out)
    print(json.dumps({"status":report["status"],"zip":report["zip_name"],
       "file_count":len(report["files_sha256"]),"physical_iphone_tested":False,
       "private_files":False},indent=2))


if __name__=="__main__":
    cli()
