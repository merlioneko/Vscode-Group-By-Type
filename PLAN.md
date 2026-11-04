# File Grouper 実装計画書

> 仕様は SPEC.md に書く。本書には作業の順序と完了判定だけを書く。

## 進め方

- 実装は Claude Code のクラウドセッションで行う。リポジトリは GitHub に置く（クラウドの作業環境は一時的で、push しないと作業が残らないため）。
- マイルストーンごとにブランチを作り、完了したら push する。利用者は差分を確かめてから main に取り込む。
- 新しいセッションで続きを頼むときは、その前に利用者が CLAUDE.md の「現在のマイルストーン」を書き換える。
- 完了判定は、すべて「実行して確かめられること」にする。ビルドが通るだけでは完了としない。
- 完了報告には次を含める：完了判定のコマンドと結果、撮影した画面、仕様に書かれていない細部で判断したこと（判断事項）。
- 1コミットに1つの目的。各マイルストーンの「コミット」欄の単位で分ける。
- 利用者が手元で行うこと：M2 の後の除外の見比べ（U2）、M4 での VSIX のインストールと手動チェック、試用（U1）。

## 一覧

| M | 内容 | 主な完了判定 | 対応する AC | ゲート |
|---|---|---|---|---|
| M0 | 雛形、ビルド、テスト基盤 | compile・lint・単体テスト・統合テストの空のテストが通る | なし | なし |
| M1 | 分類・除外・並び順のロジック（core） | 単体テストで、SPEC の BL-1〜BL-4 の表のすべての行が通る | AC-3（単体） | なし |
| M2 | ツリーの表示とファイルを開く | 統合テストで、期待するツリーと一致し、ファイルが開く | AC-1〜6、8〜10 | 完了後に利用者が U2 を確かめる |
| M3 | 表示の更新 | 統合テストで、作成・削除・設定の変更が反映される | AC-7 | なし |
| M4 | 日本語化、パッケージ、試用 | VSIX をインストールして、手動チェックがすべて通る | すべて（手動） | 完了後に U1 を判定する |

## M0 雛形、ビルド、テスト基盤

**目的**：以降のマイルストーンを「実行して確かめる」ための土台を作る。

**作業**

- package.json
  - name `vscode-file-grouper`、displayName `File Grouper`、publisher `local`、version `0.1.0`
  - `engines.vscode: "^1.90.0"`、`main: "./out/extension.js"`、`activationEvents: []`、`capabilities`（SPEC K-16）
  - contributes は空でよい
- 依存パッケージ
  - dependencies：picomatch 4 系
  - devDependencies：typescript、@types/vscode（1.90.0 に固定）、@types/node、@types/picomatch、mocha、@types/mocha、@vscode/test-cli、@vscode/test-electron、@vscode/vsce、eslint、typescript-eslint
- tsconfig.json：strict、target ES2022、module commonjs、rootDir `src`、outDir `out`、対象は `src` だけ
- npm scripts

| script | 内容 |
|---|---|
| `compile` | `tsc -p .` |
| `dev` | `compile` の後に `node scripts/prepare-fixture.mjs` |
| `lint` | `eslint src` |
| `test:unit` | `compile` の後に `mocha "out/test/unit/**/*.test.js"` |
| `test:integration` | `dev` の後に `vscode-test` |
| `check:rules` | `node scripts/check-rules.mjs` |
| `vscode:prepublish` | `npm run compile`（vsce が VSIX を作る前に実行する。`out/` は git で管理しないため、これがないと新しいクローンで `package` が失敗する） |
| `package` | `vsce package --allow-missing-repository --skip-license` |

