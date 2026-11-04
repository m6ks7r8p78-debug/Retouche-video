#!/bin/sh
# lance toutes les suites ; résumé à la fin
cd "$(dirname "$0")/.."
for t in gestionnaire studio v3 noyau; do echo "== $t"; node tests/$t.test.mjs | tail -2; done
echo "== app"; node tests/app.test.mjs tests/medias tests/sorties --ia | tail -2
