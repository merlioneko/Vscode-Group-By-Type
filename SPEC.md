# File Grouper 仕様書

> 仕様は本書を唯一の正とする。作業の順序と完了判定は PLAN.md、実装時の行動規律は CLAUDE.md に書く。

## 概要

### 目的

- **対象者**：この拡張機能の利用者本人（VS Code でファイル数の多いフォルダを扱う開発者）。
- **解決する問題**：標準エクスプローラーでは、ファイルの多いフォルダから目的のファイルを探しにくい。今は不要な種類のファイルを畳んで隠す手段もない。
- **提供するもの**：標準エクスプローラーとは別のツリービュー。実際のフォルダ階層はそのまま表示し、各フォルダ直下のファイルを拡張子ごとの仮想グループにまとめる。グループは1つずつ開閉できる。
- 実際のファイル・フォルダには一切変更を加えない。
- **問題の裏付け**：利用者は標準の `explorer.sortOrder: "type"` を試し済み。同じ拡張子のファイルは並ぶが畳めないため、不要な部分を読み飛ばす手間が残った。この拡張機能が足す価値は「畳めること」に絞られる。
- 解決策（フォルダごとのグループ化）の効果はまだ検証していない（→ U1）。

### 対象プラットフォーム / 主要技術スタック

- **対象**：VS Code デスクトップ版 1.90 以降（Windows / macOS / Linux）。Remote-SSH・WSL・Dev Containers でも動くように作る（→ U5）。Web 版（vscode.dev）は対象外。
- **実装**：TypeScript（strict）、VS Code Extension API（`TreeDataProvider`）、picomatch 4 系（glob パターンとの照合）。
- **テスト・パッケージ**：mocha（単体テスト）、@vscode/test-cli と @vscode/test-electron（統合テスト）、@vscode/vsce（VSIX の作成）。

### 用語

| 用語 | 意味 |
|---|---|
| ルート | ワークスペースに追加されたフォルダ。マルチルートなら複数ある |
| グループ | フォルダ直下のファイルを拡張子キーでまとめた仮想ノード。実在しない |
| 拡張子キー | グループ分けに使う値（`.py` など）。拡張子がなければ空文字（BL-1） |
| relPath | ルートから見た `/` 区切りの相対パス。ルート自身は空文字 |

## 確定事項

