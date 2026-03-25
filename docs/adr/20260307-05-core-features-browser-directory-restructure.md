# ADR 074: Core/Features/Browser ディレクトリ再構成

## ステータス

採用

## コンテキスト

bunterm の `src/` ディレクトリはフラットな構造で、モジュール数の増加に伴い見通しが悪化していた。

### 問題点

1. **責務の混在**: サーバー側コード、ブラウザ側コード、機能モジュールが同一階層に並存
2. **依存方向の不明確さ**: どのモジュールがコアで、どれが機能拡張なのかがディレクトリ構造から読み取れない
3. **新規参入の困難さ**: ディレクトリを見ただけではアーキテクチャを把握できない

## 決定

### 3 層ディレクトリ構造への再構成

`src/` を以下の 3 つの最上位ディレクトリに分類する。

```
src/
├── core/       # フレームワーク非依存のコア基盤
├── features/   # ドメイン固有の機能モジュール
└── browser/    # ブラウザ側クライアントコード
```

#### core/ — コア基盤

フレームワークに依存しない、bunterm の根幹を成すモジュール。

- `core/cli/` — CLI コマンド定義
- `core/config/` — 設定ファイル読み込み・型定義
- `core/client/` — CLI→デーモン通信
- `core/daemon/` — デーモン起動ロジック
- `core/protocol/` — WebSocket メッセージ型
- `core/server/` — HTTP/WebSocket サーバー基盤
- `core/terminal/` — PTY セッション管理

#### features/ — 機能モジュール

独立した機能ドメインごとにディレクトリを分割。各 feature は `server/` と `client/` のサブディレクトリを持つ。

- `features/ai/` — AI 統合
- `features/blocks/` — Block UI（Warp スタイル）
- `features/claude-watcher/` — Claude Code 監視
- `features/file-watcher/` — ファイル監視
- `features/file-transfer/` — ファイル転送
- `features/notifications/` — プッシュ通知
- `features/preview/` — HTML プレビュー
- `features/share/` — 読み取り専用共有

#### browser/ — ブラウザコード

ブラウザ側で実行されるコード。xterm.js、ツールバー UI、共通ユーティリティ。

- `browser/terminal/` — xterm.js 関連
- `browser/toolbar/` — ツールバー UI
- `browser/shared/` — ライフサイクル管理、イベントバス等

### 設計原則

| 層 | 依存方向 | 説明 |
|----|----------|------|
| `core/` | 外部依存なし | 他のどの層にも依存しない |
| `features/` | `core/` に依存可 | feature 間の依存は最小限 |
| `browser/` | `core/protocol` に依存可 | サーバー側コードには依存しない |

## 代替案

### レイヤードアーキテクチャ（domain/application/infrastructure）

**採用しなかった理由**:
- bunterm は CLI ツールであり、エンタープライズアプリケーションほどの層分離は過剰
- `core/features/browser` の方が直感的で、コードベースの実態に合う

### Monorepo（packages/ ディレクトリ）

**採用しなかった理由**:
- パッケージ間の依存管理オーバーヘッド
- Bun のワークスペース機能は使えるが、単一リポジトリ内の分離としては過剰

### フラット構造の維持

**採用しなかった理由**:
- モジュール数が 20 を超え、`src/` 直下の一覧が長大になっていた
- 新規開発者がアーキテクチャを把握するのに時間がかかる

## 影響

### Positive

- **見通しの改善**: ディレクトリ構造がアーキテクチャを反映
- **依存方向の明示**: `core/` → `features/` → `browser/` の方向性が明確
- **新規機能の追加が容易**: `features/` に新ディレクトリを作成するだけ
- **ビルド最適化の可能性**: 層ごとに異なるビルド設定を適用可能

### Negative

- **大規模リファクタリング**: 多数のファイル移動とインポートパスの更新が必要
- **Git 履歴の断絶**: ファイル移動により `git log` でのファイル追跡が困難になる場合がある

## 関連

- ADR 058: Plugin Architecture Migration
- ADR 071: パスエイリアス @/ 規約
