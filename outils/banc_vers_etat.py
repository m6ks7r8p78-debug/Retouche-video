#!/usr/bin/env python3
"""Convertit un résultat de banc multi-cas (tests/banc_filtres_app.mjs → banc_app.json) en entrée « mesure » de
suivi/etat-modules.json, selon la normalisation figée dans BENCHMARK_PROTOCOL.md §6.1. Aucune valeur n'est inventée :
un cas en erreur compte comme un échec de gravité maximale.

  python3 outils/banc_vers_etat.py tests/sorties/f10/banc_app.json --module filtres_ar [--etat suivi/etat-modules.json] [--ecrire]
"""
import argparse, json, sys


def cas_filtre(c):
    """Normalisation d'un cas de retrait de filtre : retourne (qualité 0–1, échec, gravité 0–1, détail)."""
    if c.get("erreur"):
        return 0.0, True, 1.0, "erreur d'exécution"
    s, a = c["sans"], c["avec"]
    if not s["ecart_zone"] or s["ecart_zone"] <= 0:
        return None
    retrait = max(0.0, min(1.0, 1 - a["ecart_zone"] / s["ecart_zone"]))
    scint = a["scintillement"] > s["scintillement"] * 1.02
    lpips = a["lpips_tete"] >= s["lpips_tete"]
    q = retrait * (0.5 if scint else 1) * (0.5 if lpips else 1)
    echec = retrait < 0.5 or scint or lpips
    grav = max(1 - retrait, 0.5 if (scint or lpips) else 0) if echec else 0.0
    return q, echec, grav, f"retrait {retrait:.2f}{' +scintillement' if scint else ''}{' +LPIPS pire' if lpips else ''}"


def resumer(banc):
    lignes = [(c["cas"], cas_filtre(c)) for c in banc["resultats"]]
    lignes = [(n, r) for n, r in lignes if r is not None]
    if not lignes:
        raise SystemExit("aucun cas exploitable")
    n = len(lignes)
    echecs = [r for _, r in lignes if r[1]]
    return {
        "qualite_mesuree": round(sum(r[0] for _, r in lignes) / n, 4),
        "taux_echec": round(len(echecs) / n, 4),
        "gravite": round(sum(r[2] for r in echecs) / len(echecs), 4) if echecs else 0.0,
        "nb_cas": n, "source": "mesure", "donnees": banc.get("donnees", "synthetique"),
        "preuve": f"{banc.get('banc')} du {banc.get('date', '')[:10]} : " + " ; ".join(f"{k} {r[3]}" for k, r in lignes),
    }


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("banc")
    ap.add_argument("--module", required=True)
    ap.add_argument("--etat", default="suivi/etat-modules.json")
    ap.add_argument("--ecrire", action="store_true")
    a = ap.parse_args(argv)
    with open(a.banc, encoding="utf-8") as f:
        banc = json.load(f)
    r = resumer(banc)
    print(json.dumps(r, ensure_ascii=False, indent=1))
    if a.ecrire:
        with open(a.etat, encoding="utf-8") as f:
            etat = json.load(f)
        m = next((x for x in etat["modules"] if x["module"] == a.module), None)
        if not m:
            raise SystemExit(f"module inconnu : {a.module}")
        m.update(r)
        with open(a.etat, "w", encoding="utf-8") as f:
            json.dump(etat, f, ensure_ascii=False, indent=1)
            f.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
