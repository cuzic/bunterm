# ADR 055: Project Rename (ttyd-mux → bunterm)

## ステータス

採用

## コンテキスト

プロジェクトは当初 `ttyd-mux` という名前で開発されていた。この名前は ttyd (Terminal Web) と tmux の組み合わせを示していたが、以下の問題があった：

1. **依存関係の誤解**: 実際には ttyd も tmux も必須ではない（Bun.Terminal を使用）
2. **発音しにくい**: "ttyd-mux" は説明しづらく覚えにくい
3. **目的が不明確**: 名前からプロジェクトの目的が伝わらない
4. **ブランディング**: 独自のアイデンティティが確立しにくい

## 決定

プロジェクト名を `ttyd-mux` から `bunterm` に変更する。

### 命名理由

- **Bun**: ランタイムとして Bun を使用
- **term**: ターミナル（Terminal）の略
- **発音しやすい**: "バンターム" と自然に読める
- **短い**: 4 音節で入力しやすい

### 変更範囲

| 対象 | Before | After |
|------|--------|-------|
| パッケージ名 | ttyd-mux | bunterm |
| CLI コマンド | ttyd-mux | bunterm |
| 設定ディレクトリ | ~/.config/ttyd-mux/ | ~/.config/bunterm/ |
| 状態ディレクトリ | ~/.local/state/ttyd-mux/ | ~/.local/state/bunterm/ |
| ソケットパス | ttyd-mux.sock | bunterm.sock |
| URL ベースパス | /ttyd-mux | /bunterm |
| 内部識別子 | ttyd-mux, ttydMux | bunterm |

## 代替案

### 1. webtty

Web + TTY の組み合わせ。

**採用しなかった理由**:
- 既存プロジェクト（gotty, wetty）と混同しやすい
- Bun の使用が伝わらない

### 2. bunty / bunpty

Bun + TTY/PTY の組み合わせ。

**採用しなかった理由**:
- "bunty" は人名と混同しやすい
- PTY は一般ユーザーに馴染みがない

### 3. termux

Terminal + Mux の組み合わせ。

**採用しなかった理由**:
- Android アプリの Termux と完全に衝突

## 影響

### Positive

- ブランドアイデンティティの確立
- 覚えやすく発音しやすい名前
- Bun エコシステムとの関連性が明確

### Negative

- 既存ユーザーの設定移行が必要
- ドキュメント・リファレンスの更新が必要

### Migration

設定ディレクトリの移行は自動では行わない（ユーザー責任）。

```bash
# 既存設定の移行（オプション）
mv ~/.config/ttyd-mux ~/.config/bunterm
mv ~/.local/state/ttyd-mux ~/.local/state/bunterm
```

## 関連コミット

- `cd5f4ee chore: rename package to bunterm`
- `dc42f70 refactor(commands): rename ttyd-mux to bunterm`
- `ab57571 refactor(client): rename ttyd-mux to bunterm`
- `543effd refactor(caddy,config): rename ttyd-mux to bunterm`
- `5fec87f refactor(terminal-ui): rename ttyd-mux to bunterm and simplify`
- `b387543 refactor(native-terminal): rename ttyd-mux to bunterm`
- `00d8e15 refactor(daemon): rename ttyd-mux to bunterm`
- `24c5e78 refactor(core): rename ttyd-mux to bunterm`