| ID | 決定 | 理由 |
|---|---|---|
| K-1 | 標準エクスプローラーには手を加えず、独立したツリービューとして提供する | 標準エクスプローラーのツリーに仮想ノードを足す API がない。標準の「ファイルのネスト」は親になるファイルが必要で、仮想フォルダは作れない |
| K-2 | 一次実装の範囲は、フォルダ階層の表示、拡張子グループ、ファイルを開く、表示の更新（手動と自動）とする | 元仕様の範囲に「更新」を足した。別のツリーなので、更新がないとファイル操作のたびに表示が古くなる（利用者確認済み） |
| K-3 | 次は対象外とする：ファイル・フォルダの追加/削除/名前変更、ドラッグ＆ドロップ、検索・絞り込み、グループ単位の表示/非表示、初期展開状態の設定、右クリックメニュー、アクティブなエディターとの同期、設定項目の追加、Marketplace への公開、Web 版 | 元仕様の方針（必要になったら追加する）に従う。設定・公開・Web 版は一次実装の試用に要らない |
| K-4 | ビューはエクスプローラー内の1セクションとして置く | 導入の手間が最小で、元仕様の「エクスプローラーにおいて」にも合う。利用者は後からドラッグで移動できる（利用者確認済み） |
| K-5 | グループの初期状態は「畳む」とする。ただし、そのフォルダのグループが1つだけなら「展開」にする | 表示量を減らすという目的に合う。拡張子が1種類しかないフォルダで無駄なクリックをさせない（利用者確認済み） |
| K-6 | グループのラベルは拡張子キー（`.py`）とし、ファイル数を添えて、専用のアイコンを付ける | 元仕様のラベルを保ったまま、`.github` などのドットフォルダと見分けられるようにする |
| K-7 | ルートは単一ルートでも必ずノードとして表示し、初期状態は「展開」とする | 元仕様の表示イメージに合わせる。単一ルートとマルチルートで構造を変えない |
| K-8 | 非表示にするファイルは、設定 `files.exclude` に従う。対応する範囲は BL-2 に書く | 標準エクスプローラーと同じ規則を、設定を二重に持たずに使える |
| K-9 | glob パターンとの照合には picomatch を使う | VS Code API には、任意のパスがパターンに当たるかを判定する機能がない。`findFiles` はファイルしか返さないので、フォルダを判定できない |
| K-10 | ファイルの読み込みは `workspace.fs` だけで行い、Node の `fs` は使わない | リモート環境や仮想ファイルシステムでも同じコードで動く。読み取り専用であることも機械的に確かめやすい |
| K-11 | ファイルは `vscode.open` コマンドで開く | 画像などのバイナリや、利用者が関連付けたエディターをそのまま使える。`showTextDocument` はバイナリで失敗する |
| K-12 | 表示の更新は「ファイル監視 → 300ms 待ってまとめる → ツリー全体を描き直す」とする | VS Code のファイル監視をそのまま使えて、実装が小さい。変更箇所だけを更新する方式は複雑になる割に、想定する規模では速さが変わらない |
| K-13 | `engines.vscode` は `^1.90.0`、`@types/vscode` は `1.90.0` に固定する | 必要な API はすべてこの版にある。型定義を固定すれば、より新しい API を誤って使ったときに型チェックで止まる（vsce は engines より新しい型定義を受け付けない） |
| K-14 | TypeScript（strict）で書き、ビルドは `tsc` だけで行う（バンドラは使わない） | VS Code 拡張機能の標準的な構成。実行時の依存は picomatch だけなので、バンドラを入れる利点が小さい |
| K-15 | 実行時の依存は picomatch だけとする。ネットワーク通信もテレメトリもない | 読み取り専用のローカル機能には不要。確かめる範囲を小さく保てる |
| K-16 | 制限モード（Restricted Mode）と仮想ワークスペースでも動かす（`untrustedWorkspaces.supported: true`、`virtualWorkspaces: true`） | ワークスペース内のコードを実行せず、読み取りしかしない |
| K-17 | UI の文言は英語を既定にし、日本語訳を同梱する | VS Code の表示言語に合わせて切り替わる |
| K-18 | 配布は VSIX ファイルを手元でインストールする方式とする | 一次実装の目的は試用。公開するには publisher の登録やライセンスの整備が別に必要になる |
| K-19 | 分類・除外・並び順のロジック（core）は vscode に依存させず、mocha で単体テストする。VS Code 上の挙動は統合テストと手動確認で確かめる | 規則を VS Code なしで素早く検証できる |
| K-20 | 実装は Claude Code のクラウドセッションで行う。統合テストは xvfb 上の VS Code で実行し、画面は Playwright で VS Code を起動して撮影して確かめる | VS Code 1.144.1 で、統合テストの実行と画面の撮影ができることを確認済み（root で動くため `--no-sandbox` が必要）。実装した側が、その場で動作と見た目を確かめられる |
| K-21 | 名称は File Grouper とする（パッケージ名 `vscode-file-grouper`、ID の接頭辞 `fileGrouper`、publisher `local`）。ビュー名も File Grouper とし、日本語には訳さない | リポジトリ名に合わせた（利用者確認済み）。製品名なので訳さない |

## 未確定事項

| ID | 何が未確定か | 確定に必要な検証 | ゲート |
|---|---|---|---|
| U1 | フォルダごとにグループを開閉する方式で、読み飛ばしの手間が実際に減るか。問題そのものは利用者が確認済みで、未検証なのは解決策の側。拡張子がばらけたフォルダでは階層が1段増える。必要なグループを開く手間も、フォルダごと・ウィンドウの再読み込みごとにかかる | M4 の完了後、利用者が主要なプロジェクトで数日使い、`explorer.sortOrder: "type"` を設定した標準エクスプローラーと比べる。不便だったフォルダと操作を記録する | 二次実装の着手条件。確定するまで二次実装には着手しない。効果がなければ二次実装は行わない |
| U2 | 利用者の実際の `files.exclude` で、標準エクスプローラーと同じ表示になるか（`!` の例外パターンなどには対応しない） | M2 の完了後、利用者が自分のプロジェクトで標準エクスプローラーと見比べる | M4 の完了まで。差があれば、受け入れるか対応するかを決める |
| U5 | リモート環境での動作（使う場合のみ） | Remote-SSH または WSL で、M4 の手動チェックを行う | なし（使うときに確認） |

