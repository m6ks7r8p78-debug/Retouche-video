#!/usr/bin/env python3
"""Retouche Cinema AI P2: explicit text-only, operator-controlled ComfyUI rendering gateway.

No weights or private user media included. Does not run remotely unless --execute is supplied.
ComfyUI API endpoints are documented at https://docs.comfy.org/development/comfyui-server/comms_routes
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import time
from urllib.parse import urlsplit, urlencode
import ipaddress
import socket
import requests

SCHEMA = "cinema-p2-render-v01"
MAX_CLIPS = 120
MAX_SECONDS = 600
MAX_PROMPT = 3000
ALLOWED_TOP = {"schema_version", "project_kind", "created_by", "source_mode", "reference_note", "model_engine", "rendered_video", "total_duration_seconds", "format", "consent", "shots", "characters", "objects", "clips"}
ALLOWED_CLIP = {"clip_id", "shot_id", "part", "parts", "sequence", "start_seconds", "duration_seconds", "format", "seed", "prompt", "continuity", "status", "output"}
VIDEO_MIMES = {"video/mp4", "video/webm", "image/gif"}

class RenderError(ValueError):
    pass

def ensure(value, message):
    if not value: raise RenderError(message)

def validate_manifest(manifest):
    ensure(isinstance(manifest, dict), "Manifeste invalide")
    ensure(manifest.get("schema_version") == SCHEMA, "Schéma de rendu inconnu")
    ensure(set(manifest).issubset(ALLOWED_TOP), "Le manifeste contient des champs inconnus ou des références média")
    ensure(manifest.get("model_engine") == "not_connected", "Champ model_engine falsifié")
    ensure(manifest.get("rendered_video") is None, "Aucun rendu préexistant accepté")
    consent = manifest.get("consent") or {}
    ensure(consent.get("reference_media_included") is False, "Référence média interdite")
    ensure(consent.get("remote_transfer_approved") is False, "Approbation de réseau non transmissible")
    ensure(consent.get("training_allowed") is False, "Entraînement interdit")
    ensure(consent.get("project_rights_confirmed") is True, "Droits non confirmés")
    clips = manifest.get("clips")
    ensure(isinstance(clips, list) and 1 <= len(clips) <= MAX_CLIPS, "Clips invalides")
    total = 0
    ids = set()
    for clip in clips:
        ensure(isinstance(clip, dict), "Clip invalide")
        ensure(set(clip).issubset(ALLOWED_CLIP), "Champ clip inconnu ou média inclus")
        cid = clip.get("clip_id")
        ensure(isinstance(cid, str) and re.fullmatch(r"shot_[A-Za-z0-9_]+_part_\d+", cid), "ID clip invalide")
        ensure(cid not in ids, "ID clip dupliqué")
        ids.add(cid)
        dur = clip.get("duration_seconds")
        ensure(type(dur) is int and 1 <= dur <= 5, "Durée clip invalide")
        ensure(type(clip.get("start_seconds")) is int and clip["start_seconds"] == total, "Ordre temporel incohérent")
        total += dur
        prompt = clip.get("prompt")
        ensure(isinstance(prompt, str) and 10 <= len(prompt) <= MAX_PROMPT, "Prompt invalide")
        ensure(clip.get("status") == "not_submitted" and clip.get("output") is None, "Faux rendu existant")
        continuity = clip.get("continuity")
        ensure(isinstance(continuity, dict) and isinstance(continuity.get("character_ids"), list), "Continuité invalide")
        ensure(not any(k in clip for k in ("image", "video", "audio", "bytes", "base64", "reference_uri")), "Référence interdite")
    ensure(type(manifest.get("total_duration_seconds")) is int and total == manifest["total_duration_seconds"] and total <= MAX_SECONDS, "Durée finale incohérente")
    ensure(manifest.get("source_mode") in ("text", "photo", "video"), "Mode de création invalide")
    ensure(manifest.get("format") in ("16:9", "9:16"), "Format invalide")
    return manifest

def load_manifest(path):
    p = Path(path)
    ensure(p.is_file() and p.stat().st_size <= 1_500_000, "Manifeste manquant ou trop volumineux")
    manifest = json.loads(p.read_text(encoding="utf-8"))
    return validate_manifest(manifest)

def check_server_url(url: str, allow_remote: bool = False):
    """No DNS-based remote inference unless explicitly allowed, and never pass URL supplied in manifest."""
    s = urlsplit(url)
    ensure(s.scheme in ("http", "https") and s.hostname and not s.username and not s.password, "URL moteur invalide")
    ensure(not s.query and not s.fragment and s.path in ("", "/"), "L'URL du moteur doit être sa racine")
    ensure(s.port is None or 1 <= s.port <= 65535, "Port invalide")
    if not allow_remote:
        ensure(s.hostname in ("127.0.0.1", "localhost", "::1"), "Hôte distant interdit sans --allow-remote")
    return s.geturl().rstrip("/")

def load_workflow(path, mapping):
    """Operator must supply *ComfyUI API-format* workflow and node input mappings."""
    w = json.loads(Path(path).read_text(encoding="utf-8"))
    ensure(isinstance(w, dict) and len(w) >= 2 and len(w) <= 500, "Workflow ComfyUI invalide")
    for node_id in (mapping["prompt_node"], mapping["seed_node"]):
        ensure(node_id in w and isinstance(w[node_id], dict), "Nœud déclaré introuvable")
        ensure(isinstance(w[node_id].get("inputs"), dict) and isinstance(w[node_id].get("class_type"), str), "Workflow non exporté en format API")
    ensure(mapping["prompt_input"] in w[mapping["prompt_node"]]["inputs"], "Entrée de prompt inexistante")
    ensure(mapping["seed_input"] in w[mapping["seed_node"]]["inputs"], "Entrée de seed inexistante")
    # Prevent workflows with input/upload from silently sending files: no reference payload in this version.
    return w

def make_workflow(template, mapping, clip):
    w = copy.deepcopy(template)
    w[mapping["prompt_node"]]["inputs"][mapping["prompt_input"]] = clip["prompt"]
    w[mapping["seed_node"]]["inputs"][mapping["seed_input"]] = int(clip["seed"])
    # Optional FPS/duration mapping varies with installed models; operator owns full template.
    return w

def load_mapping(path):
    m = json.loads(Path(path).read_text(encoding="utf-8"))
    ensure(isinstance(m, dict), "Mapping invalide")
    for key in ("prompt_node", "prompt_input", "seed_node", "seed_input"):
        ensure(isinstance(m.get(key), str) and re.fullmatch(r"[A-Za-z0-9_]{1,70}", m[key]), "Mapping manquant ou invalide: " + key)
    return m

class ComfyClient:
    def __init__(self, url, allow_remote=False, session=None):
        self.url = check_server_url(url, allow_remote)
        self.session = session or requests.Session()
    def post_prompt(self, workflow):
        r = self.session.post(self.url+"/prompt", json={"prompt": workflow}, timeout=60)
        r.raise_for_status()
        data = r.json()
        ensure(isinstance(data, dict) and isinstance(data.get("prompt_id"), str), "ComfyUI n'a pas accepté le job")
        return data["prompt_id"]
    def wait_for_video(self, prompt_id, timeout=3600, poll_seconds=3):
        ensure(re.fullmatch(r"[A-Za-z0-9_-]{6,100}", prompt_id or ""), "Identifiant ComfyUI invalide")
        deadline=time.monotonic()+timeout
        while time.monotonic()<deadline:
            r=self.session.get(self.url+"/history/"+prompt_id,timeout=30)
            r.raise_for_status(); d=r.json()
            ensure(isinstance(d,dict),"Réponse historique invalide")
            record=d.get(prompt_id)
            if record:
                if record.get("status",{}).get("status_str")=="error":
                    raise RenderError("ComfyUI a signalé une erreur de rendu")
                outputs=record.get("outputs") or {}
                for node in outputs.values():
                    for media_key in ("videos", "gifs"):
                        for item in node.get(media_key,[]):
                            if isinstance(item,dict) and isinstance(item.get("filename"),str):
                                return item
                # Images alone are not a completed video; never mislabel as video.
                raise RenderError("Le workflow s'est terminé sans fichier vidéo : vérifier le nœud de sauvegarde vidéo")
            time.sleep(poll_seconds)
        raise TimeoutError("Temps d'attente ComfyUI dépassé")
    def download_video(self,item,target,max_bytes=120_000_000):
        name=item.get("filename","")
        ensure(isinstance(name,str) and len(name)<200 and re.search(r"\.(mp4|webm|gif)$",name,re.I),"Sortie ComfyUI non vidéo")
        ensure(not any(x in name for x in ('..','/','\\','\0')),"Nom de sortie vidéo invalide")
        params={"filename":name,"subfolder":item.get("subfolder", ""),"type":item.get("type","output")}
        ensure(params["type"] in ("output", "temp"),"Dossier ComfyUI interdit")
        ensure(isinstance(params["subfolder"],str) and not any(x in params["subfolder"] for x in ('..','\\')),"Sous-dossier invalide")
        r=self.session.get(self.url+"/view",params=params,stream=True,timeout=120)
        r.raise_for_status()
        target=Path(target);target.parent.mkdir(parents=True,exist_ok=True)
        tmp=target.with_suffix(target.suffix+".part")
        count=0; h=hashlib.sha256()
        try:
            with tmp.open("wb") as f:
                for chunk in r.iter_content(chunk_size=1_048_576):
                    if not chunk: continue
                    count+=len(chunk)
                    ensure(count<=max_bytes,"Fichier de sortie trop volumineux")
                    f.write(chunk);h.update(chunk)
            ensure(count>=128,"Fichier vidéo vide ou invalide")
            # Reject obviously nonvideo HTTP bodies; ffprobe validation is recommended separately.
            magic=tmp.open("rb").read(64)
            ensure(b"ftyp" in magic or magic.startswith(b"\x1a\x45\xdf\xa3") or magic.startswith((b"GIF87a",b"GIF89a")),"Fichier retourné sans en-tête vidéo valide")
            tmp.replace(target)
            return {"file":target.name,"bytes":count,"sha256":h.hexdigest()}
        finally:
            if tmp.exists():tmp.unlink()

def execute(manifest,workflow_path,mapping_path,url,out_dir,allow_remote=False,limit=None):
    validate_manifest(manifest)
    mapping=load_mapping(mapping_path)
    workflow=load_workflow(workflow_path,mapping)
    client=ComfyClient(url,allow_remote)
    out=Path(out_dir);out.mkdir(parents=True,exist_ok=True)
    results=[]
    for clip in manifest["clips"][:limit]:
        clip_id=clip["clip_id"]
        try:
            prompt_id=client.post_prompt(make_workflow(workflow,mapping,clip))
            video=client.wait_for_video(prompt_id)
            suffix=Path(video["filename"]).suffix.lower()
            downloaded=client.download_video(video,out/(clip_id+suffix))
            results.append({"clip_id":clip_id,"status":"completed","prompt_id":prompt_id,**downloaded})
        except (requests.RequestException,RenderError,TimeoutError,OSError) as exc:
            results.append({"clip_id":clip_id,"status":"failed","reason":type(exc).__name__+": "+str(exc)[:200]})
            # Stop on failure: do not imply the feature generated the whole film.
            break
    report={"engine":"comfyui_operator_workflow","video_model_connected":True,"completed":sum(x["status"]=="completed" for x in results),"submitted":len(results),"total":len(manifest["clips"]),"results":results,
        "media_sent":False,"reference_media_included":False,"training_allowed":False}
    (out/"render_report.json").write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding="utf-8")
    return report

def main(argv=None):
    p=argparse.ArgumentParser(description="Retouche Cinema P2 — aucun transfert sans --execute explicite")
    p.add_argument("manifest",help="Manifeste JSON exporté depuis le studio P2")
    p.add_argument("--workflow",help="Workflow ComfyUI exporté en format API (opérateur)")
    p.add_argument("--mapping",help="Mapping prompt/seed vers les IDs des nœuds (opérateur)")
    p.add_argument("--url",default="http://127.0.0.1:8188")
    p.add_argument("--out",default="./rendus_prives")
    p.add_argument("--execute",action="store_true",help="Autoriser l'envoi des prompts texte au moteur configuré")
    p.add_argument("--allow-remote",action="store_true",help="Autoriser explicitement une URL distante (attention confidentialité)")
    p.add_argument("--limit",type=int,default=None,help="Limiter le nombre de clips (pilotage)")
    args=p.parse_args(argv)
    manifest=load_manifest(args.manifest)
    if not args.execute:
        print(json.dumps({"valid":True,"clips":len(manifest["clips"]),"seconds":manifest["total_duration_seconds"],"network_requests":0,"model_connected":False},ensure_ascii=False))
        return 0
    ensure(args.workflow and args.mapping,"Workflow et mapping obligatoires avec --execute")
    ensure(args.limit is None or args.limit>0,"Limite invalide")
    report=execute(manifest,args.workflow,args.mapping,args.url,args.out,args.allow_remote,args.limit)
    print(json.dumps(report,ensure_ascii=False,indent=2))
    return 0 if report["completed"]==report["submitted"] and (args.limit is not None or report["completed"]==report["total"]) else 1

if __name__=="__main__":raise SystemExit(main())

