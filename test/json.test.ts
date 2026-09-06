import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { findJsonSpans } from '../src/core/json.ts';

/** O texto de cada bloco detectado, para o assert falar do conteúdo e não de offsets. */
function blocks(text: string): string[] {
  return findJsonSpans(text).map((span) => text.slice(span.start, span.end));
}

describe('detecção de bloco JSON', () => {
  test('o array solto no topo do arquivo é um bloco', () => {
    // O caso real: index.template é um menu de 81 linhas incluído por outro arquivo.
    const text = ['[', '{ "Name": "FOR BOYS" },', '{ "Name": "OUTLET" }', ']', '', '<div></div>'].join(
      '\n',
    );
    assert.deepEqual(blocks(text), ['[\n{ "Name": "FOR BOYS" },\n{ "Name": "OUTLET" }\n]']);
  });

  test('o Liquid que gera os itens não desqualifica o bloco', () => {
    const text = [
      '{',
      '"itens": [',
      '{% for p in Products %}',
      '{ "id": {{ p.Id }} }{% unless forloop.last %},{% endunless %}',
      '{% endfor %}',
      ']',
      '}',
    ].join('\n');
    assert.equal(findJsonSpans(text).length, 1);
  });

  test('o corpo de <script type="application/ld+json"> é um bloco', () => {
    const text = '<script type="application/ld+json">\n{\n"@type": "Product"\n}\n</script>';
    assert.deepEqual(blocks(text), ['{\n"@type": "Product"\n}']);
  });

  test('<script> sem type é JavaScript, não JSON', () => {
    // PageHeader.template:99-242 é exatamente isto: JS com JSON gerado por
    // {% for %} no meio, que nenhum formatador pode reorganizar.
    const text = '<script>\nvar x = {\na: 1\n};\n</script>';
    assert.deepEqual(blocks(text), []);
  });

  test('<script type="text/x-template"> é marcação do Vue', () => {
    const text = '<script type="text/x-template">\n{\n"a": 1\n}\n</script>';
    assert.deepEqual(blocks(text), []);
  });

  test('o que não parseia como JSON não é bloco', () => {
    for (const text of [
      '{\n<div>oi</div>\n}', // marcação
      '{\nfoo: bar;\n}', // JavaScript
      '{\n"a": 1\n', // não fecha
      '{\n"a": 1\n]', // fechamento trocado
      '{\n"a": 1,\n', // acaba no meio
    ]) {
      assert.deepEqual(blocks(text), [], JSON.stringify(text));
    }
  });

  test('o `{` precisa abrir a linha', () => {
    // Um `{` no meio de uma frase é texto: exigir que ele abra a linha corta
    // quase todo falso positivo antes do parse.
    assert.deepEqual(blocks('<p>saldo {\n"a": 1\n}</p>'), []);
  });

  test('`{{` e `{%` não abrem bloco', () => {
    assert.deepEqual(blocks('{{ Model.Json }}\n{% assign a = 1 %}'), []);
  });

  test('bloco de uma linha só não interessa ao indentador', () => {
    assert.deepEqual(blocks('{ "a": 1 }\n<div></div>'), []);
  });

  test('a string é opaca: `<` e chave dentro dela não contam', () => {
    const text = '{\n"tpl": "<div>{</div>",\n"esc": "diz \\"oi\\""\n}';
    assert.equal(findJsonSpans(text).length, 1);
  });

  test('o bloco não atravessa a fronteira do {% raw %}', () => {
    // Dentro de raw o `{{ }}` é mustache do Vue e o conteúdo é template, não
    // dado do servidor — a detecção solta só vale na região Liquid.
    const text = '{% raw %}\n{\n"a": 1\n}\n{% endraw %}';
    assert.deepEqual(blocks(text), []);
  });

  test('dois blocos no mesmo arquivo saem em ordem e sem sobreposição', () => {
    const text = ['{', '"a": 1', '}', '<hr>', '[', '2,', '3', ']'].join('\n');
    const spans = findJsonSpans(text);
    assert.equal(spans.length, 2);
    assert.ok(spans[0].end <= spans[1].start);
  });
});
