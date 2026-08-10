import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { findSymbols } from '../src/core/symbols.ts';
import { read, corpusTest } from './helpers.ts';

/** `kind:name` de cada símbolo, na ordem em que aparecem. */
function outline(text: string): string[] {
  return findSymbols(text).map((s) => `${s.kind}:${s.name}`);
}

describe('símbolos do documento', () => {
  test('<template id="tpl-X"> vira componente', () => {
    assert.deepEqual(
      outline('{% raw %}<template id="tpl-basket">\n<div></div>\n</template>{% endraw %}'),
      ['component:tpl-basket'],
      'o corpo do componente é Vue e está dentro de raw — tem que entrar mesmo assim',
    );
  });

  test('capture e assign entram com o nome da variável', () => {
    assert.deepEqual(outline('{% assign total = 0 %}\n{% capture moreFields %}x{% endcapture %}'), [
      'assign:total',
      'capture:moreFields',
    ]);
  });

  test('<script> e <style> viram seções', () => {
    assert.deepEqual(outline('<style>.a{}</style>\n<script>var x;</script>'), [
      'section:<style>',
      'section:<script>',
    ]);
  });

  test('o que está dentro de {% comment %} fica de fora', () => {
    assert.deepEqual(
      outline('{% comment %}{% assign fantasma = 1 %}{% endcomment %}{% assign real = 2 %}'),
      ['assign:real'],
    );
  });

  test('a ordem é a do arquivo, não a do tipo de símbolo', () => {
    const text = ['{% assign a = 1 %}', '<template id="tpl-x">', '</template>', '<script></script>'].join(
      '\n',
    );
    assert.deepEqual(outline(text), ['assign:a', 'component:tpl-x', 'section:<script>']);
  });

  test('<template> sem id não vira símbolo', () => {
    assert.deepEqual(outline('<template>\n<div></div>\n</template>'), []);
  });

  corpusTest('o outline do register.template acha o componente e os captures', () => {
    const symbols = outline(read('Pages/OnePageCheckout/components/register.template'));

    assert.ok(
      symbols.some((s) => s.startsWith('component:tpl-')),
      'o <template id="tpl-register"> tem que aparecer',
    );
    assert.ok(
      symbols.includes('capture:moreFields'),
      'o {% capture moreFields %} da linha 55 é o que se procura ali',
    );
  });
});
