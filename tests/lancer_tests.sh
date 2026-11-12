#!/bin/sh
# lance toutes les suites ; résumé à la fin
cd "$(dirname "$0")/.."
node tests/sw.test.mjs | tail -1
node tests/sw_reel.test.mjs | tail -1
node --test tests/v67.test.mjs | grep '^# \(pass\|fail\)'
node --experimental-sqlite --test tests/consentement.test.mjs | grep '^# \(pass\|fail\)'
node tests/visage.test.mjs | tail -1
for t in gestionnaire studio atelier rvv v3 noyau reassemblage effacer; do echo "== $t"; node tests/$t.test.mjs | tail -2; done
echo "== app"; node tests/app.test.mjs tests/medias tests/sorties --ia | tail -2
