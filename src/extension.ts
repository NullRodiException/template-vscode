import * as vscode from 'vscode';

import { registerFormatting, LANGUAGE_ID } from './format/provider.ts';
import { registerFolding } from './format/folding.ts';
import { registerLinks } from './navigation/links.ts';
import { registerSymbols } from './navigation/symbols.ts';
import { registerDiagnostics } from './diagnostics.ts';
import { registerHover } from './hover.ts';
import { registerCompletion } from './completion.ts';
import { registerAutoCloseTags } from './autoClose.ts';
import { openTemplateQuickPick } from './navigation/quickOpen.ts';
import { toggleTemplateScript } from './navigation/toggle.ts';
import { copyInclude } from './navigation/copyInclude.ts';
import { toggleBlockComment } from './core/comment.ts';
import { clearThemeCache } from './core/theme.ts';
import { regionsOf, clearRegionCache } from './regionCache.ts';
import { clearWidgetIndex } from './widgetIndex.ts';

/**
 * Comenta ou descomenta o bloco selecionado com `{% comment %}`.
 *
 * Sempre usa a sintaxe do Liquid, que é a única que realmente neutraliza código
 * do servidor. Quando isso cai dentro de `{% raw %}` — onde a tag não é
 * processada — avisa na hora, e o diagnóstico deixa o Quick Fix disponível.
 */
async function toggleComment(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== LANGUAGE_ID) {
    return;
  }

  const document = editor.document;
  const text = document.getText();
  const selection = editor.selection;
  const result = toggleBlockComment(
    text,
    document.offsetAt(selection.start),
    document.offsetAt(selection.end),
    regionsOf(document),
  );

  const applied = await editor.edit((builder) => {
    // Os edits já vêm do fim para o início, para os offsets não escorregarem.
    for (const edit of result.edits) {
      const range = new vscode.Range(document.positionAt(edit.start), document.positionAt(edit.end));
      if (edit.start === edit.end) {
        builder.insert(range.start, edit.newText);
      } else {
        builder.replace(range, edit.newText);
      }
    }
  });

  if (applied && result.action === 'comment' && result.insideRaw) {
    void vscode.window.showWarningMessage(
      'Este trecho está dentro de {% raw %}, onde {% comment %} não é processado — o conteúdo continua sendo renderizado. Use o Quick Fix para converter em <!-- -->.',
    );
  }
}

/**
 * Liga `formatOnSave`, `formatOnType` e o Emmet para esta linguagem no workspace.
 *
 * Precisa ser explícito: `configurationDefaults` do manifesto perde para as
 * configurações globais do usuário, então só um `.vscode/settings.json` do
 * workspace garante o comportamento.
 */
async function setupWorkspace(extensionId: string): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    void vscode.window.showWarningMessage('Abra uma pasta para configurar o workspace.');
    return;
  }

  const config = vscode.workspace.getConfiguration('', folder.uri);
  await config.update(
    `[${LANGUAGE_ID}]`,
    // O id vem do próprio manifesto: escrever `local.linx-liquid-template` aqui
    // faria a configuração apontar para um formatador inexistente no dia em que
    // o `publisher` mudasse.
    //
    // `formatOnType` também vem do manifesto, mas pelo mesmo motivo do Emmet:
    // quem já tem um `editor.formatOnType` próprio nunca enxerga esse padrão.
    {
      'editor.formatOnSave': true,
      'editor.defaultFormatter': extensionId,
      'editor.formatOnType': true,
    },
    vscode.ConfigurationTarget.Workspace,
  );

  // Quem já tem um `emmet.includeLanguages` próprio nunca vê o padrão do
  // manifesto — a opção é um objeto, e o valor do usuário substitui o default
  // inteiro em vez de se somar a ele. Grava o mapa mesclado, sem perder o que
  // já estava lá.
  const emmet = config.get<Record<string, string>>('emmet.includeLanguages') ?? {};
  if (emmet[LANGUAGE_ID] !== 'html') {
    await config.update(
      'emmet.includeLanguages',
      { ...emmet, [LANGUAGE_ID]: 'html' },
      vscode.ConfigurationTarget.Workspace,
    );
  }

  void vscode.window.showInformationMessage(
    'Arquivos .template passam a ser formatados ao salvar e enquanto você digita neste workspace, e o Emmet passa a expandir neles.',
  );
}

export function activate(context: vscode.ExtensionContext): void {
  registerFormatting(context);
  registerFolding(context);
  registerLinks(context);
  registerSymbols(context);
  const refreshDiagnostics = registerDiagnostics(context);
  registerHover(context);
  registerCompletion(context);
  registerAutoCloseTags(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('linxLiquid.openTemplate', openTemplateQuickPick),
    vscode.commands.registerCommand('linxLiquid.toggleTemplateScript', toggleTemplateScript),
    vscode.commands.registerCommand('linxLiquid.toggleComment', toggleComment),
    vscode.commands.registerCommand('linxLiquid.copyInclude', copyInclude),
    vscode.commands.registerCommand('linxLiquid.setupWorkspace', () =>
      setupWorkspace(context.extension.id),
    ),
  );

  // A raiz do tema e os widgets são cacheados; um manifest novo ou alterado
  // muda a tradução de caminho de deploy para caminho local.
  const manifestWatcher = vscode.workspace.createFileSystemWatcher('**/manifest.xml');
  manifestWatcher.onDidCreate(clearThemeCache);
  manifestWatcher.onDidChange(clearThemeCache);
  manifestWatcher.onDidDelete(clearThemeCache);

  // Criar ou apagar um `.template` muda o resultado do diagnóstico de include
  // inexistente e a lista do autocomplete, sem que nenhum texto tenha sido
  // editado — sem isto o aviso fica pendurado até alguém digitar algo.
  const templateWatcher = vscode.workspace.createFileSystemWatcher('**/*.template');
  const onTemplateTreeChanged = (): void => {
    clearWidgetIndex();
    refreshDiagnostics();
  };
  templateWatcher.onDidCreate(onTemplateTreeChanged);
  templateWatcher.onDidDelete(onTemplateTreeChanged);
  templateWatcher.onDidChange(clearWidgetIndex);

  context.subscriptions.push(manifestWatcher, templateWatcher);
}

export function deactivate(): void {
  clearThemeCache();
  clearRegionCache();
  clearWidgetIndex();
}
