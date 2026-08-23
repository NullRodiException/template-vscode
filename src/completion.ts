import * as vscode from 'vscode';
import * as path from 'node:path';

import { findWidgetFor, findThemeRoot } from './core/theme.ts';
import { themeRootFor, workspaceRootsFor, isOnDisk } from './config.ts';
import { templateUris, referencedWidgetProperties } from './widgetIndex.ts';
import {
  LINX_TAGS,
  LINX_FILTERS,
  VUE_FILTERS,
  VUE_DIRECTIVES,
  VUE_BOUND_ATTRIBUTES,
  VUE_EVENTS,
  DIRECTIVE_SNIPPETS,
  GLOBAL_OBJECTS,
  BLOCK_TAGS,
  MIDDLE_TAGS,
  attributeSlotAt,
  VOID_ELEMENTS,
  type AttributeSlot,
} from './core/liquidTags.ts';
import {
  HTML_ELEMENTS,
  GLOBAL_ATTRIBUTES,
  BOOLEAN_ATTRIBUTES,
  attributesFor,
  valuesFor,
  tagNameSlotAt,
  attributeValueSlotAt,
  enclosingElement,
  openTagAt,
  type TagNameSlot,
  type AttributeValueSlot,
} from './core/htmlData.ts';
import { regionAt, type Region } from './core/scanner.ts';
import { isVueTemplateScript } from './core/htmlTags.ts';
import { openBlocksAt } from './core/blocks.ts';
import { regionsOf } from './regionCache.ts';
import { LANGUAGE_ID } from './format/provider.ts';

/** Caminhos de `{% include %}`, no formato absoluto e sem extensão que a tag exige. */
async function includeCompletions(document: vscode.TextDocument): Promise<vscode.CompletionItem[]> {
  if (!isOnDisk(document)) {
    return [];
  }
  // Fora de um tema Linx a pasta do workspace faz o papel de raiz, igual ao que
  // `resolveIncludePath` usa para transformar esses caminhos em link.
  const root =
    findThemeRoot(document.uri.fsPath, themeRootFor(document)) ?? workspaceRootsFor(document)[0];
  if (!root) {
    return [];
  }
  const uris = await templateUris();
  const items: vscode.CompletionItem[] = [];

  for (const uri of uris) {
    const relative = path.relative(root, uri.fsPath);
    if (relative.startsWith('..')) {
      continue;
    }
    // A tag omite a extensão: `{% include /Pages/.../basket %}`.
    const value = '/' + relative.replace(/\\/g, '/').replace(/\.template$/, '');
    const item = new vscode.CompletionItem(value, vscode.CompletionItemKind.File);
    item.detail = path.basename(uri.fsPath);
    item.insertText = value;
    item.filterText = value;
    items.push(item);
  }
  return items;
}

async function widgetCompletions(document: vscode.TextDocument): Promise<vscode.CompletionItem[]> {
  const widget = isOnDisk(document)
    ? findWidgetFor(document.uri.fsPath, themeRootFor(document))
    : undefined;
  const declared = new Map(widget?.properties.map((p) => [p.name, p]) ?? []);
  const referenced = await referencedWidgetProperties();

  const items: vscode.CompletionItem[] = [];
  for (const [name, property] of declared) {
    const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Property);
    item.detail = property.friendlyName ?? property.type ?? 'propriedade do manifest.xml';
    if (property.defaultValue) {
      item.documentation = new vscode.MarkdownString(`Padrão: \`${property.defaultValue}\``);
    }
    items.push(item);
  }

  // O manifest.xml do corpus está dessincronizado: os templates usam
  // Widget.AddressPerPage, Widget.PaymentGroupOpened e Widget.HighlightCheaperDelivery,
  // que não estão declarados. Oferecer só o manifesto esconderia metade do que existe.
  for (const name of referenced) {
    if (declared.has(name)) {
      continue;
    }
    const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Property);
    item.detail = 'usado nos templates, mas não declarado no manifest.xml';
    items.push(item);
  }

  return items;
}

/** Tags neutras de uso corrente, que não abrem bloco e não são da Linx. */
const SINGLETON_TAGS = ['assign', 'include', 'echo', 'increment', 'decrement', 'break', 'continue', 'cycle'];

