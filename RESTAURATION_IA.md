# Restauration, suppression d'éléments AR et reconstruction — étude (4 novembre 2026)

**Rien de ce document n'est intégré à l'app à ce jour.** C'est l'étude préalable demandée (section 5 du cahier des charges) :
modèles, licences vérifiées, besoins matériels, faisabilité sur iPhone, et plan de prototypes. Les licences ont été lues
sur les pages officielles le 4 novembre 2026 ; elles doivent être relues avant toute intégration.

## Point de départ honnête

- Un filtre AR **remplace** des pixels. Ce qui était dessous n'est plus dans le fichier. Le retirer = **reconstruction générative**
  (classe C), jamais une restauration fidèle (classe A). L'app devra l'afficher comme telle, avec le masque des zones inventées.
- Le retrait de filtres **de couleur** existe déjà (25 tables apprises, `filtres.png`) : c'est une vraie restauration (classe A/B).
- Si l'app devient un jour payante, les licences **non commerciales** excluent ces modèles ; elles les excluent déjà d'une app publique par prudence.

## Modèles étudiés

| Rôle | Modèle | Licence vérifiée | Taille / besoins | iPhone (Safari) ? | Verdict |
|---|---|---|---|---|---|
| Segmentation image + vidéo (trouver les oreilles, museau, lunettes AR) | SAM 2.1 tiny / small (Meta) | Apache-2.0, code **et** poids ([dépôt](https://github.com/facebookresearch/sam2)) | 38,9 M / 46 M de paramètres | possible en ONNX, lent ; à mesurer | **retenu pour prototype** (masques désignés au doigt) |
| Segmentation vidéo légère | EdgeTAM (Meta) | Apache-2.0 selon la fiche ([Hugging Face](https://huggingface.co/facebook/EdgeTAM/blob/refs%2Fpr%2F1/README.md)) | annoncé 16 i/s sur iPhone 15 Pro Max (en natif, chiffre des auteurs) | en web : non mesuré | **candidat** pour le suivi image par image |
| Remplissage d'image (« effacer » une zone) | MI-GAN (Picsart) | MIT ([fiche ONNX](https://huggingface.co/edgetools/migan)) | petit réseau mobile ; ONNX annoncé compatible onnxruntime-web (WASM/WebGPU) | **oui, a priori** (même moteur que le relief) | **retenu pour le 1er prototype** |
| Remplissage vidéo cohérent | ProPainter | NTU S-Lab 1.0, **non commercial** ([dépôt](https://www.github.com/sczhou/ProPainter)) | 2 à 28 Go de mémoire GPU selon résolution (3 Go en 320×240, 19 Go en 720p fp16) | non | **écarté de l'app** (licence + mémoire) ; usage personnel en cloud seulement |
| Restauration de visage | CodeFormer | S-Lab, **non commercial** | ~350 Mo | non | **écarté** (déjà décidé : DECISIONS.md) |
| Restauration de visage | GFPGAN | code Apache-2.0 ; composants tiers **à vérifier** (page de licence non consultable ici) | ~350 Mo | non | **à revérifier** ; essai de restauration de visage v2.50 mesuré défavorable (LPIPS visage 0,370 → 0,459) |
| Complétion du corps hors cadre guidée par références | CompleteMe (Adobe / NTU) | fiche Hugging Face : CC-BY-NC-SA-4.0, **non commercial** ([fiche](https://huggingface.co/LIAGM/CompleteMe/blob/main/README.md)) ; code publié en janvier 2026 | modèle de diffusion, GPU de plusieurs Go | non | **écarté de l'app** ; prototype personnel possible en cloud |

Non encore étudiés en détail (prochaine passe) : points du visage MediaPipe (licence à lire sur la fiche officielle),
modèles de restauration faciale guidée par référence publiés en 2025-2026, inpainting vidéo sous licence permissive.

## Ce que l'app pourra faire, dans l'ordre (plan)

1. **Prototype « Effacer une zone » sur photo** — MI-GAN en ONNX dans le gestionnaire de modèles (empreinte, licence, retrait).
   Tu désignes la zone au doigt ; l'app remplit, montre le masque « zone inventée » et garde l'original. Mesures : temps sur iPhone,
   qualité à l'œil sur tes paires avec / sans filtre (les seules vraies références disponibles).
2. **Désignation assistée** — SAM 2.1 tiny (ou EdgeTAM) : un toucher sur l'oreille du filtre → masque précis.
3. **Vidéo courte** — masque suivi image par image + remplissage image par image ; mesurer le scintillement.
   Si c'est instable (probable), la vraie cohérence vidéo demande un GPU distant.
4. **Yeux / visage guidés par références, corps hors cadre** — uniquement en cloud, uniquement avec des modèles de licence
   compatible, avec l'autorisation explicite de la personne photographiée, et toujours étiquetés « reconstruction générative ».

## Cloud gratuit (voir aussi GUIDE_CLOUD_GRATUIT.md)

| Offre | Ce qui est publié | Fiabilité |
|---|---|---|
| Hugging Face ZeroGPU | compte gratuit : environ 5 minutes de GPU par jour (réponse sur le forum, août 2026 ; une limite du nombre de lancements par jour a aussi été signalée) — [forum](https://discuss.huggingface.co/t/what-is-the-free-zerogpu-quota-for-1-space/178610) | non contractuel ; trop court pour de la vidéo, suffisant pour quelques photos |
| Kaggle | sessions de 12 h ; quota hebdomadaire de GPU affiché dans le compte, non publié (≈ 30 h selon des utilisateurs) — [synthèse](https://gpuperhour.com/blog/free-cloud-gpus-and-credits) | lancement manuel ; l'utiliser comme serveur permanent irait contre son usage prévu |
| Google Colab | accès GPU « très limité », aucun quota publié, sessions de 12 h au plus | idem |

Conclusion : un Space Hugging Face personnel (ZeroGPU) est la seule piste gratuite appelable depuis Safari sans manipuler de code,
et seulement pour des photos. Aucune de ces offres ne garantit la confidentialité : envoi soumis à autorisation explicite à chaque fois.
