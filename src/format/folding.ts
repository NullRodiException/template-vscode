import * as vscode from 'vscode';

import { computeFoldRanges } from '../core/folding.ts';
import { regionsOf } from '../regionCache.ts';
import { LANGUAGE_ID } from './provider.ts';

const foldingProvider: vscode.FoldingRangeProvider = {
  provideFoldingRanges(document) {
    return computeFoldRanges(document.getText(), regionsOf(document)).map(
      (range) =>
        new vscode.FoldingRange(
          range.start,
          range.end,
          range.kind === 'comment' ? vscode.FoldingRangeKind.Comment : undefined,
        ),
    );
  },
};

export function registerFolding(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider({ language: LANGUAGE_ID }, foldingProvider),
  );
}