## 受容したトレードオフ

| 捨てた選択肢 | 理由 |
|---|---|
| 複合拡張子（`.d.ts`、`.test.ts`、`.tar.gz`）を1つのグループにまとめる | `app.module.ts` のように、どこまでを拡張子とみなすか決められない。最後の1つだけを使う |
| `files.exclude` との完全な互換（`!` の例外パターン、絶対パスのパターン）と、`.gitignore` による除外（`explorer.excludeGitIgnore`） | VS Code 内部の glob 実装を再現し、その変更に追従し続ける必要がある。標準エクスプローラーと表示が違うことがある（→ U2） |
| 大文字と小文字を区別しない照合 | picomatch の既定（区別する）に従う。Windows と macOS では標準エクスプローラーと差が出ることがある |
| 標準エクスプローラーの表示設定（`explorer.sortOrder`、`explorer.compactFolders` など）への追従 | 設定ごとの分岐が増える。並び順は独自の固定規則にし、子が1つしかないフォルダも1段ずつ表示する |
| 展開状態の保存 | VS Code は拡張機能のツリーの展開状態を保存しない（本体ソースで確認）ので、ウィンドウを再読み込みすると初期状態に戻る。独自に保存する機能は二次実装の候補 |
| 変更のあった箇所だけの更新 | ノードとの対応表を管理する必要があって複雑。全体を描き直しても、読み直されるのは開いているフォルダだけ |
| ダブルクリックでタブを固定する | 拡張機能のツリーの API にはダブルクリックを判定する手段がない。1クリックで開き、プレビュー表示にするかどうかは VS Code の設定に従う |
| フォルダによって分類方法を変える（ファイルが少なければまとめない、など） | 規則が一律のほうが結果を予測しやすい。その代わり、拡張子がばらけたフォルダでは階層が1段増える |
| 単一ルートのときにルートノードを省く | 元仕様の表示イメージに合わせた。標準エクスプローラーより1段深くなる |

## アーキテクチャ

### モジュール構成

```text
src/
├─ extension.ts            起動処理。部品を作って接続し、統合テスト用に { provider } を返す
├─ core/                   vscode に依存しない処理（単体テストの対象）
│  ├─ extKey.ts            ファイル名 → 拡張子キー（BL-1）
│  ├─ exclude.ts           files.exclude の値 → 除外判定関数（BL-2）
│  ├─ buildChildren.ts     ディレクトリ内の項目一覧 → 並べ替えたフォルダとグループ（BL-3、BL-4）
│  └─ ids.ts               ノード ID を作る（データスキーマ）
├─ tree/
│  ├─ nodes.ts             ノードの型
│  ├─ directoryReader.ts   workspace.fs.readDirectory の薄いラッパー。テストで差し替えられるようインターフェースにする
│  └─ provider.ts          TreeDataProvider（getChildren / getTreeItem / refresh）
├─ refresh.ts              ファイル監視・待ち合わせ・設定とワークスペースの変化 → provider.refresh()（BL-5）
├─ openFile.ts             ファイルを開くコマンド（BL-6）
└─ test/
   ├─ unit/                core の単体テスト（VS Code なしで実行）
   └─ integration/         VS Code 上で動かす統合テスト
scripts/
├─ prepare-fixture.mjs     テスト用ワークスペース .test-workspace/sample を作る（受け入れ条件）
└─ check-rules.mjs         BL-8 と core の依存ルールを検査する
l10n/bundle.l10n.ja.json、package.nls.json、package.nls.ja.json   UI の文言
```

### データの流れ

