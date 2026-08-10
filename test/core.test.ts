import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import { toggleBlockComment, type TextEditOp } from '../src/core/comment.ts';
import { findPathReferences } from '../src/core/references.ts';
import { analyze } from '../src/core/diagnostics.ts';
import { BLOCK_TAGS } from '../src/core/liquidTags.ts';
import {
  resolveIncludePath,
  resolveDeployPath,
  resolveThemePath,
  findCounterpart,
  findThemeRoot,
  getThemeInfo,
} from '../src/core/theme.ts';
import {
  read,
  corpus,
  fixture,
  allTemplates,
  offsetOfLine,
  CORPUS_ROOT,
  REPO_ROOT,
  corpusTest,
  corpusDescribe,
} from './helpers.ts';

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

  corpusTest('descomenta o bloco real do register.template sem tocar o capture aninhado', () => {
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

  corpusTest('sinaliza quando o comentário cai dentro de {% raw %}', () => {
    const text = read('Pages/OnePageCheckout/components/basket.template');
    const inRaw = offsetOfLine(text, 27);
    assert.equal(toggleBlockComment(text, inRaw, inRaw).insideRaw, true, 'linha 27 está em raw');

    const outside = read('Pages/OnePageCheckout/index.template');
    const off = offsetOfLine(outside, 4);
    assert.equal(toggleBlockComment(outside, off, off).insideRaw, false, 'index.template não usa raw');
  });
});

