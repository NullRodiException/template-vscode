import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createRegionCache, type CacheableDocument } from '../src/core/regionCache.ts';

const TEXT = '{% raw %}<p>{{ item.Name }}</p>{% endraw %}';

function doc(key: string, version: number, text = TEXT): CacheableDocument {
  return { key, version, text };
}

describe('cache de regiões', () => {
  test('mesma versão devolve o mesmo array, sem reescanear', () => {
    const cache = createRegionCache();
    const first = cache.regions(doc('a', 1));
    const second = cache.regions(doc('a', 1));

    assert.equal(first, second, 'a identidade do array é a prova de que não houve novo scan');
  });

  test('versão nova reescaneia', () => {
    const cache = createRegionCache();
    const first = cache.regions(doc('a', 1));
    const second = cache.regions(doc('a', 2, '<p>outro texto</p>'));

    assert.notEqual(first, second);
    assert.deepEqual(
      second.map((r) => r.kind),
      ['liquid'],
      'o resultado tem que refletir o texto novo, não o cacheado',
    );
  });

  test('documentos diferentes não se atropelam', () => {
    const cache = createRegionCache();
    const a = cache.regions(doc('a', 1));
    const b = cache.regions(doc('b', 1, '<p>oi</p>'));

    assert.notEqual(a, b);
    assert.equal(cache.regions(doc('a', 1)), a, 'a entrada de "a" continua válida');
    assert.equal(cache.size, 2);
  });

  test('descarta o menos usado recentemente ao passar do limite', () => {
    const cache = createRegionCache(2);
    const a = cache.regions(doc('a', 1));
    cache.regions(doc('b', 1));

    // Tocar em "a" antes de inserir "c": quem deve sair é "b".
    assert.equal(cache.regions(doc('a', 1)), a);
    cache.regions(doc('c', 1));

    assert.equal(cache.size, 2);
    assert.equal(cache.regions(doc('a', 1)), a, '"a" foi usado por último e sobrevive');
    assert.notEqual(cache.regions(doc('b', 1)), a);
  });

  test('clear esvazia', () => {
    const cache = createRegionCache();
    const first = cache.regions(doc('a', 1));
    cache.clear();

    assert.equal(cache.size, 0);
    assert.notEqual(cache.regions(doc('a', 1)), first, 'depois do clear, escaneia de novo');
  });
});