- `.vscode-test.mjs`：files は `out/test/integration/**/*.test.js`、workspaceFolder は `.test-workspace/sample`、mocha の timeout は 20 秒。root で実行しているときだけ、launchArgs に `--no-sandbox` を加える（クラウド環境は root で動くため）。テストは最新の stable の VS Code で行い、1.90 では実行しない
- `scripts/prepare-fixture.mjs`：M0 では、空の `.test-workspace/sample/` を作り直すだけでよい（中身は M2 で作る）
- `scripts/check-rules.mjs`：次のどれかに違反したら、違反箇所を表示して終了コード 1 で終わる
  - `src/test/` 以外で `workspace.fs` を書いてよいのは `src/tree/directoryReader.ts` と `src/openFile.ts` だけ。直後に続くのは `.readDirectory` か `.stat` だけ
  - `src/test/` 以外に、`applyEdit`、`WorkspaceEdit`、`.update(`、`'fs'`、`"fs"`、`'node:fs'`、`"node:fs"`、`fs/promises` が現れない
  - `src/core/` に `'vscode'` と `"vscode"` が現れない
- `.gitignore`：`out/`、`node_modules/`、`.vscode-test/`、`.test-workspace/`、`*.vsix`
- `.vscodeignore`：`src/**`、`out/test/**`、`.vscode/**`、`scripts/**`、`.test-workspace/**`、`.vscode-test/**`、`**/*.map`、`tsconfig.json`、`eslint.config.*`、`.vscode-test.mjs`、`SPEC.md`、`PLAN.md`、`CLAUDE.md`
- `.vscode/launch.json`：「Run Extension」。preLaunchTask で `npm: dev` を実行し、`.test-workspace/sample` を開いた拡張機能開発ホストを F5 で起動する
- `src/extension.ts`：空の activate と deactivate
- 仮のテストを置く。単体テストは1件（自明な assert でよい）。統合テストは1件（拡張機能 `local.vscode-file-grouper` が見つかり、activate できる）

**完了判定**

1. `npm ci && npm run compile && npm run lint && npm run test:unit && npm run check:rules` がすべて成功する。
2. 違反を含むファイルを一時的に `src/` に置くと、`npm run check:rules` が失敗する。確かめたらそのファイルは消す。
3. `xvfb-run -a npm run test:integration` が成功する（画面のある環境では `xvfb-run -a` は要らない）。

**注意（事前の検証で分かったこと）**

- 初回は VS Code（約 360MB）をダウンロードする。展開後の `.vscode-test/` は約 1GB になる。
- VS Code は設定フォルダ（user-data-dir）の中にソケットを作る。パスが長すぎる（約 107 文字を超える）と `listen EINVAL` で起動しない。リポジトリを深い場所に置く場合は、短い `--user-data-dir` を指定する。

**コミット**：(1) 雛形とビルド設定　(2) テスト基盤と検査スクリプト

## M1 分類・除外・並び順のロジック

**目的**：SPEC の規則（BL-1〜BL-4）と ID の作り方を、VS Code なしで確定させる。技術的に最もずれやすいのは除外（BL-2）なので、最初に固める。

**作業**

- `src/core/extKey.ts`：BL-1
- `src/core/exclude.ts`：`files.exclude` の値（object）から `(relPath, name, siblingNames) => boolean` を作る。BL-2
- `src/core/buildChildren.ts`：入力は `{ name, isDirectory }[]` と除外判定。出力は、並べ替えたフォルダ名の一覧と、グループの一覧（キー、並べ替えたファイル名、initiallyExpanded）。BL-3、BL-4
- `src/core/ids.ts`：SPEC「データスキーマ」の ID 規則（URI は文字列で受け取る）
- 単体テスト（`src/test/unit/`）

**完了判定**：`npm run test:unit` と `npm run check:rules` が成功する。単体テストには少なくとも次を含める。

- BL-1 の表のすべての行
- BL-2 の照合例のすべての行。あわせて、`false` を無視すること、`!` で始まるキーを無視すること、when 条件（同じディレクトリに相手があれば除外し、なければ表示する）
- BL-3 の確認済みの例のすべての行。拡張子なしのグループが最後に来ること
- BL-4：グループが1つなら展開、2つ以上なら畳む。サブフォルダがあってもグループが1つなら展開
- ID：同じ入力からは同じ ID ができる。件数が変わっても ID は変わらない。拡張子なしのグループと `.x` のグループで ID が異なる
- SPEC「期待するツリー」の各フォルダの項目を入力にした結果が、期待どおりになる

