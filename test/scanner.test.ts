import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { scan, regionAt, regionsByLine, findLiquidTags } from '../src/core/scanner.ts';
import { read, offsetOfLine, lineAt, allTemplates } from './helpers.ts';

/** Tipo de região no primeiro caractere não-branco da linha 1-indexada. */
function kindAtLine(text: string, line: number): string {
  return regionsByLine(text)[line - 1];
}

describe('scanner — camada Liquid', () => {
  test('arquivo inteiramente envolto em raw: conteúdo é raw, as tags são liquid', () => {
    const text = read('Pages/OnePageCheckout/components/basket.template');
    const regions = scan(text);

    // A tag `{% raw %}` da linha 1 é Liquid.
    assert.equal(regionAt(regions, 0)?.kind, 'liquid');
    // O corpo do componente é Vue, não Liquid.
    assert.equal(kindAtLine(text, 27), 'raw', 'linha 27 é `{{ item.Name }}` do Vue');
    assert.equal(kindAtLine(text, 63), 'raw', 'linha 63 é `{{ item.RetailPrice | currency }}`');
  });

  test('aceita as variantes coladas {%raw%} e {%endraw%}', () => {
    for (const file of [
      'Pages/OnePageCheckout/components/login.template',
      'Pages/OnePageCheckout/components/order-summary.template',
    ]) {
      const text = read(file);
      assert.match(lineAt(text, 1), /\{%raw%\}/, `${file} deve usar a forma colada`);
      assert.equal(kindAtLine(text, 10), 'raw', `${file}: corpo deve ser raw`);
    }
  });

  test('register.template: o furo Liquid entre as linhas 41 e 107', () => {
    const text = read('Pages/OnePageCheckout/components/register.template');

    assert.equal(kindAtLine(text, 30), 'raw', 'antes do endraw da linha 40');
    assert.equal(kindAtLine(text, 49), 'liquid', '{% assign entities = ... %}');
    assert.equal(kindAtLine(text, 60), 'liquid', '{% for field in Metadata... %}');
    assert.equal(kindAtLine(text, 96), 'liquid', 'input hidden gerado por Liquid');
    assert.equal(kindAtLine(text, 113), 'raw', 'depois do {% raw %} da linha 108');
  });

  test('{% comment %} é opaco e engole o par capture/endcapture aninhado', () => {
    const text = read('Pages/OnePageCheckout/components/register.template');

    assert.equal(kindAtLine(text, 43), 'liquid-comment', '{% capture %} dentro do comentário');
    assert.equal(kindAtLine(text, 45), 'liquid-comment', '{% endcapture %} dentro do comentário');
    assert.equal(kindAtLine(text, 52), 'liquid-comment', 'segundo bloco comentado');

    // O capture comentado não pode aparecer como tag ativa.
    const tags = findLiquidTags(text);
    const captures = tags.filter((t) => t.name === 'capture');
    assert.equal(captures.length, 1, 'só o {% capture %} real da linha 55 conta');
    assert.ok(
      captures[0].start > offsetOfLine(text, 54),
      'o capture ativo é o da linha 55, não o comentado da 43',
    );
  });

  test('{% endraw %} dentro de valor de atributo é reconhecido', () => {
    const text = read('Pages/OnePageCheckout/wd.checkout.onepage.template');
    const line = lineAt(text, 31);
    assert.match(line, /href="\{% endraw %\}/, 'pré-condição: endraw no meio do atributo');

    const urlsOffset = offsetOfLine(text, 31) + line.indexOf('{{ Urls.BaseUrl }}');
    assert.equal(
      regionAt(scan(text), urlsOffset)?.kind,
      'liquid',
      '{{ Urls.BaseUrl }} é Liquid apesar de estar dentro de uma string de atributo em região raw',
    );
  });

  test('{% endraw %} dentro de comentário HTML é reconhecido (o Liquid executa mesmo assim)', () => {
    const text = read('Pages/OnePageCheckout/components/delivery-addresses.template');
    const line = lineAt(text, 51);
    assert.match(line, /\{% endraw %\}/, 'pré-condição: endraw dentro do <!-- -->');

    const offset = offsetOfLine(text, 51) + line.indexOf('sharedthemepath');
    assert.equal(
      regionAt(scan(text), offset)?.kind,
      'liquid',
      'o filtro sharedthemepath está em Liquid ativo, não em raw',
    );
  });

  test('arquivos sem raw são inteiramente Liquid', () => {
    for (const file of [
      'Pages/OnePageCheckout/index.template',
      'Pages/OnePageCheckout/helpers/data.template',
      'Pages/OnePageCheckout/helpers/input.template',
      'Pages/OnePageCheckout/components/social.template',
    ]) {
      const text = read(file);
      assert.ok(!/\{%-?\s*raw\s*-?%\}/.test(text), `pré-condição: ${file} não usa raw`);
      const kinds = new Set(scan(text).map((r) => r.kind));
      assert.ok(!kinds.has('raw'), `${file} não deve ter região raw`);
    }
  });
});

describe('scanner — camada HTML', () => {
  test('corpo de <script> com Liquid massivo vira região script', () => {
    const text = read('Pages/OnePageCheckout/includes/PageHeader.template');

    assert.equal(kindAtLine(text, 120), 'script', '{% for item in Basket.ItemDiscounts %} dentro do <script>');
    assert.equal(kindAtLine(text, 113), 'script', 'if/else inline no meio de um valor JSON');
  });

  test('<style> vira região style', () => {
    const text = read('Pages/OnePageCheckout/wd.checkout.onepage.template');
    assert.equal(kindAtLine(text, 3), 'style', 'dentro do bloco <style> das linhas 1-8');
  });

  test('comentário HTML multi-linha vira região html-comment', () => {
    const text = read('Pages/OnePageCheckout/components/payments.template');
    assert.equal(kindAtLine(text, 366), 'html-comment');
  });
});

describe('scanner — invariantes sobre o corpus inteiro', () => {
  const templates = allTemplates();

  test('o corpus tem os 27 arquivos esperados', () => {
    assert.equal(templates.length, 27);
  });

  for (const file of templates) {
    test(`${file}: regiões cobrem o texto sem buraco nem sobreposição`, () => {
      const text = read(file);
      const regions = scan(text);

      assert.ok(regions.length > 0, 'deve haver ao menos uma região');
      assert.equal(regions[0].start, 0, 'a primeira região começa no offset 0');
      assert.equal(
        regions[regions.length - 1].end,
        text.length,
        'a última região termina no fim do texto',
      );
      for (let i = 1; i < regions.length; i++) {
        assert.equal(
          regions[i].start,
          regions[i - 1].end,
          `região ${i} deve começar exatamente onde a anterior terminou`,
        );
        assert.ok(regions[i].end > regions[i].start, `região ${i} não pode ser vazia`);
      }
    });
  }
});
