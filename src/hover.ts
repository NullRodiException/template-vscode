import * as vscode from 'vscode';

import { regionAt } from './core/scanner.ts';
import {
  LINX_TAGS,
  LINX_FILTERS,
  VUE_FILTERS,
  VUE_DIRECTIVES,
  GLOBAL_OBJECTS,
  directiveName,
} from './core/liquidTags.ts';
import { regionsOf } from './regionCache.ts';
import { LANGUAGE_ID } from './format/provider.ts';

interface Entry {
  signature: string;
  doc: string;
  example: string;
}

function render(title: string, entry: Entry, language = 'liquid'): vscode.Hover {
  const md = new vscode.MarkdownString();
  md.appendCodeblock(entry.signature, language);
  md.appendMarkdown(`\n${entry.doc}\n\n**Exemplo**\n`);
  md.appendCodeblock(entry.example, language);
  md.appendMarkdown(`\n*${title}*`);
  md.supportHtml = false;
  return new vscode.Hover(md);
}

/** Nome de atributo, incluindo o hífen e o sinal que a "palavra" do editor corta. */
const ATTRIBUTE_RE = /[:@#]?[A-Za-z][\w.-]*/;

/**
 * `true` se o offset está dentro de uma tag HTML aberta — entre `<tag` e o `>`.
 *
 * É o que separa a diretiva de um homônimo: `@media` dentro de um `<style>` e
 * `:label` dentro de um `<script>` casam com a mesma forma de atalho, mas ali o
 * `<` mais próximo já foi fechado.
 */
function insideOpenTag(text: string, offset: number): boolean {
  const open = text.lastIndexOf('<', offset);
  return open !== -1 && open > text.lastIndexOf('>', offset) && /^<[A-Za-z]/.test(text.slice(open, open + 2));
}

/** Hover das diretivas do Vue: `v-if`, `:class`, `@click.stop`, `#footer`. */
function directiveHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
  const range = document.getWordRangeAtPosition(position, ATTRIBUTE_RE);
  if (!range) {
    return undefined;
  }
  const attribute = document.getText(range);
  const name = directiveName(attribute);
  if (!name || !insideOpenTag(document.getText(), document.offsetAt(range.start))) {
    return undefined;
  }
  return render('diretiva do Vue — roda no navegador', VUE_DIRECTIVES[name], 'html');
}

const hoverProvider: vscode.HoverProvider = {
  provideHover(document, position) {
    const directive = directiveHover(document, position);
    if (directive) {
      return directive;
    }

    const range = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
    if (!range) {
      return undefined;
    }
    const word = document.getText(range);
    const text = document.getText();
    const offset = document.offsetAt(range.start);
    const kind = regionAt(regionsOf(document), offset)?.kind;

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
