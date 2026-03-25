# ADR 069: コンテキストアウェアなモバイルミニバー

## ステータス

採用

## コンテキスト

ペルソナ調査（5名）で「モバイルで Ctrl+C が打てない」「スニペット機能を知らなかった」等のフィードバックがあった。

調査の結果、これらの機能は **既に実装済み** だった:
- Ctrl/Alt/Shift トグル（ModifierKeyState）
- コマンドスニペット（SnippetManager + localStorage）
- セッション切り替え（SessionSwitcher）
- フォントサイズ調整（FontSizeManager + ピンチズーム）

問題は機能の不在ではなく、**ディスカバラビリティ（発見しやすさ）** だった。モバイルではツールバーを最小化（State 2）して画面を広く使うのが自然だが、その状態では全ボタンが非表示になる。

## 決定

### コンテキストアウェアなミニバー

ツールバー非表示（State 2）かつモバイル時に、右下にフローティングのミニバーを表示する。ターミナルの実行状態に応じて、**その瞬間に最も必要なボタンだけ**を切り替える。

| ターミナル状態 | 検知方法 | ミニバー表示 |
|--------------|---------|-------------|
| アイドル | blockEnd メッセージ | [↑][Tab][📝][≡] |
| コマンド実行中 | blockStart メッセージ | [🔴Ctrl+C][🔍][≡] |
| Claude Code 作業中 | claudeToolUse メッセージ | [🔵Claude][🔍][≡] |
| テキスト選択中 | selection:change イベント | [📋Copy][≡] |

- `[≡]` タップで State 0（フルツールバー）に遷移 — 全機能に1タップでアクセス可能
- PC では常に非表示（`isMobileDevice()` で判定）

### 状態検知の仕組み

`TerminalStateTracker` が WebSocket メッセージを toolbarEvents 経由で監視:
- `block:start` / `block:end` — OSC 633 シェル統合によるコマンド実行検知
- `claude:toolUse` / `claude:sessionEnd` — claude-watcher によるセッション監視
- `selection:change` — テキスト選択状態

### ボタン分類

調査に基づき、全ボタンを4カテゴリに分類:
- **A. 入力中**: Ctrl/Alt/Shift, Tab, BS, ↑↓, Send/Enter, Snippet, Paste
- **B. ビジー中**: Ctrl+C（ダイレクト）, Search, Copy All, Notify
- **C. いつでも**: Esc, Zoom, Session, Toggle
- **D. 低頻度**: Share, Download, Upload, Preview, Quote

ミニバーには各状態の最頻出ボタン（3-4個）のみ表示。

### 削除したボタン

- **Reinit** — ツールバートグル（Ctrl+J）で代替
- **Reload** — 同上

## 代替案

- **常時表示の固定ボタンバー** — 画面を常に圧迫する
- **フローティングボタン（ドラッグ移動可能）** — ターミナル出力に被る
- **スワイプジェスチャー** — 既存のピンチズーム・スクロールと競合
- **新機能の追加** — 問題は「機能がない」ではなく「見つけにくい」だった

## 影響

### Positive

- 最頻出操作（Ctrl+C、↑、Tab）が常に1タップでアクセス可能
- ビジー時に Ctrl+C が赤く目立つ = 自然なオンボーディング
- Claude Code 作業中にタップで /agents/ に遷移可能
- 既存機能の導線改善であり、新機能追加ではない

### Negative

- 右下のフローティング要素がターミナル出力の一部を隠す（最小限のサイズで緩和）

## 関連

- ADR 015: Toolbar module architecture
- ADR 051: Dynamic toolbar height
- ADR 057: Scope/Mountable pattern
