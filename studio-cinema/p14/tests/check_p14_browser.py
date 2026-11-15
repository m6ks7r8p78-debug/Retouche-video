from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).parents[1]
html=(root/'p14_viewer.html').read_text()
with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  for width,height in [(390,844),(1240,820)]:
    context=browser.new_context(viewport={'width':width,'height':height})
    page=context.new_page();errors=[];req=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:req.append(r.url))
    page.set_content(html,wait_until='load')
    assert page.locator('#mFrames').inner_text()=='36'
    assert page.locator('#passage option').count()==1
    page.locator('#reportFile').set_input_files(str(root/'examples/p14_fiction_demo.json'))
    page.wait_for_timeout(100)
    assert 'privé' in page.locator('#modeTag').inner_text().lower()
    page.locator('#timeInput').fill('1.2');page.locator('#memo').fill('contact observé dans le cas fictif')
    page.locator('#channel').select_option('levres');page.locator('#event').select_option('contact');page.locator('#addBtn').click()
    assert page.locator('.observation').count()==1
    with page.expect_download() as d:
      page.locator('#exportBtn').click()
    assert d.value.suggested_filename.endswith('annotations-PRIVE.json')
    assert not errors,errors
    assert not req,req
    page.screenshot(path=str(root/'examples'/f'P14_apercu_{width}.png'),full_page=True)
    print(f'UI {width}x{height}: import, annotation, export, no network, no errors')
    context.close()
  browser.close()

