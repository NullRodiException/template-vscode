import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import { toggleBlockComment, type TextEditOp } from '../src/core/comment.ts';
import { findPathReferences } from '../src/core/references.ts';
import { analyze } from '../src/core/diagnostics.ts';
import {
  resolveIncludePath,
  resolveDeployPath,
  resolveThemePath,
  findCounterpart,
  findThemeRoot,
  getThemeInfo,
} from '../src/core/theme.ts';
import { read, corpus, allTemplates, offsetOfLine, CORPUS_ROOT } from './helpers.ts';

/** Aplica os edits (que já vêm do fim para o início) sobre o texto. */
function apply(text: string, edits: TextEditOp[]): string {
  let out = text;
  for (const edit of edits) {
    out = out.slice(0, edit.start) + edit.newText + out.slice(edit.end);
  }
  return out;
}

describe('comentar bloco', () => {
  test('envolve as linhas selecionadas em {% comment %}', () => {
    const text = ['<div>', '\t<p>oi</p>', '</div>'].join('\n');
    const start = text.indexOf('\t<p>');
    const result = toggleBlockComment(text, start, start + 10);

    assert.equal(result.action, 'comment');
    assert.equal(
      apply(text, result.edits),
      ['<div>', '\t{% comment %}', '\t<p>oi</p>', '\t{% endcomment %}', '</div>'].join('\n'),
      'as tags herdam a indentação da primeira linha selecionada',
    );
  });

  test('com seleção vazia, comenta a linha do cursor', () => {
    const text = ['a', 'b', 'c'].join('\n');
    const cursor = text.indexOf('b');
    const result = toggleBlockComment(text, cursor, cursor);

    assert.equal(apply(text, result.edits), ['a', '{% comment %}', 'b', '{% endcomment %}', 'c'].join('\n'));
  });

  test('é reversível: comentar e descomentar volta ao original', () => {
    const text = ['<div>', '\t<p>oi</p>', '</div>'].join('\n');
    const start = text.indexOf('\t<p>');

    const commented = apply(text, toggleBlockComment(text, start, start + 10).edits);
    const inside = commented.indexOf('<p>');
    const back = toggleBlockComment(commented, inside, inside);

    assert.equal(back.action, 'uncomment');
    assert.equal(apply(commented, back.edits), text);
  });

  test('descomenta o bloco real do register.template sem tocar o capture aninhado', () => {
    const text = read('Pages/OnePageCheckout/components/register.template');
    // O bloco das linhas 42-47 contém um par {% capture %}/{% endcapture %} inteiro.
    const cursor = offsetOfLine(text, 44, 5);

    const result = toggleBlockComment(text, cursor, cursor);
    assert.equal(result.action, 'uncomment');

    const out = apply(text, result.edits);
    assert.ok(out.includes('{% capture moreFields %}'), 'o capture interno continua lá');
    assert.equal(
      (text.match(/\{% endcomment %\}/g) ?? []).length - 1,
      (out.match(/\{% endcomment %\}/g) ?? []).length,
      'exatamente um par de tags de comentário foi removido',
    );
  });

  test('sinaliza quando o comentário cai dentro de {% raw %}', () => {
    const text = read('Pages/OnePageCheckout/components/basket.template');
    const inRaw = offsetOfLine(text, 27);
    assert.equal(toggleBlockComment(text, inRaw, inRaw).insideRaw, true, 'linha 27 está em raw');

    const outside = read('Pages/OnePageCheckout/index.template');
    const off = offsetOfLine(outside, 4);
    assert.equal(toggleBlockComment(outside, off, off).insideRaw, false, 'index.template não usa raw');
  });
});

