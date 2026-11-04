#!/bin/sh
# installe les outils de test (ordinateur)
set -e
npm install playwright
npx playwright install chromium
pip install scikit-image pillow numpy
# facultatif (mesure LPIPS) : pip install torch --index-url https://download.pytorch.org/whl/cpu && pip install lpips
