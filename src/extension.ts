import * as vscode from 'vscode';

import { registerFormatting, LANGUAGE_ID } from './format/provider.ts';
import { registerLinks } from './navigation/links.ts';
import { registerDiagnostics } from './diagnostics.ts';
import { registerHover } from './hover.ts';
import { registerCompletion } from './completion.ts';
import { openTemplateQuickPick } from './navigation/quickOpen.ts';
import { toggleTemplateScript } from './navigation/toggle.ts';
import { toggleBlockComment } from './core/comment.ts';
import { clearThemeCache } from './core/theme.ts';

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
 * Liga `formatOnSave` para esta linguagem no workspace.
 *
 * Precisa ser explícito: `configurationDefaults` do manifesto perde para as
 * configurações globais do usuário, então só um `.vscode/settings.json` do
 * workspace garante o comportamento.
 */
async function setupWorkspace(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    void vscode.window.showWarningMessage('Abra uma pasta para configurar o workspace.');
    return;
  }

  const config = vscode.workspace.getConfiguration('', folder.uri);
  await config.update(
    `[${LANGUAGE_ID}]`,
    { 'editor.formatOnSave': true, 'editor.defaultFormatter': 'local.linx-liquid-template' },
    vscode.ConfigurationTarget.Workspace,
  );
  void vscode.window.showInformationMessage(
    'Arquivos .template passam a ser formatados ao salvar neste workspace.',
  );
}

export function activate(context: vscode.ExtensionContext): void {
  registerFormatting(context);
  registerLinks(context);
  registerDiagnostics(context);
  registerHover(context);
  registerCompletion(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('linxLiquid.openTemplate', openTemplateQuickPick),
    vscode.commands.registerCommand('linxLiquid.toggleTemplateScript', toggleTemplateScript),
    vscode.commands.registerCommand('linxLiquid.toggleComment', toggleComment),
    vscode.commands.registerCommand('linxLiquid.setupWorkspace', setupWorkspace),
  );

  // A raiz do tema e os widgets são cacheados; um manifest novo ou alterado
  // muda a tradução de caminho de deploy para caminho local.
  const watcher = vscode.workspace.createFileSystemWatcher('**/manifest.xml');
  watcher.onDidCreate(clearThemeCache);
  watcher.onDidChange(clearThemeCache);
  watcher.onDidDelete(clearThemeCache);
  context.subscriptions.push(watcher);
}

export function deactivate(): void {
  clearThemeCache();
}