describe('referências a arquivos', () => {
  test('encontra os 20 includes de wd.checkout.onepage.template', () => {
    const text = read('Pages/OnePageCheckout/wd.checkout.onepage.template');
    const includes = findPathReferences(text).filter((r) => r.kind === 'include');

    assert.equal(includes.length, 20);
    assert.ok(
      includes.some((r) => r.path === '/Pages/OnePageCheckout/components/basket'),
      'o include do basket deve estar entre eles',
    );
    assert.ok(
      includes.every((r) => !r.path.endsWith('.template')),
      'o include omite a extensão',
    );
  });

  test('classifica deploy, theme e shared corretamente', () => {
    const header = findPathReferences(read('Pages/OnePageCheckout/includes/PageHeader.template'));
    assert.ok(
      header.some((r) => r.kind === 'deploy' && r.path.includes('Widgets/checkout.onepage/Styles')),
      'contentpath é caminho de deploy',
    );

    const footer = findPathReferences(read('Pages/OnePageCheckout/includes/PageFooter.template'));
    assert.ok(
      footer.some((r) => r.kind === 'theme' && r.path.includes('/Pages/OnePageCheckout/Scripts/')),
      'themepath é caminho de fonte',
    );

    const addresses = findPathReferences(
      read('Pages/OnePageCheckout/components/delivery-addresses.template'),
    );
    assert.ok(
      addresses.some((r) => r.kind === 'shared'),
      'sharedthemepath tem classificação própria',
    );
  });

  test('ignora o que está dentro de {% raw %}', () => {
    const text = read('Pages/OnePageCheckout/components/basket.template');
    assert.deepEqual(
      findPathReferences(text),
      [],
      'basket.template é todo raw: nada ali é resolvido pelo servidor',
    );
  });

  test('acha o template= das tags da Linx', () => {
    const text = read('Pages/OnePageCheckout/components/register.template');
    const deploy = findPathReferences(text).filter((r) => r.kind === 'deploy');
    assert.ok(
      deploy.some((r) => r.path.endsWith('helpers/register.template')),
      'o template= do profile_register da linha 56',
    );
  });
});

describe('resolução de caminhos do tema', () => {
  const anyFile = corpus('Pages/OnePageCheckout/wd.checkout.onepage.template');

  test('a raiz do tema é a pasta que contém Pages/', () => {
    assert.equal(findThemeRoot(anyFile), CORPUS_ROOT);
  });

  test('o manifest.xml é indexado pelo atributo folder', () => {
    const theme = getThemeInfo(anyFile);
    const widget = theme?.widgets.get('checkout.onepage');
    assert.ok(widget, 'o widget checkout.onepage deve ser encontrado');
    assert.equal(widget.dir, corpus('Pages/OnePageCheckout'));
    assert.ok(
      widget.properties.some((p) => p.name === 'CrediarioApiUrl'),
      'as <property> do manifesto são lidas',
    );
  });

  test('{% include %} resolve acrescentando .template', () => {
    assert.equal(
      resolveIncludePath('/Pages/OnePageCheckout/components/basket', anyFile),
      corpus('Pages/OnePageCheckout/components/basket.template'),
    );
    assert.equal(
      resolveIncludePath('/Pages/OnePageCheckout/includes/PageHeader', anyFile),
      corpus('Pages/OnePageCheckout/includes/PageHeader.template'),
    );
    assert.equal(resolveIncludePath('/Pages/NaoExiste/foo', anyFile), undefined);
  });

  test('caminho de deploy traduz via folder do manifesto', () => {
    assert.equal(
      resolveDeployPath('~/Custom/Content/Widgets/checkout.onepage/helpers/register.template', anyFile),
      corpus('Pages/OnePageCheckout/helpers/register.template'),
      'ex/Pages/OnePageCheckout ⇒ Widgets/checkout.onepage',
    );
    assert.equal(
      resolveDeployPath('Widgets/checkout.onepage/Styles/tailwind.css?v=17', anyFile),
      corpus('Pages/OnePageCheckout/Styles/tailwind.css'),
      'a querystring de cache-busting é descartada',
    );
  });

  test('| themepath resolve como caminho de fonte', () => {
    assert.equal(
      resolveThemePath('/Pages/OnePageCheckout/Scripts/main.js?v=2', anyFile),
      corpus('Pages/OnePageCheckout/Scripts/main.js'),
    );
  });

  test('os 19 pares template ↔ js são encontrados nos dois sentidos', () => {
    const pairs = [
      'basket', 'coupons', 'customer', 'delivery', 'delivery-addresses', 'delivery-options',
      'delivery-pickup-modal', 'errors', 'finish', 'login', 'loyalty-card', 'modal',
      'notification', 'order', 'order-summary', 'payments', 'register',
      'sales-representative', 'social',
    ];

    for (const name of pairs) {
      const template = corpus(`Pages/OnePageCheckout/components/${name}.template`);
      const script = corpus(`Pages/OnePageCheckout/Scripts/components/${name}.js`);
      assert.equal(findCounterpart(template), script, `${name}: template → js`);
      assert.equal(findCounterpart(script), template, `${name}: js → template`);
    }
  });

  test('crediario.template pareia com o script na raiz de Scripts/', () => {
    assert.equal(
      findCounterpart(corpus('Pages/OnePageCheckout/components/crediario.template')),
      corpus('Pages/OnePageCheckout/Scripts/crediario.js'),
      'a exceção da convenção precisa do fallback',
    );
  });

  test('componente órfão não inventa contraparte', () => {
    assert.equal(
      findCounterpart(corpus('Pages/OnePageCheckout/Scripts/components/summary.js')),
      undefined,
      'summary.js aponta para um #tpl-summary que não existe',
    );
  });
});