```text
フォルダを展開する
  → provider.getChildren(フォルダ)
  → directoryReader.read(uri)               workspace.fs.readDirectory
  → core/exclude で除外する                 判定関数はルートごとに作って持っておく
  → core/buildChildren で分類・並べ替え・初期状態を決める
  → ノードの配列を返す（グループは所属ファイルの一覧を持つ）

グループを展開する
  → provider.getChildren(グループ) → 持っているファイル一覧を返す（ファイルは読まない）

更新のきっかけ（BL-5）
  → refresh.ts → provider.refresh() → onDidChangeTreeData.fire(undefined)
  → VS Code が開いているノードの子を取り直す
```

### 依存のルール

- `src/core/` は `vscode` を import しない。
- `src/test/` 以外のコードは、BL-8 で禁じた API を使わない。
- どちらも `npm run check:rules` で検査する。

## データスキーマ

永続化するデータはない。設定項目も追加しない。読み取る設定は `files.exclude` だけ。

### ノード

```ts
type Node = FolderNode | GroupNode | FileNode | ErrorNode;

interface FolderNode {
  kind: 'folder';
  id: string;
  uri: vscode.Uri;
  name: string;                 // ルートはワークスペースフォルダ名、それ以外はフォルダ名
  relPath: string;              // ルートは ''
  rootUri: vscode.Uri;          // files.exclude の取得と判定関数の選択に使う
  isRoot: boolean;
}

interface GroupNode {
  kind: 'group';
  id: string;
  parentUri: vscode.Uri;
  key: string;                  // '.py' など。拡張子なしは ''
  files: FileNode[];            // BL-3 の順に並べ替え済み
  initiallyExpanded: boolean;   // BL-4
}

interface FileNode {
  kind: 'file';
  id: string;
  uri: vscode.Uri;
  name: string;
}

interface ErrorNode {
  kind: 'error';
  id: string;
  parentUri: vscode.Uri;
  code: string;                 // FileSystemError.code。それ以外の例外は 'Unknown'
  message: string;
}
```

### ID

`<uri>` は `uri.toString()` の値を表す。

- フォルダ（ルートを含む）：`d:<uri>`　例：`d:file:///w/src`
- グループ：`g:<親の uri>|<key>`　例：`g:file:///w/src|.py`（拡張子なしは `g:file:///w/src|`）
- ファイル：`f:<uri>`　例：`f:file:///w/src/main.py`
- エラー：`e:<親の uri>`　例：`e:file:///w/locked`

規則：

- ID は URI と拡張子キーだけから作る。件数・ラベル・並び順は含めない。
- 理由：VS Code は ID で展開状態と選択状態を保つ。ID を省略するとラベルから作られるため、ラベル（件数など）が変わると状態が失われる。
- ID はツリー全体で重複させない（重複すると VS Code がエラーにする）。

## 画面設計

### 配置と操作

- **場所**：エクスプローラー（`contributes.views.explorer`）。ビュー ID は `fileGrouper.view`。
- **タイトルバー**：「最新の情報に更新」（コマンド `fileGrouper.refresh`、アイコン `$(refresh)`）と「すべて折りたたむ」（`createTreeView` の `showCollapseAll: true`）を置く。
- **コマンドパレット**：`fileGrouper.refresh` にはカテゴリ `File Grouper` を付け、「File Grouper: 最新の情報に更新」と表示する。カテゴリがないと「最新の情報に更新」だけになり、ほかのコマンドと見分けにくい（利用者確認済み）。
- 右クリックメニューはない。

### 行の表示

| 種類 | ラベル | 説明（薄字） | アイコン | 初期状態 | クリック | contextValue |
|---|---|---|---|---|---|---|
| ルート | ワークスペースフォルダ名 | なし | アイコンテーマのフォルダ | 展開 | 開閉 | `root` |
| フォルダ | フォルダ名 | なし | アイコンテーマのフォルダ | 畳む | 開閉 | `folder` |
| グループ | 拡張子キー（`.py`）。拡張子なしは「(拡張子なし)」 | ファイル数（例：`3`） | codicon `files` | BL-4 | 開閉 | `group` |
| ファイル | ファイル名（元の表記のまま） | なし | アイコンテーマのファイル | なし | 開く（BL-6） | `file` |
| エラー | 「このフォルダーを読み込めません」 | エラーコード | codicon `warning` | なし | なし | `error` |

