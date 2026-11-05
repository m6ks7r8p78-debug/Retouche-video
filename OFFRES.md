# Offres Gratuit / Premium — étude et décisions (5 nov. 2026)

## Marché (relevé le 5 nov. 2026)
| App | Type | Prix |
|---|---|---|
| Remini (photo/vidéo IA, mobile) | abonnement hebdo | **11,49 €/semaine en France** (App Store, données du 25 oct. 2026) |
| HitPaw VikPea (vidéo IA, ordinateur + iPhone) | mois / an / à vie | 43,19 $/mois, 99,99 $/an, 350,39 $ à vie ; gratuit = aperçu sans export |
| Topaz Video AI (référence pro, ordinateur) | abonnement | 59 $/mois sans engagement, 299 $/an (Personal) ; plus de licence à vie |
| Médiane toutes apps (Adapty 2026) | — | 7,48 $/semaine, 12,99 $/mois, 38,42 $/an ; Europe 29–39 % plus chère que l'Amérique du Nord |

Photo & Vidéo (Adapty 2026) : la formule hebdomadaire fait 51 % du revenu de la catégorie ; essai → payant 30,5 % ;
un écran d'offre montré à l'ouverture convertit mieux (1,35 %) qu'au milieu de l'app (0,89 %).

## Où se place RetoucheProAI
- Points forts : calcul sur le téléphone (aucun coût serveur → marge quasi totale), vie privée, rendu « classique » très apprécié,
  4K, outils uniques (retrait de filtre, effacer une zone, correction de vitesse).
- Limites honnêtes : l'IA « qualité maximale » est lente sur iPhone (≈ 30 s par photo, très long en vidéo) ; pas au niveau de
  Topaz sur ordinateur. L'IA rapide Kaggle demande un compte Kaggle personnel : on ne peut pas la vendre telle quelle.
- Usage typique : ponctuel (on restaure un lot de vieilles vidéos de famille, puis on revient de temps en temps).

## Décision : prix
| Formule | Prix | Pourquoi |
|---|---|---|
| **Gratuit** | 0 € (pubs) | utile tout de suite, sans compte |
| **Pass 7 jours** | **2,99 €**, sans renouvellement | l'usage ponctuel ; 4× moins cher que Remini par semaine, sans piège d'abonnement |
| **Mensuel** | **5,99 €/mois** | moitié de la médiane (12,99 $) : qualité réelle mais IA lente sur téléphone |
| **Annuel** | **34,99 €/an** (≈ 2,92 €/mois, −51 %) | sous la médiane annuelle européenne ; meilleure valeur, mise en avant |

Mêmes prix sur le web, l'App Store et Google Play (paliers Apple 2,99 / 5,99 / 34,99 €). Pas d'abonnement hebdomadaire
reconductible : moins de revenus à court terme, mais pas d'image « piège » et meilleure réputation. À revoir après 1 mois de chiffres.

## Décision : contenu des offres
| Fonction | Gratuit | Premium |
|---|---|---|
| Amélioration automatique (couleurs, netteté, bruit, son) | ✅ | ✅ |
| Export vidéo Full HD et taille d'origine, photos | ✅ | ✅ |
| Comparateur avant/après, barre de vitesse, découpe | ✅ | ✅ |
| Export **4K** | — | ✅ |
| **IA qualité maximale** | — | ✅ |
| **Retirer un filtre** Snapchat / Instagram | — | ✅ |
| **Effacer une zone** (IA) | — | ✅ |
| **Time Repair** (vidéo accélérée/ralentie) | — | ✅ |
| **Regrouper** des vidéos, **améliorer tout un lot** | — | ✅ |
| Publicités | bannière + courte pub avant l'enregistrement | **aucune** |
| **Hors ligne** (app gardée sur le téléphone) | — | ✅ |
| Filigrane | **aucun** (choix qualité) | aucun |

## Paiement
- **Web** : Polar (marchand officiel : encaisse, gère la TVA de l'UE et les factures ; accepte les particuliers ; 5 % + 0,50 $).
  Chaque achat donne une **clé de licence** (abonnement : valable tant qu'il est payé ; pass : expire après 7 jours), vérifiée par
  `serveur/worker.js` (`/abo/verifier`). Lemon Squeezy écarté : en transition vers Stripe Managed Payments en 2026.
- **App Store / Google Play** : achats intégrés obligatoires pour un abonnement numérique ; gérés avec RevenueCat (gratuit au
  début), droit « premium ». Commission Apple/Google 15 % (programme petites entreprises).

## À faire par le propriétaire avant d'allumer (personne ne peut le faire à sa place)
1. Statut de **micro-entrepreneur** (SIRET) : obligatoire pour encaisser des abonnements et la pub de façon régulière.
2. Compte **Polar** (web), compte **Apple Developer** (99 $/an), compte **Google Play Console** (25 $ une fois), compte **RevenueCat**.
3. Mentions légales et CGV avec son identité (modèles prêts, à compléter).

## Interrupteurs
- `abo.js` → `ABO_CONFIG.actif` (tant que `false` : tout est gratuit, comme aujourd'hui).
- `pub.js` → `PUB_CONFIG.actif`. Les abonnés Premium ne voient jamais de pub.
