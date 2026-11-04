/**
 * 名前の中で最後に出てくる `.` の位置を返す。拡張子とみなせないときは -1（BL-1）。
 * `.` がない、先頭にしかない、最後の文字である、のどれかなら拡張子なし。
 */
export function lastExtIndex(name: string): number {
  const i = name.lastIndexOf('.');
  if (i <= 0 || i === name.length - 1) {
    return -1;
  }
  return i;
}

/** ファイル名から拡張子キーを作る（BL-1）。拡張子がなければ空文字。 */
export function extKey(fileName: string): string {
  const i = lastExtIndex(fileName);
  return i < 0 ? '' : fileName.slice(i).toLowerCase();
}

/** 名前から最後の拡張子を除いたもの。拡張子がなければ名前のまま。 */
export function stripLastExt(name: string): string {
  const i = lastExtIndex(name);
  return i < 0 ? name : name.slice(0, i);
}
