import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { computeFoldRanges, type FoldRange } from '../src/core/folding.ts';
import { read, corpusTest } from './helpers.ts';

/** `[start, end]` de cada faixa, para asserções mais legíveis. */
function pairs(text: string): [number, number][] {
  return computeFoldRanges(text).map((r) => [r.start, r.end]);
}

function kindOf(ranges: FoldRange[], start: number): string | undefined {
  return ranges.find((r) => r.start === start)?.kind;
}

describe('folding — blocos Liquid', () => {
  test('{% if %} dobra até a linha antes do {% endif %}', () => {
    const text = ['{% if x %}', '<p>oi</p>', '{% endif %}'].join('\n');
    assert.deepEqual(
      pairs(text),
      [[0, 1]],
      'a linha do {% endif %} continua visível depois de dobrar, como o </div> do HTML',
    );
  });

  test('blocos aninhados geram uma faixa cada', () => {
    const text = [
      '{% for i in x %}',
      '{% if i %}',
      '<p>oi</p>',
      '{% endif %}',
      '{% endfor %}',
    ].join('\n');

    assert.deepEqual(pairs(text), [
      [0, 3],
      [1, 2],
    ]);
  });

  test('bloco inteiro numa linha só não vira faixa', () => {
    assert.deepEqual(pairs('{% if x %}oi{% endif %}'), [], 'não há nada a esconder');
  });

  test('{% endif %} colado ao conteúdo mantém a própria linha na dobra', () => {
    // Sem o `{% endif %}` sozinho na linha, esconder a linha 1 esconderia o <p>.
    const text = ['{% if x %}', '<p>oi</p>{% endif %}'].join('\n');
    assert.deepEqual(pairs(text), [[0, 1]]);
  });

  test('todas as tags de bloco do dialeto dobram', () => {
    for (const tag of ['if', 'unless', 'for', 'capture', 'case', 'tablerow', 'form', 'paginate']) {
      const text = [`{% ${tag} x %}`, 'conteúdo', `{% end${tag} %}`].join('\n');
      assert.deepEqual(pairs(text), [[0, 1]], `${tag} deve dobrar`);
    }
  });

  test('fechamento órfão não vira faixa nem estoura', () => {
    assert.deepEqual(pairs(['<p>oi</p>', '{% endif %}'].join('\n')), []);
  });

  test('bloco interno sem fechamento é descartado, o externo sobrevive', () => {
    const text = ['{% if a %}', '{% for i in b %}', '<p>x</p>', '{% endif %}'].join('\n');
    assert.deepEqual(pairs(text), [[0, 2]], 'só o {% if %}, que fechou, produz faixa');
  });
});

describe('folding — raw e comentários', () => {
  test('{% raw %} dobra o bloco inteiro', () => {
    const text = ['{% raw %}', '<p>{{ item.Name }}</p>', '{% endraw %}'].join('\n');
    assert.deepEqual(pairs(text), [[0, 1]]);
  });

  test('{% comment %} dobra e se declara comentário', () => {
    const text = ['{% comment %}', 'prosa', '{% endcomment %}'].join('\n');
    const ranges = computeFoldRanges(text);

    assert.deepEqual(pairs(text), [[0, 1]]);
    assert.equal(kindOf(ranges, 0), 'comment', 'o VS Code usa o tipo para "dobrar todos os comentários"');
  });

  test('o que está dentro de raw não gera faixa de bloco', () => {
    const text = ['{% raw %}', '{% if x %}', 'texto literal', '{% endif %}', '{% endraw %}'].join('\n');
    assert.deepEqual(
      pairs(text),
      [[0, 3]],
      'dentro de raw o {% if %} é texto, não estrutura — só o raw dobra',
    );
  });

  test('comentário HTML multi-linha dobra como comentário', () => {
    const text = ['<!-- primeira', 'segunda', '-->'].join('\n');
    const ranges = computeFoldRanges(text);

    assert.deepEqual(pairs(text), [[0, 1]]);
    assert.equal(kindOf(ranges, 0), 'comment');
  });
});

describe('folding — script e style', () => {
  test('o corpo do <script> dobra', () => {
    const text = ['<script>', 'var x = 1;', 'var y = 2;', '</script>'].join('\n');
    assert.deepEqual(pairs(text), [[0, 2]]);
  });

  test('o corpo do <style> dobra', () => {
    const text = ['<style>', '.a { color: red; }', '</style>'].join('\n');
    assert.deepEqual(pairs(text), [[0, 1]]);
  });

  test('<script> numa linha só não vira faixa', () => {
    assert.deepEqual(pairs('<script>var x = 1;</script>'), []);
  });
});