describe('referências a arquivos', () => {
  corpusTest('encontra os 20 includes de wd.checkout.onepage.template', () => {
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

  corpusTest('classifica deploy, theme e shared corretamente', () => {
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

  corpusTest('ignora o que está dentro de {% raw %}', () => {
    const text = read('Pages/OnePageCheckout/components/basket.template');
    assert.deepEqual(
      findPathReferences(text),
      [],
      'basket.template é todo raw: nada ali é resolvido pelo servidor',
    );
  });

  corpusTest('acha o template= das tags da Linx', () => {
    const text = read('Pages/OnePageCheckout/components/register.template');
    const deploy = findPathReferences(text).filter((r) => r.kind === 'deploy');
    assert.ok(
      deploy.some((r) => r.path.endsWith('helpers/register.template')),
      'o template= do profile_register da linha 56',
    );
  });

  test('o include aceita aspas, e o range cobre só o caminho', () => {
    const text = '{% include "/ex/index.template" %}';
    const [reference] = findPathReferences(text);

    assert.equal(reference.kind, 'include');
    assert.equal(reference.path, '/ex/index.template');
    assert.equal(
      text.slice(reference.start, reference.end),
      '/ex/index.template',
      'as aspas ficam de fora do link',
    );
  });

  test('o include sem aspas continua sendo reconhecido', () => {
    const [reference] = findPathReferences('{%- include /Pages/OnePageCheckout/components/basket -%}');
    assert.equal(reference?.path, '/Pages/OnePageCheckout/components/basket');
  });

  test('aspas simples também valem', () => {
    const [reference] = findPathReferences("{% include '/ex/index.template' %}");
    assert.equal(reference?.path, '/ex/index.template');
  });

  test('include com aspa não fechada não vira referência', () => {
    assert.deepEqual(findPathReferences('{% include "/ex/index.template %}'), []);
  });
});

describe('include fora de um tema Linx', () => {
  // test/fixtures/plain-project/ é um projeto comum: sem Pages/, e portanto sem
  // raiz de tema. Fica versionado junto com o código, ao contrário de ex/, para
  // que este caso continue coberto num clone sem o corpus.
  const BASE = '/test/fixtures/plain-project';
  const from = fixture('plain-project/teste.template');
  const target = fixture('plain-project/index.template');

  test('resolve a partir da pasta do workspace', () => {
    assert.equal(resolveIncludePath(`${BASE}/index.template`, from, undefined, [REPO_ROOT]), target);
  });

  test('a extensão continua opcional nesse fallback', () => {
    assert.equal(resolveIncludePath(`${BASE}/index`, from, undefined, [REPO_ROOT]), target);
  });

  test('./x resolve contra a pasta do próprio arquivo', () => {
    assert.equal(resolveIncludePath('./index', from), target);
    assert.equal(resolveIncludePath('./index.template', from), target);
  });

  test('sem raiz de tema nem pasta de workspace, não resolve', () => {
    assert.equal(resolveIncludePath(`${BASE}/index.template`, from), undefined);
  });

  test('arquivo inexistente continua sem resolver', () => {
    assert.equal(resolveIncludePath(`${BASE}/nao-existe`, from, undefined, [REPO_ROOT]), undefined);
    assert.equal(resolveIncludePath('./nao-existe', from), undefined);
  });
});

corpusDescribe('resolução de caminhos do tema', () => {
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
  corpusTest('os 27 arquivos do corpus não têm erro de balanceamento', () => {
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

  corpusTest('Liquid ativo dentro de comentário HTML é sinalizado', () => {
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

describe('diagnósticos — blocos desbalanceados', () => {
  /** Só os problemas de bloco, na ordem em que aparecem no texto. */
  function blocks(text: string) {
    return analyze(text).filter((p) => p.code === 'unbalanced-block');
  }

  test('{% if %} sem {% endif %} é erro apontado na abertura', () => {
    const text = '{% if x %}\n<p>oi</p>\n';
    const [problem] = blocks(text);

    assert.ok(problem, 'a abertura órfã deve ser reportada');
    assert.equal(problem.severity, 'error');
    assert.equal(text.slice(problem.start, problem.end), '{% if x %}', 'o range cobre a tag inteira');
    assert.match(problem.message, /\{% endif %\}/, 'a mensagem diz qual tag está faltando');
  });

  test('{% endfor %} sem abertura é erro', () => {
    const [problem] = blocks('<p>oi</p>\n{% endfor %}');
    assert.equal(problem?.severity, 'error');
    assert.match(problem.message, /sem o \{% for %\} correspondente/);
  });

  test('blocos aninhados corretos não geram nada', () => {
    assert.deepEqual(
      blocks('{% for i in x %}{% if i %}{% case i %}{% when 1 %}a{% endcase %}{% endif %}{% endfor %}'),
      [],
      '{% when %} é tag do meio: não abre bloco',
    );
  });

  test('todos os pares de BLOCK_TAGS/END_TAGS se reconhecem', () => {
    for (const tag of BLOCK_TAGS) {
      assert.deepEqual(blocks(`{% ${tag} x %}conteúdo{% end${tag} %}`), [], `${tag} deve balancear`);
      assert.equal(blocks(`{% ${tag} x %}conteúdo`).length, 1, `${tag} sozinho deve ser reportado`);
    }
  });

  test('fechar o bloco de fora denuncia o de dentro', () => {
    // {% if %} abre, {% for %} abre, e só o endif aparece.
    const problems = blocks('{% if a %}\n{% for i in b %}\n<p>x</p>\n{% endif %}');

    assert.equal(problems.length, 1, 'só o for ficou aberto — o if fechou');
    assert.match(problems[0].message, /\{% for %\} nunca é fechado/);
    assert.match(problems[0].message, /\{% endif %\}/, 'a mensagem explica quem fechou por fora');
  });

  test('o que está dentro de {% raw %} e de {% comment %} não conta', () => {
    assert.deepEqual(
      blocks('{% raw %}{% if x %}{% endraw %}'),
      [],
      'dentro de raw, {% if %} é texto literal',
    );
    assert.deepEqual(
      blocks('{% comment %}{% if x %}{% endcomment %}'),
      [],
      'dentro de comment nada é processado',
    );
  });

  test('o que está dentro de comentário HTML conta', () => {
    // O comentário HTML não protege nada: o Liquid roda antes do HTML.
    assert.equal(
      blocks('<!-- {% if x %} -->\n<p>oi</p>').length,
      1,
      'o {% if %} comentado executa no servidor e continua aberto',
    );
  });

  test('{% raw %} desbalanceado suprime a checagem de blocos', () => {
    // Sem o {% endraw %}, o resto do arquivo muda de região; reportar blocos aí
    // seria uma cascata de erros derivados escondendo a causa única.
    const problems = analyze('{% raw %}\n{% if x %}\n<p>oi</p>\n');

    assert.equal(problems.length, 1);
    assert.equal(problems[0].code, 'unbalanced-raw');
  });

  test('include não abre bloco', () => {
    assert.deepEqual(
      blocks('{% include /Pages/OnePageCheckout/components/basket %}'),
      [],
      'as tags neutras e as 12 da Linx nunca desbalanceiam',
    );
  });
});

describe('diagnósticos — filtro na região errada', () => {
  function filters(text: string) {
    return analyze(text).filter((p) => p.code === 'filter-wrong-region');
  }

  test('filtro do Vue fora de raw é avisado', () => {
    const text = '<p>{{ item.RetailPrice | currency }}</p>';
    const [problem] = filters(text);

    assert.ok(problem, '| currency é do Vue e não existe no servidor');
    assert.equal(problem.severity, 'warning');
    assert.equal(text.slice(problem.start, problem.end), 'currency', 'o range cobre só o nome');
  });

  test('filtro do Liquid dentro de raw é avisado', () => {
    const [problem] = filters('{% raw %}{{ Config | json }}{% endraw %}');
    assert.ok(problem, '| json não roda dentro de raw');
    assert.match(problem.message, /não roda/);
  });

  test('cada filtro no seu lugar não gera nada', () => {
    assert.deepEqual(filters('{{ Config | json }}'), []);
    assert.deepEqual(filters('{% raw %}{{ item.Price | currency }}{% endraw %}'), []);
  });

  test('o || do JavaScript não é lido como filtro', () => {
    assert.deepEqual(
      filters('{% raw %}{{ a || currency }}{% endraw %}'),
      [],
      'o `||` já foi confundido com filtro antes; a gramática e o diagnóstico têm que concordar',
    );
  });

  test('o | fora de uma interpolação é ignorado', () => {
    assert.deepEqual(
      filters('<script>const mask = a | currency;</script>'),
      [],
      'bitwise-or de JavaScript não é pipe de filtro',
    );
  });

  test('filtro desconhecido das duas tabelas não vira ruído', () => {
    assert.deepEqual(
      filters('{{ x | filtroCustomizadoDoProjeto }}'),
      [],
      'só o que é exclusivo de uma das tabelas é reportado',
    );
  });

  test('dentro de {% comment %} nada é reportado', () => {
    assert.deepEqual(filters('{% comment %}{{ x | currency }}{% endcomment %}'), []);
  });
});

corpusDescribe('estrutura do corpus', () => {
  test('todo include do corpus aponta para um arquivo existente', () => {
    const broken: string[] = [];
    for (const file of allTemplates()) {
      const from = path.join(CORPUS_ROOT, file);
      for (const reference of findPathReferences(read(file))) {
        // `[REPO_ROOT]` reproduz o que a extensão passa como pasta do workspace.
        if (reference.kind === 'include' && !resolveIncludePath(reference.path, from, undefined, [REPO_ROOT])) {
          broken.push(`${file} → ${reference.path}`);
        }
      }
    }
    assert.deepEqual(broken, []);
  });
});