describe('diagnósticos', () => {
  test('os 27 arquivos do corpus não têm erro de balanceamento', () => {
    const errors: string[] = [];
    for (const file of allTemplates()) {
      for (const problem of analyze(read(file))) {
        if (problem.severity === 'error') {
          errors.push(`${file}: ${problem.message}`);
        }
      }
    }
    assert.deepEqual(errors, []);
  });

  test('{% raw %} sem fechamento é erro', () => {
    const problems = analyze('{% raw %}\n<p>oi</p>\n');
    assert.equal(problems.length, 1);
    assert.equal(problems[0].code, 'unbalanced-raw');
    assert.equal(problems[0].severity, 'error');
  });

  test('{% endraw %} sem abertura é erro', () => {
    const problems = analyze('<p>oi</p>\n{% endraw %}\n');
    assert.equal(problems[0].code, 'unbalanced-raw');
    assert.match(problems[0].message, /sem o \{% raw %\}/);
  });

  test('{% comment %} dentro de raw é avisado', () => {
    const problems = analyze('{% raw %}\n{% comment %}\nx\n{% endcomment %}\n{% endraw %}');
    const warning = problems.find((p) => p.code === 'comment-in-raw');
    assert.ok(warning, 'deve avisar que o comentário não é processado ali');
    assert.equal(warning.severity, 'warning');
    assert.match(warning.message, /<!-- -->/);
  });

  test('Liquid ativo dentro de comentário HTML é sinalizado', () => {
    const text = read('Pages/OnePageCheckout/components/delivery-addresses.template');
    const problem = analyze(text).find((p) => p.code === 'liquid-in-html-comment');

    assert.ok(problem, 'o {% endraw %} comentado da linha 51 deve ser detectado');
    assert.equal(problem.severity, 'info');
    assert.ok(
      problem.start >= offsetOfLine(text, 49) && problem.start <= offsetOfLine(text, 64),
      'a marcação cai dentro do comentário HTML das linhas 49-63',
    );
  });

  test('{{ }} dentro de comentário HTML não gera ruído', () => {
    // Um output é inofensivo; só tags podem ter efeito colateral.
    const problems = analyze('<!-- <p>{{ Config.General.Store.Name }}</p> -->');
    assert.deepEqual(problems, []);
  });
});

describe('estrutura do corpus', () => {
  test('todo include do corpus aponta para um arquivo existente', () => {
    const broken: string[] = [];
    for (const file of allTemplates()) {
      const from = path.join(CORPUS_ROOT, file);
      for (const reference of findPathReferences(read(file))) {
        if (reference.kind === 'include' && !resolveIncludePath(reference.path, from)) {
          broken.push(`${file} → ${reference.path}`);
        }
      }
    }
    assert.deepEqual(broken, []);
  });
});