/**
 * O que oferecer depois de `{%`.
 *
 * O `{% end… %}` do bloco aberto mais interno vem primeiro, e com a linha da
 * abertura no `detail`: num arquivo com `{% for %}` dentro de `{% if %}` dentro
 * de `{% for %}`, saber *qual* está sendo fechado é metade do trabalho.
 */
function tagCompletions(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] {
  const items: vscode.CompletionItem[] = [];

  const open = openBlocksAt(document.getText(), document.offsetAt(position));
  for (let i = open.length - 1; i >= 0; i--) {
    const block = open[i];
    const item = new vscode.CompletionItem(`end${block.tag}`, vscode.CompletionItemKind.Keyword);
    item.detail = `fecha o {% ${block.tag} %} da linha ${document.positionAt(block.start).line + 1}`;
    // Do mais interno para o mais externo, sempre acima do resto da lista.
    item.sortText = `0${open.length - 1 - i}`;
    items.push(item);
  }

  for (const [name, entry] of Object.entries(LINX_TAGS)) {
    const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Function);
    item.detail = entry.signature;
    item.documentation = new vscode.MarkdownString(entry.doc);
    item.sortText = `1${name}`;
    items.push(item);
  }

  for (const name of [...BLOCK_TAGS, ...MIDDLE_TAGS, ...SINGLETON_TAGS]) {
    const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Keyword);
    item.sortText = `2${name}`;
    items.push(item);
  }

  return items;
}

/** Objetos expostos pelo servidor, para o início de uma expressão fora de raw. */
function globalCompletions(): vscode.CompletionItem[] {
  return Object.entries(GLOBAL_OBJECTS).map(([name, doc]) => {
    const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Variable);
    item.detail = 'objeto global do servidor';
    item.documentation = new vscode.MarkdownString(doc);
    return item;
  });
}

/**
 * Diretivas do Vue na posição de atributo: `v-if`, e os atalhos `:class` e
 * `@click` de `v-bind` e `v-on`.
 *
 * Todo item carrega o `range` do atributo já digitado. Sem ele o editor
 * substituiria só o pedaço que o `wordPattern` da linguagem reconhece — que não
 * inclui `:` nem `@` — e aceitar `:class` depois de `:c` escreveria `::class`.
 *
 * A lista sai inteira e quem filtra é o editor: `:c` descarta `v-if` sozinho, e
 * com o atributo ainda vazio o menu mostra tudo que cabe ali.
 */
function directiveCompletions(
  document: vscode.TextDocument,
  position: vscode.Position,
  slot: AttributeSlot,
): vscode.CompletionItem[] {
  const range = new vscode.Range(document.positionAt(slot.start), position);
  const items: vscode.CompletionItem[] = [];

  const add = (
    label: string,
    kind: vscode.CompletionItemKind,
    detail: string,
    insert: string,
    sortText: string,
  ): vscode.CompletionItem => {
    const item = new vscode.CompletionItem(label, kind);
    item.detail = detail;
    item.insertText = new vscode.SnippetString(insert);
    item.range = range;
    item.sortText = sortText;
    items.push(item);
    return item;
  };

  for (const [name, entry] of Object.entries(VUE_DIRECTIVES)) {
    // Sem snippet próprio a diretiva leva valor, e o cursor para dentro das aspas.
    const item = add(
      name,
      vscode.CompletionItemKind.Keyword,
      entry.signature,
      DIRECTIVE_SNIPPETS[name] ?? `${name}="$1"`,
      `2${name}`,
    );
    const md = new vscode.MarkdownString(entry.doc);
    md.appendCodeblock(entry.example, 'html');
    item.documentation = md;
  }

  for (const [name, doc] of Object.entries(VUE_BOUND_ATTRIBUTES)) {
    add(`:${name}`, vscode.CompletionItemKind.Property, doc, `:${name}="$1"`, `3${name}`);
  }

  for (const [name, doc] of Object.entries(VUE_EVENTS)) {
    add(`@${name}`, vscode.CompletionItemKind.Event, doc, `@${name}="$1"`, `4${name}`);
  }

  return items;
}

/**
 * Atributos de HTML na mesma posição das diretivas: os do elemento primeiro,
 * depois os globais.
 *
 * Vêm antes do bloco do Vue na ordenação (`0` e `1` contra `2`…`4`) porque a
 * maioria do que se digita dentro de uma tag continua sendo HTML puro — e quem
 * quer a diretiva digita `v-`, `:` ou `@`, que filtram o resto sozinhos.
 */
