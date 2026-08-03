import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeIndentation,
  formatText,
  DEFAULT_OPTIONS,
  type IndentOptions,
} from '../src/format/indenter.ts';
import { findLiquidTags } from '../src/core/scanner.ts';
import { NEUTRAL_TAGS, isBlockTag, isEndTag, isMiddleTag } from '../src/core/liquidTags.ts';
import { read, allTemplates, lineAt } from './helpers.ts';

const TABS: IndentOptions = { insertSpaces: false, tabSize: 4, attributeIndent: 'oneLevel' };
const SPACES: IndentOptions = { insertSpaces: true, tabSize: 2, attributeIndent: 'oneLevel' };

/** Conteúdo de cada linha sem a indentação — o que o formatador jamais pode alterar. */
function skeleton(text: string): string[] {
  return text.split('\n').map((l) => l.trim());
}

describe('formatador — não-corrupção (a garantia principal)', () => {
  for (const file of allTemplates()) {
    test(`${file}: só a indentação muda`, () => {
      const original = read(file);
      for (const options of [TABS, SPACES]) {
        const formatted = formatText(original, options);
        assert.deepEqual(
          skeleton(formatted),
          skeleton(original),
          'nenhum caractere não-branco pode ser adicionado, removido ou movido de linha',
        );
        assert.equal(
          formatted.split('\n').length,
          original.split('\n').length,
          'a quantidade de linhas não pode mudar',
        );
      }
    });
  }
});

describe('formatador — idempotência', () => {
  for (const file of allTemplates()) {
    test(`${file}: formatar duas vezes é igual a formatar uma`, () => {
      const original = read(file);
      for (const options of [TABS, SPACES]) {
        const once = formatText(original, options);
        const twice = formatText(once, options);
        assert.equal(twice, once, 'a segunda passada não pode produzir nenhuma mudança');
        assert.equal(
          computeIndentation(once, options).length,
          0,
          'texto já formatado não deve gerar edit nenhum',
        );
      }
    });
  }
});

