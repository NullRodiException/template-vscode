import * as vscode from 'vscode';

import { scan, regionAt } from './core/scanner.ts';
import { LINX_TAGS, LINX_FILTERS, VUE_FILTERS, GLOBAL_OBJECTS } from './core/liquidTags.ts';
import { LANGUAGE_ID } from './format/provider.ts';

interface Entry {
  signature: string;
  doc: string;
  example: string;
}

function render(title: string, entry: Entry): vscode.Hover {
  const md = new vscode.MarkdownString();
  md.appendCodeblock(entry.signature, 'liquid');
  md.appendMarkdown(`\n${entry.doc}\n\n**Exemplo**\n`);
  md.appendCodeblock(entry.example, 'liquid');
  md.appendMarkdown(`\n*${title}*`);
  md.supportHtml = false;
  return new vscode.Hover(md);
}

const hoverProvider: vscode.HoverProvider = {
  provideHover(document, position) {
    const range = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
    if (!range) {
      return undefined;
    }
    const word = document.getText(range);
    const text = document.getText();
    const offset = document.offsetAt(range.start);
    const kind = regionAt(scan(text), offset)?.kind;

    // O que vem imediatamente antes decide se a palavra é um filtro.
    const before = text.slice(Math.max(0, offset - 40), offset);
    const isFilter = /\|\s*$/.test(before) && !/\|\|\s*$/.test(before);

    if (isFilter) {
      // Dentro de raw os filtros são do Vue, e rodam no navegador; fora, são do
      // servidor. Os dois conjuntos não se misturam.
      const table = kind === 'raw' ? VUE_FILTERS : LINX_FILTERS;
      const entry = table[word];
      if (entry) {
        return render(kind === 'raw' ? 'filtro do Vue' : 'filtro Liquid (Linx)', entry);
      }
      const other = kind === 'raw' ? LINX_FILTERS[word] : VUE_FILTERS[word];
      if (other) {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(
          kind === 'raw'
            ? `\`${word}\` é um filtro **Liquid**, processado no servidor — aqui dentro de \`{% raw %}\` ele não roda.`
            : `\`${word}\` é um filtro do **Vue**, e só funciona dentro de \`{% raw %}\`.`,
        );
        return new vscode.Hover(md);
      }
      return undefined;
    }

    if (kind === 'raw') {
      // Dentro de raw nada é Liquid; documentar tag ou objeto do servidor aqui
      // seria informação errada.
      return undefined;
    }

    const tag = LINX_TAGS[word];
    if (tag) {
      return render('tag da Linx', tag);
    }

    const global = GLOBAL_OBJECTS[word];
    if (global) {
      const md = new vscode.MarkdownString();
      md.appendCodeblock(word, 'liquid');
      md.appendMarkdown(`\n${global}\n\n*objeto global do servidor*`);
      return new vscode.Hover(md);
    }

    return undefined;
  },
};

export function registerHover(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider({ language: LANGUAGE_ID }, hoverProvider),
  );
}
