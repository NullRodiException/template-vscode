import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { analyzeBlocks, openBlocksAt } from '../src/core/blocks.ts';

/** Nome das tags dos pares completos. */
function pairedTags(text: string): string[] {
  return analyzeBlocks(text).pairs.map((p) => p.tag);
}

describe('emparelhamento de blocos', () => {
  test('par simples é reconhecido', () => {
    const { pairs, unclosed, orphanEnds } = analyzeBlocks('{% if x %}oi{% endif %}');

    assert.deepEqual(unclosed, []);
    assert.deepEqual(orphanEnds, []);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].tag, 'if');
    assert.equal(pairs[0].open.start, 0);
  });

  test('os pares saem na ordem em que fecham', () => {
    assert.deepEqual(
      pairedTags('{% for i in x %}{% if i %}a{% endif %}{% endfor %}'),
      ['if', 'for'],
      'o interno fecha primeiro',
    );
  });

  test('raw e comment são neutros por padrão', () => {
    assert.deepEqual(pairedTags('{% raw %}a{% endraw %}'), []);
    assert.deepEqual(
      analyzeBlocks('{% raw %}a{% endraw %}', undefined, { includeRawAndComment: true }).pairs.map(
        (p) => p.tag,
      ),
      ['raw'],
      'a dobra pede explicitamente por eles',
    );
  });

  test('fechamento externo denuncia o interno como órfão', () => {
    const { unclosed } = analyzeBlocks('{% if a %}{% for i in b %}x{% endif %}');

    assert.equal(unclosed.length, 1);
    assert.equal(unclosed[0].tag, 'for');
    assert.equal(unclosed[0].closedByOuter, 'endif', 'quem provou o desbalanceamento fica registrado');
  });

  test('abertura que chega ao fim do arquivo não tem closedByOuter', () => {
    const { unclosed } = analyzeBlocks('{% if a %}x');

    assert.equal(unclosed.length, 1);
    assert.equal(unclosed[0].closedByOuter, undefined);
  });

  test('fechamento sem abertura vira orphanEnd', () => {
    const { orphanEnds, unclosed } = analyzeBlocks('x{% endfor %}');

    assert.deepEqual(unclosed, []);
    assert.equal(orphanEnds.length, 1);
    assert.equal(orphanEnds[0].tag, 'for');
  });

  test('{% when %} e {% else %} não abrem bloco', () => {
    assert.deepEqual(
      analyzeBlocks('{% case x %}{% when 1 %}a{% when 2 %}b{% endcase %}').unclosed,
      [],
      'as tags do meio dedentam, mas não empilham',
    );
  });
});

describe('blocos abertos numa posição', () => {
  const text = ['{% for i in x %}', '{% if i %}', '', '{% endif %}', '{% endfor %}'].join('\n');

  test('lista do mais externo ao mais interno', () => {
    const cursor = text.indexOf('\n{% endif %}');
    assert.deepEqual(
      openBlocksAt(text, cursor).map((b) => b.tag),
      ['for', 'if'],
    );
  });

  test('o que já fechou antes do cursor não conta', () => {
    const cursor = text.length;
    assert.deepEqual(openBlocksAt(text, cursor), []);
  });

  test('o que vem depois do cursor é irrelevante', () => {
    // No offset 16 (fim da primeira linha) só o for está aberto, mesmo com o if
    // aparecendo logo abaixo.
    assert.deepEqual(
      openBlocksAt(text, text.indexOf('\n')).map((b) => b.tag),
      ['for'],
    );
  });

  test('bloco já provado órfão não é oferecido', () => {
    const broken = '{% if a %}{% for i in b %}x{% endif %}';
    assert.deepEqual(
      openBlocksAt(broken, broken.length).map((b) => b.tag),
      [],
      'sugerir {% endfor %} aqui não consertaria nada',
    );
  });
});
