# ADR 064: Agent Teams 専用ビュー — タイムライン・ステータス・ファイル競合検知

## ステータス

採用

## コンテキスト

bunterm で複数の Claude Code エージェントを並列実行する場合、各エージェントの状態を確認するには個別のターミナルセッションを切り替える必要があった。

### 問題点

1. **全体俯瞰ができない**: 5-10 エージェント並列時に進捗を一覧できない
2. **エラー見落とし**: バックグラウンドのエージェントでエラーが発生しても気づかない
3. **ファイル競合**: 複数エージェントが同一ファイルを編集して競合する可能性がある
4. **スマホでの監視**: tmux 分割画面はスマホの小画面で非実用的

## 決定

### Agent Timeline ページ (`/bunterm/agents`)

専用の HTML ページでエージェントのアクティビティを時系列表示する。

#### アーキテクチャ

```
features/agent-timeline/
├── server/
│   ├── types.ts                    # AgentTimelineEvent 型定義
│   ├── timeline-service.ts         # SSE ストリーム管理・イベント変換
│   ├── agent-status.ts             # セッションから状態を集約
│   └── file-conflict-detector.ts   # ファイル競合検知
└── client/
    ├── timeline-page.ts            # HTML テンプレート生成
    ├── timeline.js                 # クライアント JavaScript
    └── timeline.css                # スタイル
```

#### Agent Status API (`GET /api/agents/status`)

全セッションの ClaudeWatcher 状態を集約して返却。各セッションの `claudeWatcherStatus` プロパティから最終メッセージ種別・タイムスタンプ・使用中ツール名を取得。

#### Timeline SSE Stream (`GET /api/agents/timeline`)

Server-Sent Events でリアルタイムにエージェントイベントを配信。

- `AgentTimelineService` が ClaudeWatcher メッセージを `AgentTimelineEvent` に変換
- イベント種別: `toolUse`, `toolResult`, `thinking`, `text`, `error`, `sessionStart`, `sessionEnd`
- 複数クライアント同時接続対応

#### File Conflict Detection (`GET /api/agents/conflicts`)

`FileConflictDetector` がエージェントのファイル編集を追跡し、同一ファイルへの並列編集を検知。

- Edit / Write ツール使用時にファイルパスとエージェント名を記録
- 設定可能なウィンドウ（デフォルト 5 分）内の競合を検知
- 競合発生時はプッシュ通知で警告（`notifications` feature 連携）

#### エラー通知連携

`AgentTimelineService` がエラーイベント検出時にプッシュ通知を送信。ブラウザを見ていない間もエージェントエラーを把握可能。

### Portal ページへの統合

ポータルページのセッション一覧にエージェントバッジ（`agent-badge`）を追加。各セッションの Claude エージェント状態をリアルタイム表示。

## 代替案

### tmux 分割画面の改良

既存の tmux 分割で各セッションを表示。

**採用しなかった理由**:
- スマホの小画面では非実用的（ADR 作成の直接的動機）
- 10 セッション以上の俯瞰には不向き
- イベントフィルタリングやエラーハイライトができない

### WebSocket でのイベント配信

SSE の代わりに WebSocket を使用。

**採用しなかった理由**:
- タイムラインは読み取り専用（サーバー→クライアント一方向）
- SSE の方がシンプルで自動再接続が組み込み
- 既存の Block SSE ストリーム（ADR 043）と同パターンで統一

### 外部ダッシュボード（Grafana 等）

メトリクスを Prometheus 形式で公開し、外部で可視化。

**採用しなかった理由**:
- 外部依存が増える
- 「bunterm up ですぐ使える」の方針に反する
- イベントベースのタイムラインには不向き

## 影響

### Positive

- 複数エージェントの状態をスマホでも一覧可能
- エラーの即座な検知・通知
- ファイル競合の事前検知で手戻りを防止
- ポータルページでセッション状態がひと目で分かる

### Negative

- `server.ts` に `AgentTimelineService` と通知関連の初期化が追加
- `core/server/server.ts` → `features/agent-timeline/` の依存（composition root として許容）
- SSE 接続の常時維持によるわずかなリソース消費

## 関連

- ADR 043: SSE Streaming Resumption
- ADR 048: Claude Session Watcher
- ADR 058: Plugin Architecture Migration
- ADR 059: Session Plugin 依存逆転
