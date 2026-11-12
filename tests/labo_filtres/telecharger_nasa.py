# Visages variés du domaine public (NASA) pour apprendre au détecteur ce qu'il ne doit PAS effacer :
# mains et doigts près du visage, lunettes, casques, micros, bijoux, nourriture, téléphones, fumée de bougie…
# Les images ne sont pas versionnées (taille) : ce script les retélécharge à l'identique depuis la liste `nasa_sources.json`.
#   python3 tests/labo_filtres/telecharger_nasa.py DOSSIER [--chercher]
import os, sys, json, time, urllib.request, urllib.parse, cv2, numpy as np
ICI = os.path.dirname(os.path.abspath(__file__)); D = sys.argv[1]; os.makedirs(D, exist_ok=True)
LISTE = os.path.join(ICI, 'nasa_sources.json')
REQ = ['astronaut portrait glasses', 'astronaut eating', 'crew drinking coffee', 'astronaut selfie', 'astronaut hand face',
       'employee portrait', 'intern portrait', 'engineer glasses portrait', 'astronaut headset', 'scientist portrait',
       'astronaut phone call', 'student portrait', 'crew lunch', 'astronaut smiling close up', 'astronaut thinking',
       'astronaut earrings', 'astronaut makeup', 'portrait woman engineer', 'portrait man beard', 'astronaut candid']
def get(u):
    for _ in range(3):
        try: return urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'RetoucheProAI-labo'}), timeout=30).read()
        except Exception: time.sleep(2)
    return None
if '--chercher' in sys.argv:
    vus, liste = set(), []
    for q in REQ:
        for page in (1, 2):
            j = get('https://images-api.nasa.gov/search?' + urllib.parse.urlencode({'q': q, 'media_type': 'image', 'page': page}))
            if not j: continue
            for it in json.loads(j)['collection']['items']:
                d = it['data'][0]; nid = d['nasa_id']
                if nid in vus or not it.get('links'): continue
                vus.add(nid); liste.append({'nasa_id': nid, 'titre': d.get('title', ''), 'url': it['links'][0]['href'].replace('~thumb', '~medium'),
                                            'credit': 'NASA (domaine public)', 'requete': q})
    json.dump(liste, open(LISTE, 'w'), ensure_ascii=False, indent=0); print(len(liste), 'trouvées')
import noyau as N   # repérage du visage : on ne garde que les photos avec un visage assez grand
liste = json.load(open(LISTE)); gardees = []
for s in liste:
    f = os.path.join(D, s['nasa_id'].replace('/', '_') + '.jpg')
    if not os.path.exists(f):
        b = get(s['url'])
        if not b: continue
        im = cv2.imdecode(np.frombuffer(b, np.uint8), 1)
        if im is None: continue
        L = N.reperes(im)
        if L is None or N.repere_visage(L)[3] < 35: continue   # visage absent ou trop petit (écart des yeux < 35 px)
        cv2.imwrite(f, im, [cv2.IMWRITE_JPEG_QUALITY, 93])
    gardees.append(dict(s, fichier=os.path.basename(f)))
json.dump(gardees, open(os.path.join(D, 'sources.json'), 'w'), ensure_ascii=False, indent=0); print(len(gardees), 'gardées dans', D)
