# ADR 058: Plugin Architecture Migration

## ステータス

採用

## コンテキスト

bunterm のコードベースが成長し、以下の構造的問題が発生していた：

### Before（旧構造）

```
src/
├── commands/           # CLI コマンド
├── client/             # デーモンクライアント
├── config/             # 設定
├── daemon/             # すべてのサーバーサイドコード
│   ├── native-terminal/  # ターミナル、AI、Block、Claude Watcher...
│   ├── terminal-ui/      # ツールバー、すべてのブラウザコード
│   ├── notification/     # 通知
│   ├── file-transfer.ts  # ファイル転送
│   └── ...
└── utils/
```

### 問題点

1. **巨大な daemon/**: 異なる関心事が一箇所に集約
2. **機能の分離困難**: AI、Block UI、通知などが密結合
3. **ブラウザコードの分散**: native-terminal/client/ と terminal-ui/client/ に分散
4. **型の重複**: 同じ型が複数箇所で定義
5. **プラグイン化困難**: 機能の追加・削除が難しい構造

## 決定

以下の 3 層構造に再編成する。

### After（新構造）

```
src/
├── core/                   # コアシステム（必須）
│   ├── cli/commands/       # CLI コマンド
│   ├── client/             # デーモンクライアント
│   ├── config/             # 設定
│   ├── daemon/             # デーモンエントリ
│   ├── protocol/           # 通信プロトコル型
│   ├── server/             # HTTP/WS サーバー基盤
│   └── terminal/           # ターミナルコア
│
├── features/               # 機能モジュール（選択可能）
│   ├── ai/                 # AI 統合
│   ├── blocks/             # Block UI
│   ├── claude-watcher/     # Claude Code 監視
│   ├── file-transfer/      # ファイル転送
│   ├── file-watcher/       # ファイル監視
│   ├── notifications/      # プッシュ通知
│   ├── preview/            # HTML プレビュー
│   └── share/              # 読み取り専用共有
│
├── browser/                # ブラウザコード
│   ├── terminal/           # xterm.js 関連
│   ├── toolbar/            # ツールバー UI
│   └── shared/             # 共通ユーティリティ
│
└── utils/                  # 共通ユーティリティ
```

### 各層の責務

#### core/

bunterm の基本動作に必須のコード。

| ディレクトリ | 責務 |
|-------------|------|
| `cli/` | CLI コマンド定義 |
| `client/` | CLI→デーモン通信 |
| `config/` | 設定読み込み、状態管理 |
| `daemon/` | デーモンプロセスエントリ |
| `protocol/` | WS メッセージ型、Block 型、AI 型 |
| `server/` | HTTP/WS サーバー、セッション管理 |
| `terminal/` | PTY セッション、OSC 633 パーサー |

#### features/

独立した機能モジュール。将来的にはアラカルト選択可能。

| Feature | 説明 | server/ | client/ |
|---------|------|---------|---------|
| `ai/` | LLM ランナー、AI チャット API | ○ | × |
| `blocks/` | Warp スタイル Block UI | ○ | × |
| `claude-watcher/` | Claude Code セッション監視 | ○ | × |
| `file-transfer/` | ファイルアップロード/ダウンロード | ○ | ○ |
| `file-watcher/` | ファイル変更監視 | ○ | ○ |
| `notifications/` | Web Push 通知 | ○ | ○ |
| `preview/` | HTML/Markdown プレビュー | × | ○ |
| `share/` | 読み取り専用共有リンク | ○ | × |

#### browser/

ブラウザで実行されるコード。

| ディレクトリ | 責務 |
|-------------|------|
| `terminal/` | xterm.js、BlockManager、React AI チャット |
| `toolbar/` | ツールバー、各種マネージャー |
| `shared/` | lifecycle.ts、events.ts、key-router.ts |

### インポートパス

パスエイリアスで整理されたインポート。

```typescript
// Core
import { loadConfig } from '@/core/config/config.js';
import { Block } from '@/core/protocol/blocks.js';

// Features
import { AIService } from '@/features/ai/server/ai-service.js';
import { FileTransferManager } from '@/features/file-transfer/client/FileTransferManager.js';

// Browser
import { Scope, on } from '@/browser/shared/lifecycle.js';
import { toolbarEvents } from '@/browser/shared/events.js';
```

## 代替案

### モノレポ（Nx、Turborepo）

パッケージを分割してモノレポで管理。

**採用しなかった理由**:
- オーバーヘッドが大きい
- 単一バイナリ配布が複雑になる
- 現時点ではディレクトリ構造で十分

### ランタイムプラグイン

動的に機能をロード・アンロード。

**採用しなかった理由**:
- 複雑性が大幅に増加
- ビルド時の Tree Shaking で十分
- 将来的な拡張として検討

## 影響

### Positive

- **関心の分離**: 各機能が独立したディレクトリに
- **可読性向上**: ファイルの所在が明確
- **プラグイン化の基盤**: 将来的な機能選択の準備
- **テスタビリティ**: 機能ごとの独立したテスト

### Negative

- **移行コスト**: 100+ ファイルの移動とインポート更新
- **インポートパス変更**: 既存コードの大規模更新

### Migration

1. 新ディレクトリ構造を作成
2. ファイルを移動（git mv）
3. インポートパスを更新
4. テスト・型チェック・リントを確認
5. 旧ディレクトリを削除

## 関連

- ADR 033: Toolbar Client Refactoring
- ADR 057: Scope/Mountable Pattern
- docs/browser-api.md

## 関連コミット

- `300fb2c refactor(core): extract protocol types to core/protocol`
- `e992977 refactor(core): extract terminal core to core/terminal`
- `0bd6e5f refactor(core): extract server infrastructure to core/server`
- `46462ea refactor(core): move CLI commands to core/cli`
- `fc7ed56 refactor(core): create core/daemon entry point`
- `ff27f5b refactor(features): extract AI integration to features/ai`
- `a23a3e1 refactor(features): extract Block UI to features/blocks`
- `b9b12f9 refactor(features): extract Claude watcher to features/claude-watcher`
- `377fb4f refactor(features): extract file transfer server to features/file-transfer/server`
- `2c5063b refactor(features): extract file watcher server to features/file-watcher/server`
- `77159eb refactor(features): extract notifications server to features/notifications/server`
- `70035a3 refactor(features): extract share manager to features/share`
- `81e55a2 refactor(browser): consolidate browser code and update imports`
- `4093934 refactor(cli): remove old commands/ directory`
- `35efd70 refactor: remove old daemon/ directory`