function htmlAttributeCompletions(
  document: vscode.TextDocument,
  position: vscode.Position,
  slot: AttributeSlot,
): vscode.CompletionItem[] {
  const tag = openTagAt(document.getText(), document.offsetAt(position))?.name ?? '';
  const own = new Set(HTML_ELEMENTS[tag]?.attributes ?? []);
  const range = new vscode.Range(document.positionAt(slot.start), position);

  return attributesFor(tag).map((name) => {
    const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Property);
    item.detail = GLOBAL_ATTRIBUTES[name] ?? `atributo de <${tag}>`;
    item.range = range;
    item.sortText = `${own.has(name) ? 0 : 1}${name}`;

    if (BOOLEAN_ATTRIBUTES.has(name)) {
      // Booleano não leva valor: `<input disabled>`, não `disabled="true"`.
      item.insertText = name;
      return item;
    }
    item.insertText = new vscode.SnippetString(
      name === 'data-' ? 'data-${1:nome}="$2"' : `${name}="$1"`,
    );
    if (valuesFor(tag, name).length > 0) {
      // O atributo tem lista fechada: abre o menu dos valores já dentro das aspas.
      item.command = { command: 'editor.action.triggerSuggest', title: 'valores' };
    }
    return item;
  });
}

/** Valores conhecidos do atributo em que o cursor está, na ordem da tabela. */
function attributeValueCompletions(
  document: vscode.TextDocument,
  position: vscode.Position,
  slot: AttributeValueSlot,
): vscode.CompletionItem[] {
  const range = new vscode.Range(document.positionAt(slot.start), position);

  return valuesFor(slot.tag, slot.attribute).map((value, index) => {
    const item = new vscode.CompletionItem(value, vscode.CompletionItemKind.Value);
    item.detail = `${slot.attribute} de <${slot.tag}>`;
    item.range = range;
    // A ordem da tabela é a de uso, não a alfabética: `text` antes de `color`.
    item.sortText = String(index).padStart(3, '0');
    return item;
  });
}

/**
 * Elementos de HTML depois do `<`, e o fechamento depois do `</`.
 *
 * O item traz a tag inteira — escolher `div` escreve `<div></div>` com o cursor
 * no meio, que é o que um arquivo `.html` faz. Quando já existe um `>` logo
 * adiante, entra só o nome: ali quem está digitando é alguém trocando o nome de
 * uma tag que já existe.
 *
 * O trecho substituído começa *depois* do `<`, para o filtro do editor comparar
 * `di` com `div` — com o `<` dentro, nada casaria.
 */
function tagNameCompletions(
  document: vscode.TextDocument,
  position: vscode.Position,
  slot: TagNameSlot,
): vscode.CompletionItem[] {
  const text = document.getText();
  const offset = document.offsetAt(position);
  // O resto do nome que já está escrito à direita do cursor entra no trecho
  // substituído: trocar `div` por `section` em `<di|v>` não pode deixar um `v`
  // para trás. O `>` que vem depois dele é o que diz se a tag já está montada.
  const tail = /^[\w:.-]*/.exec(text.slice(offset))?.[0] ?? '';
  const start = document.positionAt(slot.start + 1);
  const range = {
    inserting: new vscode.Range(start, position),
    replacing: new vscode.Range(start, document.positionAt(offset + tail.length)),
  };
  const closed = text[offset + tail.length] === '>';

  const items: vscode.CompletionItem[] = [];
  const add = (name: string, detail: string, insert: string, sortText: string): void => {
    const item = new vscode.CompletionItem(
      slot.closing ? `/${name}` : name,
      vscode.CompletionItemKind.Property,
    );
    item.detail = detail;
    item.insertText = new vscode.SnippetString(insert);
    item.range = range;
    item.sortText = sortText;
    items.push(item);
  };

  if (slot.closing) {
    const open = enclosingElement(text, slot.start);
    if (open) {
      add(open, 'fecha o elemento aberto mais interno', `/${open}${closed ? '' : '>'}`, '0');
    }
    for (const name of Object.keys(HTML_ELEMENTS)) {
      if (name !== open) {
        add(name, HTML_ELEMENTS[name].doc, `/${name}${closed ? '' : '>'}`, `1${name}`);
      }
    }
    return items;
  }

  for (const [name, element] of Object.entries(HTML_ELEMENTS)) {
    const body = VOID_ELEMENTS.has(name) ? `${name}$0>` : `${name}>$0</${name}>`;
    add(name, element.doc, closed ? name : body, name);
  }
  return items;
}

