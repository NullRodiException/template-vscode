import * as vscode from 'vscode';
import * as path from 'node:path';

import { findWidgetFor, findThemeRoot } from './core/theme.ts';
import { themeRootFor, workspaceRootsFor, isOnDisk } from './config.ts';
import { templateUris, referencedWidgetProperties } from './widgetIndex.ts';
import {
  LINX_TAGS,
  LINX_FILTERS,
  VUE_FILTERS,
  GLOBAL_OBJECTS,
  BLOCK_TAGS,
  MIDDLE_TAGS,
} from './core/liquidTags.ts';
import { regionAt } from './core/scanner.ts';
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

/** `{{ …` ou `{{ Config.Ge…`: início de um output. */
const OUTPUT_START_RE = /\{\{-?\s*\w*$/;

/**
 * Dentro de uma tag que avalia expressão — `{% if %}`, `{% assign x = %}`,
 * `{% for x in %}` — e no começo de um identificador.
 */
const EXPRESSION_RE = /\{%-?\s*(?:if|elsif|unless|assign|for|case|when|echo)\b[^%]*[\s(,:=]\w*$/;

const provider: vscode.CompletionItemProvider = {
  async provideCompletionItems(document, position) {
    const linePrefix = document.lineAt(position).text.slice(0, position.character);
    const inRaw = regionAt(regionsOf(document), document.offsetAt(position))?.kind === 'raw';

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
    ),
  );
}