**コミット**：(1) extKey　(2) exclude　(3) buildChildren と ids。どのコミットにもテストを含める。

## M2 ツリーの表示とファイルを開く

**目的**：利用者が実際に使える最小の形を作る。

**作業**

- `src/tree/nodes.ts`、`src/tree/directoryReader.ts`、`src/tree/provider.ts`、`src/openFile.ts` を作り、`src/extension.ts` でつなぐ
- `createTreeView` で `showCollapseAll: true` を指定する
- package.json の contributes に、`views.explorer`（SPEC「画面設計」）と `viewsWelcome` を加える
- 出力チャネルを作る（BL-7）
- 文言は `vscode.l10n.t()` と `package.nls.json` を通し、この段階では英語だけにする（日本語は M4）
- `scripts/prepare-fixture.mjs` で、SPEC「テスト用ワークスペース」を作る。PNG は base64 の文字列から書き出す
- `scripts/screenshot.mjs`（npm script `screenshot`）：Playwright の `_electron` で、この拡張機能を読み込んだ VS Code（`--extensionDevelopmentPath`）を起動し、画面を撮影する。開くファイルと、フォルダを開かずに起動するかどうかを引数で受け取る
- 統合テストを3つのファイルに分ける。実行順に依存するので、ファイル名に番号を付ける
  - `1-display.test.ts`：AC-1〜AC-6 と、存在しないファイルを開くとき（BL-6）
  - `2-provider.test.ts`：AC-9 と AC-10（読み込み処理を差し替えた provider を使う）
  - `3-refresh.test.ts`：M3 で追加する（一時ワークスペースを書き換えるので最後に実行する）

**完了判定**

1. `npm run test:integration` が成功し、次を確かめている。
   - AC-1：`fileGrouper.view.focus` が成功する
   - AC-2〜AC-4：ルートから getChildren と getTreeItem をたどり、種類・ラベル・説明・collapsibleState・順序が「期待するツリー」と一致する。テストは英語表示で動くので、拡張子なしのラベルは `(no extension)` になる
   - AC-5：`README.md` の行の command を実行すると、アクティブなタブが `TabInputText` で uri が一致する。`docs/logo.png` では、タブ名が `logo.png` で、`TabInputText` ではない
   - AC-6：`1-display.test.ts` の前後で、一時ワークスペースのスナップショット（パス、サイズ、更新日時、SHA-1）が一致する
   - AC-9：例外を投げる directoryReader を渡した provider が、エラー行を1つだけ返す
   - AC-10：10,000 件（5種類 × 2,000 件）を返す directoryReader を渡し、getChildren が1秒以内に終わる
   - BL-6：存在しない uri で openFile を実行しても例外にならず、エディターも開かない
2. `npm run check:rules` が成功する。
3. 手動チェックのうち「Claude Code（撮影）」の項目を撮影して確かめ、その画面を利用者に送る。

**完了後**：利用者が自分のプロジェクトで、標準エクスプローラーと除外の結果を見比べる（U2）。これは M2 の完了条件には含めない。

**コミット**：(1) provider と表示　(2) ファイルを開く処理　(3) テスト用ワークスペースと統合テスト

## M3 表示の更新

**目的**：別のツリーでも表示が古くならないようにする（SPEC K-2、BL-5）。

**作業**

- `fileGrouper.refresh` コマンドと、タイトルバーのボタン（`contributes.commands`、`menus.view/title`）
- `src/refresh.ts`：ファイル監視と 300ms の待ち合わせ。`files.exclude` の変更とワークスペースフォルダの変更も扱う
- `3-refresh.test.ts`

**完了判定**

