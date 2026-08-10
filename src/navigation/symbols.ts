import * as vscode from 'vscode';

import { findSymbols, type SymbolKind } from '../core/symbols.ts';
import { regionsOf } from '../regionCache.ts';
import { LANGUAGE_ID } from '../format/provider.ts';

const KIND: Record<SymbolKind, vscode.SymbolKind> = {
  component: vscode.SymbolKind.Class,
  section: vscode.SymbolKind.Module,
  capture: vscode.SymbolKind.Variable,
  assign: vscode.SymbolKind.Variable,
};

const DETAIL: Record<SymbolKind, string> = {
  component: 'componente Vue',
  section: '',
  capture: '{% capture %}',
  assign: '{% assign %}',
};

const symbolProvider: vscode.DocumentSymbolProvider = {
  provideDocumentSymbols(document) {
    return findSymbols(document.getText(), regionsOf(document)).map((symbol) => {
      const range = new vscode.Range(
        document.positionAt(symbol.start),
        document.positionAt(symbol.end),
      );
      return new vscode.DocumentSymbol(
        symbol.name,
        DETAIL[symbol.kind],
        KIND[symbol.kind],
        range,
        range,
      );
    });
  },
};

export function registerSymbols(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider({ language: LANGUAGE_ID }, symbolProvider),
  );
}
