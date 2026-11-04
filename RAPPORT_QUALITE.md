# Rapport qualité (mesures réelles, médias de test libres de droits)

| Cas | Avant | Après | Méthode |
|---|---|---|---|
| Portrait abîmé, IA Équilibré | LPIPS 0,374 (agrandissement simple) | 0,186 | PSNR/SSIM/LPIPS contre l’original intact |
| Chat abîmé, IA Équilibré | 0,498 | 0,321 | idem |
| Portrait sombre, Faible luminosité | LPIPS 0,421, PSNR 8,84 | 0,347, 15,36 dB | idem |
| Visages : mélange classique (essai retiré) | 0,370 | 0,459 (pire) | LPIPS sur la zone du visage |
| Calcul WebGPU 4 pixels/fil | — | 0 écart sur 1 056 000 valeurs | comparaison directe |

Inspection visuelle faite à chaque fois (planches dans tests/sorties, non livrées). Limites : visages minuscules lissés par l’IA ;
Nuit → jour s’éloigne volontairement de l’original (LPIPS 0,353). Aucun test d’écoute audio humaine n’a été possible ici.