describe('folding — elementos HTML', () => {
  test('<div> dobra até a linha antes do </div>', () => {
    const text = ['<div class="algo">', '  <p>oi</p>', '</div>'].join('\n');
    assert.deepEqual(pairs(text), [[0, 1]], 'o </div> continua visível, como no HTML');
  });

  test('elementos aninhados geram uma faixa cada', () => {
    const text = [
      '<div class="algo">',
      '  <div class="algo2">',
      '    <p>',
      '      oi',
      '    </p>',
      '  </div>',
      '</div>',
    ].join('\n');

    assert.deepEqual(pairs(text), [
      [0, 5],
      [1, 4],
      [2, 3],
    ]);
  });

  test('elemento inteiro numa linha só não vira faixa', () => {
    assert.deepEqual(pairs('<p><span>oi</span></p>'), []);
  });

  test('void e self-closing não abrem faixa', () => {
    const text = ['<div>', '  <br>', '  <img src="a.png">', '  <input />', '</div>'].join('\n');
    assert.deepEqual(pairs(text), [[0, 3]], 'só o <div> dobra');
  });

  test('o fechamento casa com a abertura mais interna', () => {
    // O caso do editor: a tag de dentro acabou de ser digitada e ainda não tem par.
    const text = ['<div class="algo">', '  <div id="al">', '', '</div>'].join('\n');
    assert.deepEqual(pairs(text), [[1, 2]], 'o </div> fecha o de dentro; o de fora fica sem par');
  });

  test('fechamento órfão não vira faixa nem derruba a faixa de fora', () => {
    const text = ['<div>', '  </span>', '  oi', '</div>'].join('\n');
    assert.deepEqual(pairs(text), [[0, 2]]);
  });

  test('o > dentro de valor de atributo não fecha a tag', () => {
    const text = ['<div v-if="qtd > 0" :class="{% if a %}x{% endif %}">', '  oi', '</div>'].join('\n');
    assert.deepEqual(pairs(text), [[0, 1]]);
  });

  test('tag com atributos em várias linhas dobra a partir da linha do <', () => {
    const text = ['<input', '  type="text"', '  value="x">', '<div>', '  oi', '</div>'].join('\n');
    assert.deepEqual(pairs(text), [[3, 4]], 'o <input> é void, mesmo espalhado em três linhas');
  });

  test('a marcação dentro de {% raw %} dobra', () => {
    const text = [
      '{% raw %}',
      '<template id="tpl-x">',
      '  <div v-for="i in itens">',
      '    {{ i.Name }}',
      '  </div>',
      '</template>',
      '{% endraw %}',
    ].join('\n');

    assert.deepEqual(pairs(text), [
      [0, 5],
      [1, 4],
      [2, 3],
    ]);
  });

  test('o que está dentro de comentário não emparelha com o de fora', () => {
    const text = ['<!--', '<div>', '-->', '<p>', 'oi', '</p>'].join('\n');
    assert.deepEqual(pairs(text), [
      [0, 1],
      [3, 4],
    ]);
  });

  test('<div> em código JavaScript não emparelha', () => {
    const text = [
      '<script>',
      "  var s = '<div>';",
      '  if (a < b) { c(); }',
      '</script>',
      '<p>',
      'oi',
      '</p>',
    ].join('\n');
    assert.deepEqual(pairs(text), [
      [0, 2],
      [4, 5],
    ]);
  });

  test('a marcação de um <script type="text/x-template"> dobra', () => {
    // É como o tema entrega o template de um componente ao Vue: o corpo é HTML,
    // ao contrário de todo outro <script>.
    const text = [
      '<script type="text/x-template" id="tpl-x">',
      '  <div class="item">',
      '    <span>{{ i.Name }}</span>',
      '  </div>',
      '</script>',
    ].join('\n');

    assert.deepEqual(pairs(text), [
      [0, 3],
      [1, 2],
    ]);
  });

  test('<script> e <style> dobram uma vez só', () => {
    const text = ['<script>', 'var x = 1;', '</script>', '<style>', '.a { color: red; }', '</style>'].join('\n');
    assert.deepEqual(
      pairs(text),
      [
        [0, 1],
        [3, 4],
      ],
      'a faixa vem da região; emparelhar a tag geraria uma segunda seta na mesma linha',
    );
  });

  test('elemento e bloco Liquid abertos na mesma linha rendem as duas faixas', () => {
    const text = ['{% if a %}<div>', '  oi', '</div>{% endif %}'].join('\n');
    assert.deepEqual(
      pairs(text),
      [
        [0, 1],
        [0, 2],
      ],
      'o VS Code fica com a primeira: duas setas na mesma linha ele não desenha',
    );
  });

  test('nome de elemento é case-insensitive', () => {
    const text = ['<DIV>', '  oi', '</div>'].join('\n');
    assert.deepEqual(pairs(text), [[0, 1]]);
  });

  test('componente com hífen e ponto dobra', () => {
    const text = ['<my-widget.item>', '  oi', '</my-widget.item>'].join('\n');
    assert.deepEqual(pairs(text), [[0, 1]]);
  });

  test('aspa sem par dentro da tag não engole o resto do arquivo', () => {
    // Sem o limite de uma linha para o valor de atributo, a aspa solta procuraria
    // par até o fim do texto e levaria junto todas as dobras daqui para baixo.
    const text = ["<div data-x='a>", '  oi', '</div>', '<p>', '  oi', '</p>'].join('\n');
    assert.deepEqual(pairs(text), [
      [0, 1],
      [3, 4],
    ]);
  });
});

describe('folding — invariantes', () => {
  test('nenhuma faixa é vazia ou invertida', () => {
    const text = [
      '{% raw %}',
      '<template id="tpl-x">',
      '  <div v-if="a">',
      '    {{ item.Name | currency }}',
      '  </div>',
      '</template>',
      '{% endraw %}',
      '{% for i in x %}',
      '<script>',
      'var y = {{ i | json }};',
      '</script>',
      '{% endfor %}',
    ].join('\n');

    for (const range of computeFoldRanges(text)) {
      assert.ok(range.end > range.start, `faixa ${range.start}-${range.end} deve cobrir ao menos 1 linha`);
    }
  });

  corpusTest('toda faixa do corpus fica dentro do arquivo', () => {
    const text = read('Pages/OnePageCheckout/includes/PageHeader.template');
    const lastLine = text.split('\n').length - 1;

    const ranges = computeFoldRanges(text);
    assert.ok(ranges.length > 0, 'PageHeader.template tem <script>, {% if %} e {% for %} de sobra');
    for (const range of ranges) {
      assert.ok(range.start >= 0 && range.end <= lastLine, `${range.start}-${range.end} fora do arquivo`);
    }
  });
});
