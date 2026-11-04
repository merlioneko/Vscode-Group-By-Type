// ノード ID（SPEC「データスキーマ」）。URI は uri.toString() の値を受け取る。
// ID は URI と拡張子キーだけから作り、件数・ラベル・並び順は含めない。

export function folderId(uri: string): string {
  return `d:${uri}`;
}

export function groupId(parentUri: string, key: string): string {
  return `g:${parentUri}|${key}`;
}

export function fileId(uri: string): string {
  return `f:${uri}`;
}

export function errorId(parentUri: string): string {
  return `e:${parentUri}`;
}
