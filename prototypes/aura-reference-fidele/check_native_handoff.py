"""Teste le pont AURA → Studio sans serveur externe (Playwright + Pillow).
Usage: python prototypes/aura-reference-fidele/check_native_handoff.py
Le navigateur de CI peut bloquer localhost / file:// : le test injecte l'HTML
réel et un *formulaire natif de test* dans un iframe srcdoc de même contexte.
La connexion complète avec app.js et Safari physique reste à tester.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from PIL import Image
from playwright.sync_api import sync_playwright

repo=Path(__file__).resolve().parents[2]
aura=(repo/'prototypes/aura-reference-fidele/index.html').read_text(encoding='utf-8')
bridge=(repo/'aura-native-bridge.js').read_text(encoding='utf-8')
native=(repo/'index.html').read_text(encoding='utf-8')
assert 'id="f"' in native and 'id="fp"' in native
assert '<script defer src="aura-native-bridge.js"></script>' in native
fixture='''<!doctype html><div id="app"></div><input type="file" id="f"><input type="file" id="fp">
<output id="received"></output><script>
for(const id of ['f','fp'])document.getElementById(id).addEventListener('change',
e=>{document.getElementById('received').textContent=id+'|'+e.target.files[0].name;e.target.value='';});
</script><script>'''+bridge+'</script>'
with TemporaryDirectory() as td, sync_playwright() as p:
    photo=Path(td)/'portrait.png'
    Image.new('RGB',(301,191),(60,90,120)).save(photo)
    browser=p.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    try:
        for w,h in [(320,700),(375,812),(390,844),(430,932),(768,1024),(1024,768)]:
            page=browser.new_page(viewport={'width':w,'height':h})
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.set_content(aura,wait_until='load')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            page.locator('#file').set_input_files(str(photo))
            page.wait_for_function("window.__AURA_CHECK__().kind==='image'")
            page.evaluate("""(html)=>{
              const f=document.getElementById('fullStudioFrame');
              f.srcdoc=html; f.src='about:blank';}""",fixture)
            page.wait_for_function("document.getElementById('fullStudioFrame').contentDocument?.getElementById('fp')!=null")
            page.locator('#advancedBtn').click()
            page.locator('#openFullStudio').click()
            page.wait_for_function("document.getElementById('studioTransferStatus').textContent.includes('Média transmis')")
            assert page.frame_locator('#fullStudioFrame').locator('#received').inner_text()=='fp|portrait.png'
            assert page.locator('#nativeMissing').is_hidden()
            page.evaluate("() => window.postMessage({channel:'retoucheproai:aura:handoff:v1',type:'ack',id:'aura-1',ok:false},'*')")
            assert page.locator('#studioTransferStatus').inner_text().startswith('Média transmis')
            page.locator('#closeFullStudio').click()
            assert page.locator('#fullStudio').is_hidden()
            assert not errors,(w,errors)
            print('PASS photo, ack, fake ack rejected, screen',w,h)
            page.close()
        missing='<!doctype html><h1>404</h1>'
        page=browser.new_page(viewport={'width':390,'height':844})
        page.set_content(aura)
        page.locator('#file').set_input_files(str(photo))
        page.wait_for_function("window.__AURA_CHECK__().kind==='image'")
        page.evaluate("""(html)=>{
          const f=document.getElementById('fullStudioFrame');
          f.srcdoc=html;f.src='about:blank'}""",missing)
        page.wait_for_function("document.getElementById('fullStudioFrame').contentDocument?.readyState==='complete'")
        page.locator('#advancedBtn').click();page.locator('#openFullStudio').click()
        page.wait_for_function("document.getElementById('nativeMissing').hidden===false",timeout=7000)
        assert 'Aucun média transmis' in page.locator('#studioTransferStatus').inner_text()
        print('PASS studio absent : erreur explicite, aucun succès fictif')
        page.close()
    finally:browser.close()