- フォルダとファイルには `resourceUri` を設定する。アイコンテーマのアイコンや Git の色などの装飾が、標準エクスプローラーと同じように付く。
- グループには `resourceUri` を設定しない。設定するとフォルダのアイコンが付いて、フォルダと見分けられなくなる。
- エラー行のツールチップには、エラーメッセージの全文を出す。

### フォルダ未オープン時

- `viewsWelcome` で、「フォルダーが開かれていません。」という案内と「フォルダーを開く」ボタン（`command:vscode.openFolder`）を出す。表示条件は `workspaceFolderCount == 0`。

### 文言

| 用途 | 英語（既定） | 日本語 |
|---|---|---|
| ビュー名 | File Grouper | （翻訳しない） |
| 更新コマンド | Refresh | 最新の情報に更新 |
| コマンドのカテゴリ | File Grouper | （翻訳しない） |
| 拡張子なしのグループ | (no extension) | (拡張子なし) |
| エラー行 | Cannot read this folder | このフォルダーを読み込めません |
| ファイルが消えていたときの警告 | File not found: {0} | ファイルが見つかりません: {0} |
| 未オープン時の案内 | No folder is open. | フォルダーが開かれていません。 |
| 案内のボタン | Open Folder | フォルダーを開く |
| 出力チャネル名 | File Grouper | （翻訳しない） |

- package.json の文言は `package.nls.json` と `package.nls.ja.json` に書く。コード中の文言は `vscode.l10n.t()` で扱い、訳は `l10n/bundle.l10n.ja.json` に書く。

## ビジネスロジック

### BL-1 拡張子キー

- 名前の中で最後に出てくる `.` の位置を i とする。
  - i が 0 以下（`.` がない、または先頭にしかない）か、i が最後の文字なら、拡張子なし（キーは `''`）。
  - それ以外は、i から後ろを小文字にしたものをキーとする。
- グループのラベルにはキー（小文字）を使う。ファイル名は元の表記のまま表示する。
- フォルダは、名前に `.` があっても分類しない。

| ファイル名 | キー |
|---|---|
| `main.py` | `.py` |
| `README` | `''` |
| `.gitignore` | `''` |
| `.eslintrc.json` | `.json` |
| `.env.local` | `.local` |
| `archive.tar.gz` | `.gz` |
| `types.d.ts` | `.ts` |
| `IMG.JPG` | `.jpg` |
| `file.` | `''` |
| `...` | `''` |

### BL-2 除外

- 各ディレクトリ直下の項目（フォルダとファイルの両方）に適用する。除外したフォルダは表示せず、中も読まない。除外したファイルは件数に含めない。
- 設定はルートごとに読む：`workspace.getConfiguration('files', ルートの uri).get('exclude')`。
- 照合する文字列は relPath（例：`src/app.js`）。照合には `picomatch(pattern, { dot: true })` を使う。

| 設定の値 | 扱い |
|---|---|
| `true` | 有効なパターンとして使う |
| `false` | 無視する |
| `{ "when": "..." }` | パターンに一致し、さらに条件を満たす項目だけを除外する。条件は「when の `$(basename)` を、その項目の名前から最後の拡張子を除いたものに置き換えた名前の項目が、同じディレクトリにあること」。例：`{"**/*.js": {"when": "$(basename).ts"}}` は、`app.ts` があるときだけ `app.js` を除外する |
| キーが `!` で始まる | 無視する（対応しない） |

照合の例（picomatch 4 で動作を確認済み）：

| パターン | 対象 | 結果 |
|---|---|---|
| `**/.git` | `.git` と `src/.git` | どちらも一致 |
| `*.js` | `app.js` と `src/app.js` | `app.js` だけ一致（ルート直下に限る） |
| `**/build/**` | `build` | 一致（フォルダごと隠れる） |
| `**/*.JS` | `src/app.js` | 一致しない（大文字と小文字を区別する） |

- `files.exclude` が変わったら（`affectsConfiguration('files.exclude')`）、判定関数を作り直してツリー全体を描き直す。

### BL-3 並び順

