import * as vscode from 'vscode';
import * as path from 'node:path';

import { findWidgetFor, findThemeRoot } from './core/theme.ts';
import { themeRootFor, workspaceRootsFor } from './config.ts';
import { LINX_TAGS, LINX_FILTERS, VUE_FILTERS } from './core/liquidTags.ts';
import { scan, regionAt } from './core/scanner.ts';
import { LANGUAGE_ID } from './format/provider.ts';

const WIDGET_PROPERTY_RE = /\{\{-?\s*Widget\.(\w+)/g;

/** Propriedades de `Widget.` realmente usadas nos templates do workspace. */
let referencedCache: { at: number; names: Set<string> } | undefined;
const CACHE_TTL_MS = 30_000;

async function referencedWidgetProperties(): Promise<Set<string>> {
  if (referencedCache && Date.now() - referencedCache.at < CACHE_TTL_MS) {
    return referencedCache.names;
  }
  const names = new Set<string>();
  const uris = await vscode.workspace.findFiles('**/*.template', '**/node_modules/**', 500);
  for (const uri of uris) {
    try {
      const text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
      WIDGET_PROPERTY_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = WIDGET_PROPERTY_RE.exec(text)) !== null) {
        names.add(m[1]);
      }
    } catch {
      // Arquivo ilegível não impede o resto.
    }
  }
  referencedCache = { at: Date.now(), names };
  return names;
}

/** Caminhos de `{% include %}`, no formato absoluto e sem extensão que a tag exige. */
async function includeCompletions(document: vscode.TextDocument): Promise<vscode.CompletionItem[]> {
  // Fora de um tema Linx a pasta do workspace faz o papel de raiz, igual ao que
  // `resolveIncludePath` usa para transformar esses caminhos em link.
  const root =
    findThemeRoot(document.uri.fsPath, themeRootFor(document)) ?? workspaceRootsFor(document)[0];
  if (!root) {
    return [];
  }
  const uris = await vscode.workspace.findFiles('**/*.template', '**/node_modules/**', 500);
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
  const widget = findWidgetFor(document.uri.fsPath, themeRootFor(document));
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

const provider: vscode.CompletionItemProvider = {
  async provideCompletionItems(document, position) {
    const linePrefix = document.lineAt(position).text.slice(0, position.character);
    const inRaw = regionAt(scan(document.getText()), document.offsetAt(position))?.kind === 'raw';

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

    if (!inRaw && /\{%-?\s*\w*$/.test(linePrefix)) {
      return Object.entries(LINX_TAGS).map(([name, entry]) => {
        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Function);
        item.detail = entry.signature;
        item.documentation = new vscode.MarkdownString(entry.doc);
        return item;
      });
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