1. `npm run test:integration` が成功し、次を確かめている。
   - `src/new.py` を作ると、3秒以内に `onDidChangeTreeData` が発火し、`src` の `.py` グループが3件になる。消すと2件に戻る
   - 100 個のファイルを続けて作っても、描き直しは3回以内に収まる
   - `fileGrouper.refresh` を実行すると `onDidChangeTreeData` が発火する
   - ワークスペース設定の `files.exclude` に `"**/*.md": true` を加えると、`.md` のグループが消える（テストの最後に元に戻す）
   - ワークスペースフォルダの追加は自動テストにしない。単一フォルダの状態から追加すると、拡張機能ホストが再起動するため。手動チェック 7 で確かめる
2. `npm run check:rules` が成功する。
3. ファイルを作ったあとの画面を撮影し、反映されていることを確かめる。手動チェックの 6 の開閉状態と 7 は、M4 で利用者が確かめる。

**コミット**：(1) 更新コマンドとボタン　(2) ファイル監視と待ち合わせ　(3) 設定とワークスペースの変更

## M4 日本語化、パッケージ、試用

**作業**

- `package.nls.ja.json` と `l10n/bundle.l10n.ja.json`（SPEC「文言」）
- README.md：機能、既知の制限（SPEC「受容したトレードオフ」の要約）、インストール方法。CHANGELOG.md
- `npm run package` で VSIX を作る

**完了判定**

1. `npm run package` が成功する。`npx vsce ls` の一覧に、`src/`、テスト、`.test-workspace/` が含まれない。
2. これまでの全テストと `npm run check:rules` が成功する。
3. 利用者が VSIX をチャットで受け取るか、手元で `npm ci && npm run package` を実行して作る。`code --install-extension vscode-file-grouper-0.1.0.vsix` でインストールし、手動チェックの 1〜10 がすべて通る。リモート環境を使う場合は、そこでも 1〜6 を確かめる（U5）。

**完了後**：利用者が数日使って U1 を判定する。二次実装には、U1 で効果が確かめられるまで着手しない。

**コミット**：(1) 日本語化　(2) README・CHANGELOG・パッケージ設定

## 手動チェック

M2〜M3 では、「Claude Code（撮影）」の項目を Claude Code が撮影して確かめる。M4 では、利用者が自分の VS Code ですべての項目を確かめる。

| # | 確かめること | 対応 | M2〜M3 で確かめる人 |
|---|---|---|---|
| 1 | エクスプローラーに「File Grouper」のセクションがある | AC-1 | Claude Code（撮影） |
| 2 | テスト用ワークスペースで、表示が「期待するツリー」と同じになる | AC-2〜4 | Claude Code（撮影） |
| 3 | グループを1つ開閉しても、ほかのグループは変わらない | AC-4 | 利用者（M4） |
| 4 | `README.md` がテキストエディターで、`logo.png` が画像プレビューで開く | AC-5 | Claude Code（撮影） |
| 5 | フォルダとファイルにはアイコンテーマのアイコンが付き、グループには別のアイコンが付く | SPEC 画面設計 | Claude Code（撮影） |
| 6 | ターミナルでファイルを作ったり消したりすると3秒以内に反映され、開いていたグループは開いたまま残る | AC-7 | 反映は Claude Code（撮影）、開閉状態は利用者（M4） |
| 7 | 更新ボタンと「すべて折りたたむ」が動く。ワークスペースにフォルダを追加すると、ルートが増える | AC-7 | 利用者（M4） |
| 8 | フォルダを閉じると、案内と「フォルダーを開く」ボタンが出る | AC-8 | Claude Code（撮影） |
| 9 | VS Code の表示言語を日本語にすると、文言が日本語になる | SPEC 文言 | 利用者（M4） |
| 10 | 自分のプロジェクトで標準エクスプローラーと見比べ、非表示になるファイルに差がない（差があれば記録する） | U2 | 利用者（M2 の後） |

## 二次実装の候補（U1 で効果が確かめられた場合に限る）

- 展開状態の保存（`workspaceState`）
- 拡張子ごとの表示・非表示（すべてのフォルダに共通）
- 右クリックメニュー（標準エクスプローラーで表示、パスのコピー）、アクティブなエディターとの同期
- 変更のあった箇所だけの更新