- フォルダの中は、フォルダ → グループの順に並べる。
- フォルダ同士、グループ内のファイル同士は `new Intl.Collator('en', { numeric: true, sensitivity: 'base' })` で比べる。結果が同じならコード単位で比べる（`A.txt` が `a.txt` より先）。Collator は1つだけ作って使い回す。
- グループ同士はキーをコード単位で昇順に並べ、拡張子なしのグループを最後に置く。
- ルート同士は、ワークスペースでの並び順に従う。
- 動作を確認した例：
  - `.github`, `.vscode`, `docs`, `empty`, `src`
  - `app.ts`, `file2.ts`, `file10.ts`, `types.d.ts`
  - `DATA.JSON`, `settings.json`
  - `.gitignore`, `LICENSE`

### BL-4 初期展開

- ルートは展開、フォルダは畳む、グループは畳む。ただし、そのフォルダのグループが1つだけならそのグループは展開する（サブフォルダの有無は問わない）。
- 初期状態が使われるのは、その ID が初めて表示されるときだけ。描き直しても、同じ ID の行は利用者が開閉した状態のまま残る（VS Code の仕様）。

### BL-5 表示の更新

| きっかけ | 方法 | タイミング |
|---|---|---|
| 更新ボタン | `fileGrouper.refresh` | すぐ |
| ファイル・フォルダの作成と削除（名前の変更は、削除と作成として届く） | `workspace.createFileSystemWatcher('**/*', false, true, false)`（内容の変更は無視する） | 最後のイベントから 300ms 後に1回 |
| `files.exclude` の変更 | `workspace.onDidChangeConfiguration` | すぐ |
| ワークスペースフォルダの追加と削除 | `workspace.onDidChangeWorkspaceFolders` | すぐ |

- 描き直しは常にツリー全体で行う（`onDidChangeTreeData.fire(undefined)`）。
- ビューが隠れている間の描き直しは、表示されるまで VS Code が保留する。拡張機能の側では制御しない。
- `files.watcherExclude` に含まれる場所での変化は、自動では反映されない。更新ボタンで反映する。

### BL-6 ファイルを開く

- ファイル行の `command` は `fileGrouper.openFile`（引数は uri）とする。このコマンドは `contributes.commands` に登録せず、コマンドパレットには出さない。
- まず `workspace.fs.stat(uri)` でファイルがあるかを確かめる。
  - あれば `commands.executeCommand('vscode.open', uri)` を実行する。オプションは渡さず、プレビュー表示にするかどうかなどは VS Code の設定に任せる。
  - なければ「ファイルが見つかりません: <ファイル名>」と警告を出し、ツリー全体を描き直す。

### BL-7 エラーと特殊なファイル

- **ディレクトリを読めないとき**：そのフォルダの子としてエラー行を1つだけ出す。出力チャネル「File Grouper」（`LogOutputChannel`）に URI とエラーを記録する。通知は出さない（展開するたびに出てしまうため）。
- `getChildren` から例外を投げない。
- **種類の判定**：`FileType.Directory` のビットが立っていればフォルダとする（フォルダへのシンボリックリンクを含む）。それ以外はファイルとする（壊れたシンボリックリンクを含む）。
- 読み込むのは展開されたフォルダだけで、先読みはしない。そのため、シンボリックリンクが循環していても無限に読み込むことはない。

### BL-8 読み取り専用の保証

- `src/test/` 以外で使ってよいファイル API は、`workspace.fs.readDirectory` と `workspace.fs.stat` だけ。
- 次のものは使わない：`workspace.fs` の `writeFile` / `delete` / `rename` / `copy` / `createDirectory`、`workspace.applyEdit` と `WorkspaceEdit`、Node の `fs`、設定の書き込み（`WorkspaceConfiguration.update`）。
- `npm run check:rules` で検査する。

## 受け入れ条件

### テスト用ワークスペース

`scripts/prepare-fixture.mjs` が、実行するたびに `.test-workspace/sample/` を作り直す。リポジトリにはファイルとして置かない。`.git` という名前のフォルダや空のフォルダは git で管理できないうえ、`.ts` などのファイルがビルドや lint の対象に紛れ込むため。

