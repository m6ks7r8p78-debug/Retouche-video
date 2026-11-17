import test from 'node:test';
import assert from 'node:assert/strict';

function element() {
  const listeners = new Map();
  return {
    textContent: '', value: '', hidden: false, disabled: false, href: '',
    children: [], attributes: new Map(),
    classList: { add() {}, remove() {} },
    addEventListener(name, callback) { listeners.set(name, callback); },
    dispatch(name) { const callback = listeners.get(name); assert.equal(typeof callback, 'function'); callback(); },
    appendChild(node) { this.children.push(node); },
    replaceChildren() { this.children = []; },
    removeAttribute(name) { this.attributes.delete(name); if (name === 'href') this.href = ''; }
  };
}
test('interface tactile : clic, export GLB local puis refus explicite', async () => {
  const previous = { document: globalThis.document, window: globalThis.window };
  const selectors = ['#prompt', '#create', '#status', '#download', '#steps', '#limits'];
  const elements = Object.fromEntries(selectors.map(key => [key, element()]));
  elements['#prompt'].value = "Une femme brune s'assoit, boit un café, pose sa tasse, puis parle.";
  elements['#download'].hidden = true;
  globalThis.document = {
    querySelector(query) { if (!(query in elements)) throw Error('sélecteur absent ' + query); return elements[query]; },
    createElement(name) { assert.equal(name, 'li'); return element(); }
  };
  globalThis.window = { addEventListener() {} };
  const oldFetch = globalThis.fetch;
  globalThis.fetch = () => { throw Error('Une requête réseau non autorisée a été tentée.'); };
  try {
    await import('./film-ui-v02.mjs');
    elements['#create'].dispatch('click');
    assert.equal(elements['#create'].disabled, false);
    assert.equal(elements['#download'].hidden, false);
    assert.match(elements['#download'].href, /^blob:/);
    assert.match(elements['#status'].textContent, /Animation 3D créée localement/);
    assert.equal(elements['#steps'].children.length, 4);
    assert.ok(elements['#limits'].children.length >= 4);
    elements['#prompt'].value = 'Une femme boit puis parle.';
    elements['#create'].dispatch('click');
    assert.equal(elements['#download'].hidden, true);
    assert.equal(elements['#download'].href, '');
    assert.match(elements['#status'].textContent, /aucun fichier 3D/);
    assert.ok(elements['#limits'].children.some(x => /tasse ou une boisson/.test(x.textContent)));
  } finally {
    globalThis.document = previous.document;
    globalThis.window = previous.window;
    globalThis.fetch = oldFetch;
  }
});