/** `{{ …` ou `{{ Config.Ge…`: início de um output. */
const OUTPUT_START_RE = /\{\{-?\s*\w*$/;

/**
 * Dentro de uma tag que avalia expressão — `{% if %}`, `{% assign x = %}`,
 * `{% for x in %}` — e no começo de um identificador.
 */
const EXPRESSION_RE = /\{%-?\s*(?:if|elsif|unless|assign|for|case|when|echo)\b[^%]*[\s(,:=]\w*$/;

/**
 * `true` onde o que se digita é marcação.
 *
 * Corta o corpo de `<script>` e de `<style>`, onde `a < b` é comparação e não
 * abertura de tag. A exceção é o script que carrega template do Vue
 * (`type="text/x-template"`): ali o corpo é HTML, e o cabeçalho do próprio
 * `<script>` é o que diz isso — ele fica logo antes do início da região.
 */
function isMarkup(text: string, region: Region | undefined): boolean {
  if (!region || (region.kind !== 'script' && region.kind !== 'style')) {
    return true;
  }
  return isVueTemplateScript(text, region);
}

const provider: vscode.CompletionItemProvider = {
  async provideCompletionItems(document, position) {
    const linePrefix = document.lineAt(position).text.slice(0, position.character);
    const region = regionAt(regionsOf(document), document.offsetAt(position));
    const inRaw = region?.kind === 'raw';

    if (/\{%-?\s*include\s+\S*$/.test(linePrefix)) {
      return includeCompletions(document);
    }

    if (/\{\{-?\s*Widget\.\w*$/.test(linePrefix)) {
      return widgetCompletions(document);
    }

    // Filtro: o conjunto depende da região, porque os dois não se misturam.
    const filterMatch = /(?<!\|)\|\s*(\w*)$/.exec(linePrefix);
    if (filterMatch) {
      const table = inRaw ? VUE_FILTERS : LINX_FILTERS;
      return Object.entries(table).map(([name, entry]) => {
        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Function);
        item.detail = entry.signature;
        item.documentation = new vscode.MarkdownString(entry.doc);
        return item;
      });
    }

    // Tudo que é HTML vem antes do corte por raw, junto das diretivas: a
    // marcação é a mesma dos dois lados do {% raw %} — é o mesmo motivo pelo
    // qual o realce delas é injeção, e não regra da gramática principal.
    const text = document.getText();
    const offset = document.offsetAt(position);

    if (isMarkup(text, region)) {
      const tagSlot = tagNameSlotAt(text, offset);
      if (tagSlot) {
        return tagNameCompletions(document, position, tagSlot);
      }

      const valueSlot = attributeValueSlotAt(text, offset);
      if (valueSlot) {
        return attributeValueCompletions(document, position, valueSlot);
      }

      const slot = attributeSlotAt(text, offset);
      if (slot) {
        return [
          ...htmlAttributeCompletions(document, position, slot),
          ...directiveCompletions(document, position, slot),
        ];
      }
    }

    // Dentro de raw nada disso é do servidor: `{% %}` é texto literal e os
    // identificadores são do Vue, não do Liquid.
    if (inRaw) {
      return [];
    }

    if (OUTPUT_START_RE.test(linePrefix) || EXPRESSION_RE.test(linePrefix)) {
      return globalCompletions();
    }

    if (/\{%-?\s*\w*$/.test(linePrefix)) {
      return tagCompletions(document, position);
    }

    return [];
  },
};

export function registerCompletion(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: LANGUAGE_ID },
      provider,
      '/',
      '.',
      '|',
      '%',
      ' ',
      // Os três sinais de atalho do Vue, e o hífen que fecha o `v-`.
      ':',
      '@',
      '#',
      '-',
      // HTML: a abertura da tag e a aspa que abre o valor do atributo.
      '<',
      '"',
      "'",
    ),
  );
}