```text
sample/
├─ .git/HEAD
├─ .github/workflows/ci.yml
├─ .vscode/settings.json        中身：{"files.exclude": {"**/*.js": {"when": "$(basename).ts"}}}
├─ docs/guide.md
├─ docs/logo.png                有効な 1×1 の PNG
├─ empty/                       空のフォルダ
├─ src/
│  ├─ app.ts  app.js  legacy.js  file2.ts  file10.ts  types.d.ts
│  └─ main.py  utils.py  settings.json  DATA.JSON  archive.tar.gz
└─ .gitignore  LICENSE  CHANGELOG.md  README.md  config.json  data.json
```

中身を指定していないファイルは空でよい。

### 期待するツリー（初期状態）

```text
sample                              ルート：展開
├─ .github                          畳む
│  └─ workflows                     畳む
│     └─ .yml  1                    展開（グループが1つ）
│        └─ ci.yml
├─ .vscode                          畳む
│  └─ .json  1                      展開（グループが1つ）
│     └─ settings.json
├─ docs                             畳む
│  ├─ .md  1                        畳む
│  │  └─ guide.md
│  └─ .png  1                       畳む
│     └─ logo.png
├─ empty                            畳む（子なし）
├─ src                              畳む
│  ├─ .gz  1                        畳む（src のグループはすべて畳む）
│  │  └─ archive.tar.gz
│  ├─ .js  1                        app.js は when 条件で除外される
│  │  └─ legacy.js
│  ├─ .json  2
│  │  ├─ DATA.JSON
│  │  └─ settings.json
│  ├─ .py  2
│  │  ├─ main.py
│  │  └─ utils.py
│  └─ .ts  4
│     ├─ app.ts
│     ├─ file2.ts
│     ├─ file10.ts
│     └─ types.d.ts
├─ .json  2                         畳む
│  ├─ config.json
│  └─ data.json
├─ .md  2                           畳む
│  ├─ CHANGELOG.md
│  └─ README.md
└─ (拡張子なし)  2                  畳む
   ├─ .gitignore
   └─ LICENSE
```

`.git` は `files.exclude` の既定値によって表示されない。

### 条件一覧

| ID | 条件 | 確認方法 | 元仕様 §7 |
|---|---|---|---|
| AC-1 | エクスプローラーに「File Grouper」が表示され、開ける | 統合：`fileGrouper.view.focus` が成功する。手動：目視 | 1 |
| AC-2 | フォルダ階層が、期待するツリーと一致する | 統合：ルートから getChildren をたどって比べる | 2 |
| AC-3 | 各フォルダのグループ、件数、所属するファイル、並び順が、期待するツリーと一致する | 統合：同上。単体：BL-1〜BL-3 の表のすべての行 | 3 |
| AC-4 | 初期状態が BL-4 のとおりになる。グループを1つずつ開閉でき、ほかのグループに影響しない | 統合：TreeItem の collapsibleState を見る。手動：実際に開閉する | 4 |
| AC-5 | ファイルをクリックすると通常のエディターで開く。テキストはテキストエディター、PNG は画像プレビューで開く | 統合：行の command を実行し、アクティブなタブを確かめる。テキストは `TabInputText` で uri が一致する。PNG はタブ名が一致し、`TabInputText` ではない（VS Code 1.144 では画像プレビューが本体に組み込まれ、API からタブの種類が見えない）。画像として表示されることは撮影して確かめる | 5 |
| AC-6 | 拡張機能の操作によって、ファイルやフォルダが変わらない | 統合：表示と「開く」の操作の前後で、一時ワークスペースのパス一覧・サイズ・更新日時・内容のハッシュが一致する。あわせて `npm run check:rules` | 6 |
| AC-7 | 作成と削除が3秒以内に自動で反映される。更新ボタンと `files.exclude` の変更でも反映される。反映の後も開閉状態が保たれる | 統合：一時ワークスペースでファイルを作成・削除して子を確かめる。手動：開閉状態 | 追加 |
| AC-8 | フォルダ未オープン時に、案内とボタンが出る | 手動 | 追加 |
| AC-9 | 読めないフォルダの下にエラー行が1つ出て、ほかの表示はそのまま続く | 統合：読み込み処理を差し替えた provider で確かめる（root 権限で実行すると chmod が効かないため） | 追加 |
| AC-10 | 10,000 件の項目を返すフォルダで、getChildren が1秒以内に終わる | 統合：読み込み処理を差し替えた provider で計る | 追加 |
