# ADR 000: CLI-Daemon アーキテクチャ

## ステータス

採用

## 日付

2026-02-15

## コンテキスト

bunterm はブラウザからアクセス可能なターミナルを提供する CLI ツールである。ユーザーが `bunterm up` を実行するだけで、バックグラウンドでサーバーが起動し、ブラウザからターミナルにアクセスできる必要がある。

### 要件

1. **バックグラウンド動作**: ターミナルサーバーは CLI コマンド実行後もバックグラウンドで稼働し続ける
2. **複数セッション管理**: 複数のターミナルセッションを同時に管理する
3. **自動起動**: ユーザーが明示的にサーバーを起動しなくても、コマンド実行時に自動で起動する
4. **状態の永続化**: 実行中セッションの PID、ポート、パスなどの状態を管理する
5. **クライアント操作**: CLI からセッションの作成・終了・一覧表示を行える

### tmux モデルの参考

tmux は同様の課題を解決している：

```
# tmux の動作モデル
tmux new -s dev      # サーバーが未起動なら自動起動 + セッション作成
tmux ls              # サーバーに接続してセッション一覧取得
tmux attach -t dev   # サーバーに接続してセッションにアタッチ
```

この「サーバーが必要なときに自動起動する」モデルはユーザー体験として優れている。

## 決定

**クライアント-デーモンアーキテクチャ**を採用する。CLI プロセスとデーモンプロセスを分離し、tmux と同様の自動起動モデルを実装する。

### アーキテクチャ

```
CLI (bunterm up/ls/kill)     Daemon (background)
┌─────────────────────┐     ┌──────────────────────────────┐
│ Commander.js CLI     │     │ Bun.serve (HTTP + WebSocket) │
│                      │────►│ SessionManager               │
│ ensureDaemon()       │     │ PortalPage                   │
│ ApiClient            │     │ State persistence            │
└─────────────────────┘     └──────────────────────────────┘
        │                            │
        │  Unix socket (生存確認)     │
        │  HTTP API (操作)           │
        └────────────────────────────┘
```

### 通信方式

| 目的 | 方式 | 詳細 |
|------|------|------|
| デーモン生存確認 | Unix socket | `~/.local/state/bunterm/bunterm.sock` に接続試行 |
| セッション操作 | HTTP API | `GET/POST/DELETE /api/sessions/*` |
| ターミナルデータ | WebSocket | ブラウザ ↔ デーモン間のリアルタイム通信 |

### デーモン自動起動

```typescript
// core/client/index.ts
export async function ensureDaemon(): Promise<void> {
  if (await isDaemonRunning()) {
    return; // 既に起動中
  }
  // バックグラウンドでデーモンを起動
  const proc = Bun.spawn(['bun', 'run', daemonScript], {
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  proc.unref(); // CLI プロセス終了後もデーモンを維持
  // デーモンの起動完了を待機
  await waitForDaemon();
}
```

### 状態管理

- **設定**: `~/.config/bunterm/config.yaml` — ユーザー定義設定（ポート、セッション定義等）
- **状態**: `~/.local/state/bunterm/state.json` — 実行時状態（セッション一覧、PID 等）

XDG Base Directory 仕様に準拠し、設定と状態を分離する。

## 代替案

### 1. シングルプロセス（CLI がそのまま HTTP サーバーに）

```bash
bunterm up  # フォアグラウンドでサーバー起動（Ctrl+C で終了）
```

**採用しなかった理由**:
- CLI がフォアグラウンドを占有し、他の作業ができない
- CLI を閉じるとサーバーも終了する
- 複数ターミナルからの操作が困難

### 2. systemd / launchd サービス

```bash
systemctl --user start bunterm  # システムサービスとして起動
```

**採用しなかった理由**:
- OS 固有のサービス管理が必要（Linux: systemd、macOS: launchd）
- ユーザーにサービス登録作業を要求する
- 「コマンド一発で起動」のシンプルさが失われる
- 開発者ツールとしては過剰な仕組み

### 3. 組み込みサーバー（CLI コマンドごとにサーバー起動）

```bash
bunterm up    # 内蔵サーバーをフォアグラウンドで起動
bunterm up &  # ユーザーが手動でバックグラウンド化
```

**採用しなかった理由**:
- バックグラウンド管理がユーザー任せになる
- `&` でバックグラウンド化しても、ターミナルを閉じると終了する場合がある
- PID 管理、ログ管理が煩雑

## 影響

### Positive

- **ゼロコンフィグ起動**: `bunterm up` だけで全自動起動
- **永続的なセッション**: CLI を閉じてもセッションは継続
- **複数クライアント対応**: 同じデーモンに複数の CLI / ブラウザから接続可能
- **tmux ライクな UX**: 開発者に馴染みのあるモデル

### Negative

- **プロセス管理の複雑さ**: デーモンの起動・停止・クラッシュ回復の実装が必要
- **通信オーバーヘッド**: CLI ↔ デーモン間の HTTP 通信が発生
- **デバッグの難しさ**: 2 プロセス間の問題追跡が単一プロセスより困難
- **状態ファイル管理**: state.json の整合性維持が必要

## 関連

- ADR 009: Dependency Injection for Testability — デーモン通信の DI 抽象化
- ADR 018: Doctor Command — デーモン状態の診断機能
- ADR 023: Session Lifecycle Management — セッションのライフサイクル管理
