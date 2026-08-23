import * as vscode from 'vscode';

import {
  computeIndentation,
  detectIndentation,
  type IndentOptions,
  type IndentStyle,
  type IndentEdit,
} from './indenter.ts';
import { regionsOf } from '../regionCache.ts';

export const LANGUAGE_ID = 'linx-liquid';

function optionsFor(document: vscode.TextDocument, style: IndentStyle): IndentOptions {
  const config = vscode.workspace.getConfiguration('linxLiquid', document);
  return {
    insertSpaces: style.insertSpaces,
    tabSize: style.tabSize,
    attributeIndent: config.get<'oneLevel' | 'preserve'>('format.attributeIndent', 'oneLevel'),
  };
}

function readOptions(document: vscode.TextDocument, options: vscode.FormattingOptions): IndentOptions {
  // `insertSpaces`/`tabSize` já vêm resolvidos pelo editor, respeitando
  // `editor.detectIndentation` — é o que faz cada arquivo do corpus manter o
  // próprio estilo, num projeto onde 60% usa tab e 40% usa espaço.
  return optionsFor(document, { insertSpaces: options.insertSpaces, tabSize: options.tabSize });
}

/**
 * Estilo de indentação no caminho de salvar, onde ninguém entrega
 * `FormattingOptions`.
 *
 * Um editor visível já traz os valores resolvidos, que é o caso comum. Sem ele
 * — *Save All* salva abas que não estão à vista —, o próprio texto decide; a
 * configuração é o último recurso, porque é a única fonte que pode discordar do
 * arquivo.
 */
function styleForSave(document: vscode.TextDocument): IndentStyle {
  const editor = vscode.window.visibleTextEditors.find((one) => one.document === document);
  const options = editor?.options;
  // `tabSize` é `number | string` na API: vale `'auto'` enquanto o editor ainda
  // não resolveu a detecção.
  if (options && typeof options.insertSpaces === 'boolean' && typeof options.tabSize === 'number') {
    return { insertSpaces: options.insertSpaces, tabSize: options.tabSize };
  }

  const detected = detectIndentation(document.getText());
  if (detected) {
    return detected;
  }

  const config = vscode.workspace.getConfiguration('editor', document);
  return {
    insertSpaces: config.get<boolean>('insertSpaces', true),
    tabSize: config.get<number>('tabSize', 4),
  };
}

/**
 * Converte para `TextEdit` mantendo a garantia do indentador: o range vai de
 * zero até o primeiro caractere não-branco, e nada além disso é tocado.
 */
function toTextEdits(edits: IndentEdit[]): vscode.TextEdit[] {
  return edits.map((edit) =>
    vscode.TextEdit.replace(
      new vscode.Range(edit.line, 0, edit.line, edit.oldIndentLength),
      edit.newIndent,
    ),
  );
}

const documentFormatter: vscode.DocumentFormattingEditProvider = {
  provideDocumentFormattingEdits(document, options) {
    const edits = computeIndentation(
      document.getText(),
      readOptions(document, options),
      regionsOf(document),
    );
    return toTextEdits(edits);
  },
};

const rangeFormatter: vscode.DocumentRangeFormattingEditProvider = {
  provideDocumentRangeFormattingEdits(document, range, options) {
    // A indentação de uma linha depende de tudo que veio antes dela, então o
    // cálculo roda sobre o documento inteiro e só o resultado é recortado.
    const all = computeIndentation(
      document.getText(),
      readOptions(document, options),
      regionsOf(document),
    );
    const inRange = all.filter((e) => e.line >= range.start.line && e.line <= range.end.line);
    return toTextEdits(inRange);
  },
};

/**
 * Reindenta **só a linha que acabou de ser digitada**.
 *
 * Os gatilhos são os dois caracteres que fecham estrutura: o `>` de `</div>` e
 * o `}` de `{% endif %}`. Até então a linha nasce no nível de quem a precede —
 * `indentationRules` decide a indentação no Enter, quando o fechamento ainda
 * não foi escrito — e só voltava ao lugar num Shift+Alt+F posterior.
 *
 * Alcança apenas a linha do cursor de propósito: o cálculo vale para o
 * documento inteiro, mas mexer em linhas distantes a cada tecla digitada
 * bagunçaria o texto embaixo de quem está no meio de uma edição.
 */
const onTypeFormatter: vscode.OnTypeFormattingEditProvider = {
  provideOnTypeFormattingEdits(document, position, _ch, options) {
    const all = computeIndentation(
      document.getText(),
      readOptions(document, options),
      regionsOf(document),
    );
    const edit = all.find((e) => e.line === position.line);
    return edit ? toTextEdits([edit]) : [];
  },
};

/**
 * `true` quando o próprio editor já formata este documento ao salvar.
 *
 * Aí o participante daqui sai de cena. Os dois produziriam o mesmo resultado —
 * o indentador é idempotente —, mas quem ligou `editor.formatOnSave` também
 * escolheu o formatador, e passar por cima disso seria decidir por quem já
 * decidiu.
 */
function editorFormatsOnSave(document: vscode.TextDocument): boolean {
  return vscode.workspace.getConfiguration('editor', document).get<boolean>('formatOnSave', false);
}

/**
 * Indenta ao salvar sem depender de `editor.formatOnSave`.
 *
 * A opção do editor não pode ser ligada pela extensão: `configurationDefaults`
 * do manifesto perde para as configurações do usuário, e é por isso que existe
 * o comando **Configurar workspace**. Um participante de save próprio entrega o
 * comportamento na primeira vez que o arquivo é salvo, em qualquer máquina, sem
 * escrever nada nas configurações de ninguém.
 */
function registerFormatOnSave(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.workspace.onWillSaveTextDocument((event) => {
      const document = event.document;
      if (document.languageId !== LANGUAGE_ID) {
        return;
      }

      const config = vscode.workspace.getConfiguration('linxLiquid', document);
      if (!config.get<boolean>('format.onSave', true) || editorFormatsOnSave(document)) {
        return;
      }

      // `waitUntil` precisa ser chamado ainda dentro do listener, senão o save
      // segue sem esperar pelos edits.
      event.waitUntil(
        Promise.resolve(
          toTextEdits(
            computeIndentation(
              document.getText(),
              optionsFor(document, styleForSave(document)),
              regionsOf(document),
            ),
          ),
        ),
      );
    }),
  );
}

export function registerFormatting(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(LANGUAGE_ID, documentFormatter),
    vscode.languages.registerDocumentRangeFormattingEditProvider(LANGUAGE_ID, rangeFormatter),
    vscode.languages.registerOnTypeFormattingEditProvider(LANGUAGE_ID, onTypeFormatter, '>', '}'),
  );
  registerFormatOnSave(context);
}
