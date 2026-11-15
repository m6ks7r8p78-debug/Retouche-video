"""Regression contract for safe, reversible AURA root-level staging.
Run: python check_aura_staging.py from the repository root.
Playwright + Chromium are optional for six-viewport visual checks.
"""
from pathlib import Path
import os, re
root=Path(__file__).resolve().parent
aura=(root/"prototypes/aura-reference-fidele/index.html").read_text(encoding="utf-8")
preview=(root/"aura-preview.html").read_text(encoding="utf-8")
native=(root/"index.html").read_text(encoding="utf-8")
studio=(root/"studio-preview.html").read_text(encoding="utf-8")
bootstrap=(root/"demarrage.js").read_text(encoding="utf-8")
preview_boot=(root/"demarrage-preview.js").read_text(encoding="utf-8")
source_path="new URL('../../index.html',location.href).href"
preview_path="new URL('studio-preview.html',location.href).href"
robots='<meta name="robots" content="noindex,nofollow">\n</head>'
assert aura.count(source_path)==1
assert preview==aura.replace(source_path,preview_path).replace("</head>",robots,1),"AURA staging differs beyond isolated route / robots"
assert native.count('<script defer src="demarrage.js"></script>')==1
assert studio==native.replace('<script defer src="demarrage.js"></script>','<script defer src="demarrage-preview.js"></script>').replace("</head>",robots,1),"Native studio staging has drifted"
assert '<script defer src="aura-native-bridge.js"></script>' in native
assert "sw.register(" in bootstrap and "sw.register(" not in preview_boot
assert "getRegistrations" not in preview_boot
assert 'chargerModule("effacer")' in preview_boot
assert 'chargerModule("relief")' in preview_boot
start=bootstrap.index("/* hors ligne")
end=bootstrap.index("/* modules lourds")
expected=bootstrap[:start]+"/* PRÉVISUALISATION ISOLÉE : aucun enregistrement/désenregistrement de service worker.\n   Les médias et les moteurs fonctionnent comme dans le studio natif ; la PWA publique n'est pas touchée. */\n"+bootstrap[end:]
assert preview_boot==expected,"Preview boot unexpectedly changed native initialization"
scripts=re.findall(r'<script[^>]*\bsrc=["\']([^"\']+)["\']',studio)
local=[s.split("?")[0] for s in scripts if not s.startswith(("http:","https:","data:"))]
missing=[s for s in local if not (root/s).is_file()]
assert not missing,"Missing native scripts: "+", ".join(missing)
print("PASS staging contract: source identity, native code, SW isolation and",len(local),"script dependencies")
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("SKIP six-screen visual checks (Playwright not installed)")
else:
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=os.environ.get("CHROMIUM","/usr/bin/chromium"),args=["--no-sandbox","--disable-dev-shm-usage"])
        try:
            for w,h in [(320,700),(375,812),(390,844),(430,932),(768,1024),(1024,768)]:
                older=browser.new_page(viewport={"width":w,"height":h},device_scale_factor=1)
                newer=browser.new_page(viewport={"width":w,"height":h},device_scale_factor=1)
                errors=[]
                newer.on("pageerror",lambda err:errors.append(str(err)))
                older.set_content(aura,wait_until="load")
                newer.set_content(preview,wait_until="load")
                older.wait_for_timeout(120);newer.wait_for_timeout(120)
                assert older.screenshot(full_page=True)==newer.screenshot(full_page=True),f"Visual regression {w}"
                assert newer.evaluate("document.documentElement.scrollWidth<=innerWidth"),f"Overflow {w}"
                assert not errors,(w,errors)
                print("PASS visual parity",w,h)
                older.close();newer.close()
        finally:browser.close()
