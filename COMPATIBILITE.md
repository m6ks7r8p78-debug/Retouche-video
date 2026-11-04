# Compatibilité

| Capacité | Utilisée pour | Si absente |
|---|---|---|
| WebGL (1) | tout l’affichage et les retouches | l’app indique qu’elle ne peut pas fonctionner |
| WebGPU | IA rapide | WebGL2, sinon amélioration sans IA |
| WebCodecs (VideoEncoder/Decoder) | export image par image, lecture rapide | export en temps réel (moins fiable) |
| AudioEncoder AAC | son réencodé | Opus dans le MP4, sinon export sans son expliqué |
| WebAssembly | voix, relief | fonction concernée désactivée |
| IndexedDB / Cache API | modèles téléchargés, reprise | téléchargement à refaire |

Vérifié : Chrome 153 sans écran (GPU simulé). **Non vérifié : Safari iOS sur un vrai iPhone** (voir GUIDE_IPHONE.md).
Les capacités sont détectées à l’exécution, jamais supposées.