describe('formatador — regiões preservadas verbatim', () => {
  test('o corpo do <script> com Liquid massivo não é tocado', () => {
    const text = read('Pages/OnePageCheckout/includes/PageHeader.template');
    const formatted = formatText(text, TABS);
    const before = text.split('\n');
    const after = formatted.split('\n');

    // Linhas 100 a 240 são o corpo do <script> que gera JSON com Liquid.
    for (let ln = 100; ln <= 240; ln++) {
      assert.equal(after[ln - 1], before[ln - 1], `linha ${ln} do <script> deve ficar intacta`);
    }
  });

  test('o corpo do <style> não é tocado', () => {
    const text = read('Pages/OnePageCheckout/wd.checkout.onepage.template');
    const formatted = formatText(text, TABS);
    for (let ln = 2; ln <= 7; ln++) {
      assert.equal(
        formatted.split('\n')[ln - 1],
        text.split('\n')[ln - 1],
        `linha ${ln} do <style> deve ficar intacta`,
      );
    }
  });

  test('mustache Vue quebrado em várias linhas não é reindentado', () => {
    const text = read('Pages/OnePageCheckout/components/payments.template');
    assert.match(lineAt(text, 107), /\{\{\s*$/, 'pré-condição: mustache abre e não fecha na 107');

    const formatted = formatText(text, TABS).split('\n');
    const before = text.split('\n');
    for (const ln of [108, 109]) {
      assert.equal(formatted[ln - 1], before[ln - 1], `continuação do mustache (linha ${ln}) intacta`);
    }
  });

  test('a prosa do {%- comment -%} não é reindentada', () => {
    const text = read('Pages/OnePageCheckout/includes/PageFooter.template');
    const formatted = formatText(text, TABS).split('\n');
    const before = text.split('\n');
    for (let ln = 5; ln <= 17; ln++) {
      assert.equal(formatted[ln - 1], before[ln - 1], `linha ${ln} do comentário deve ficar intacta`);
    }
  });
});

describe('formatador — estrutura', () => {
  /** Indentação resultante da linha 1-indexada, em número de tabs. */
  function levels(text: string): number[] {
    return formatText(text, TABS)
      .split('\n')
      .map((l) => {
        const m = /^\t*/.exec(l);
        return l.trim() === '' ? -1 : (m ? m[0].length : 0);
      });
  }

  test('helpers/input.template: {% if %} gerando atributos dentro da tag aberta', () => {
    const text = read('Pages/OnePageCheckout/helpers/input.template');
    const lv = levels(text);

    assert.equal(lv[1], 0, 'linha 2: {% for property in ... %} no nível 0');
    assert.equal(lv[2], 1, 'linha 3: {% if property.InputType == ListSingle %} dentro do for');
    assert.equal(lv[3], 2, 'linha 4: <select dentro do if');
    assert.equal(lv[7], 3, 'linha 8: <option> dentro do select');
    assert.equal(lv[11], 2, 'linha 12: </select> volta ao nível do <select');
    assert.equal(lv[12], 1, 'linha 13: {% else %} dedenta para o nível do {% if %}');
    assert.equal(lv[13], 2, 'linha 14: <input dentro do else');
    assert.equal(lv[14], 3, 'linha 15: atributo type="tel" recua um nível');
    assert.equal(lv[18], 3, 'linha 19: último atributo, ainda dentro da tag');
    assert.equal(lv[19], 1, 'linha 20: {% endif %}');
    assert.equal(lv[20], 0, 'linha 21: {% endfor %}');
  });

  test('register.template:74-79: o `>` sozinho volta ao nível do <select', () => {
    const text = read('Pages/OnePageCheckout/components/register.template');
    assert.equal(lineAt(text, 79).trim(), '>', 'pré-condição: linha 79 é só o `>`');

    const lv = levels(text);
    assert.equal(lv[78], lv[73], 'a linha do `>` fica no mesmo nível da linha do <select');
    assert.ok(lv[74] > lv[73], 'os atributos ficam recuados em relação ao <select');
    assert.ok(lv[79] > lv[73], '<option> fica dentro do <select> já fechado');
  });

  test('bloco Liquid dentro de uma tag aberta é neutro', () => {
    // Um {% if %} que abrisse a pilha aqui e fechasse depois do `>` deixaria um
    // frame órfão e desalinharia o resto do arquivo; o preço é os atributos
    // condicionais ficarem no mesmo nível.
    const source = ['<input', '{% if x %}', 'required', '{% endif %}', '>', '<p>depois</p>'].join('\n');

    assert.deepEqual(
      formatText(source, TABS).split('\n'),
      ['<input', '\t{% if x %}', '\trequired', '\t{% endif %}', '>', '<p>depois</p>'],
      'as linhas de atributo ficam num nível só, e o que vem depois da tag não é afetado',
    );
  });

  test('register.template: o <form> atravessa três regiões e continua alinhado', () => {
    const text = read('Pages/OnePageCheckout/components/register.template');
    const lv = levels(text);

    // <form> abre na 19 (raw), {% endraw %} na 40, Liquid até 107, {% raw %} na 108,
    // e </form> só na 120.
    assert.equal(lv[119], lv[18], '</form> (linha 120) volta ao nível do <form> (linha 19)');
    assert.ok(lv[19] > lv[18], 'o conteúdo do form fica dentro dele');
    assert.equal(lv[122], lv[3], '</div> da linha 123 fecha a div da linha 4');
  });

  test('basket.template: o </span> órfão da linha 119 não desalinha o resto', () => {
    const text = read('Pages/OnePageCheckout/components/basket.template');
    assert.match(lineAt(text, 119), /<\/span><\/h4>/, 'pré-condição: </span> sem abertura');

    const lv = levels(text);
    assert.equal(lv[121], lv[101], '</li> da linha 122 fecha o <li> da linha 102');
    assert.equal(lv[133], lv[100], '</ul> da linha 134 fecha o <ul> da linha 101');
    assert.equal(lv[150], 0, '</template> volta ao nível 0');
  });

  test('index.template com CRLF preserva os \\r', () => {
    const text = read('Pages/OnePageCheckout/index.template');
    assert.ok(text.includes('\r\n'), 'pré-condição: index.template usa CRLF');

    const formatted = formatText(text, TABS);
    assert.equal(
      formatted.split('\r\n').length,
      text.split('\r\n').length,
      'as quebras CRLF devem sobreviver',
    );
    assert.ok(!/\r(?!\n)/.test(formatted), 'nenhum \\r solto');
  });

  test('{% raw %} não adiciona nível: o conteúdo do componente começa no nível 0', () => {
    const text = read('Pages/OnePageCheckout/components/modal.template');
    const lv = levels(text);
    assert.equal(lv[0], 0, '{% raw %}');
    assert.equal(lv[1], 0, '<template id="tpl-modal">');
    assert.equal(lv[2], 1, '<div class="modal">');
    assert.equal(lv[16], 0, '</template>');
    assert.equal(lv[17], 0, '{% endraw %}');
  });

  test('attributeIndent: oneLevel recua os atributos, preserve não os toca', () => {
    const source = ['<div>', '<input', 'type="text"', 'value="x">', '</div>'].join('\n');

    assert.deepEqual(
      formatText(source, TABS).split('\n'),
      ['<div>', '\t<input', '\t\ttype="text"', '\t\tvalue="x">', '</div>'],
      'oneLevel recua a tag e mais um nível para os atributos',
    );

    assert.deepEqual(
      formatText(source, { ...TABS, attributeIndent: 'preserve' }).split('\n'),
      ['<div>', '\t<input', 'type="text"', 'value="x">', '</div>'],
      'preserve mantém as linhas de continuação exatamente como estavam',
    );
  });

  test('preserve deixa toda continuação de atributo idêntica ao original', () => {
    for (const file of allTemplates()) {
      const before = read(file).split('\n');
      const preserved = formatText(read(file), { ...TABS, attributeIndent: 'preserve' }).split('\n');
      const oneLevel = formatText(read(file), TABS).split('\n');

      // As linhas em que os dois modos divergem são exatamente as continuações
      // de atributo; em `preserve` elas têm que estar intocadas.
      for (let i = 0; i < before.length; i++) {
        if (preserved[i] !== oneLevel[i]) {
          assert.equal(preserved[i], before[i], `${file} linha ${i + 1} deveria estar intocada`);
        }
      }
    }
  });
});

describe('formatador — alarme de dialeto', () => {
  test('toda tag Liquid do corpus é conhecida', () => {
    const unknown = new Map<string, string>();
    for (const file of allTemplates()) {
      for (const tag of findLiquidTags(read(file))) {
        if (tag.isOutput || !tag.name) {
          continue;
        }
        const known =
          isBlockTag(tag.name) ||
          isEndTag(tag.name) ||
          isMiddleTag(tag.name) ||
          NEUTRAL_TAGS.has(tag.name);
        if (!known && !unknown.has(tag.name)) {
          unknown.set(tag.name, file);
        }
      }
    }
    assert.deepEqual(
      [...unknown.entries()],
      [],
      'tag nova no dialeto: acrescente a liquidTags.ts antes de confiar na indentação dela',
    );
  });

  test('as opções padrão usam tab, como a maioria do corpus', () => {
    assert.equal(DEFAULT_OPTIONS.insertSpaces, false);
  });
});
