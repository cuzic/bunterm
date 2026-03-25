# ADR 037: Sentry Integration

## Status

Accepted

## Context

本番環境でのエラー監視と例外追跡が必要となった。以下の要件があった:

1. **エラー監視**: 未処理例外やエラーを自動的に捕捉
2. **コンテキスト情報**: セッション名、リクエスト情報などを付加
3. **パフォーマンス監視**: トランザクショントレースでボトルネック特定
4. **オプショナル**: 無効時のオーバーヘッドをゼロにする

## Decision

**Sentry を動的インポートで統合**するアーキテクチャを採用する。

### 設定オプション

```yaml
sentry:
  enabled: true                    # 有効化フラグ
  dsn: "https://xxx@sentry.io/xxx" # Sentry DSN
  environment: "production"        # 環境識別子
  sample_rate: 1.0                 # エラーサンプルレート (0.0-1.0)
  traces_sample_rate: 0.1          # トレースサンプルレート
  release: "1.0.0"                 # リリースバージョン (省略時は自動)
  debug: false                     # デバッグモード
```

### サーバー側実装

```typescript
// 動的インポートで依存を遅延読み込み
export async function initSentry(config: SentryConfig): Promise<void> {
  if (!config.enabled || !config.dsn) {
    return;
  }
  const Sentry = await import('@sentry/bun');
  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    // ...
  });
}
```

### クライアント側実装

```html
<!-- config.sentry.enabled の場合のみ注入 -->
<script
  src="https://js.sentry-cdn.com/xxx.min.js"
  crossorigin="anonymous"
></script>
```

### CSP (Content Security Policy) 対応

Sentry 有効時に CSP を拡張:

```typescript
const sentryScriptSrc = sentryEnabled ? ' https://js.sentry-cdn.com' : '';
const sentryConnectSrc = sentryEnabled ? ' https://*.ingest.sentry.io' : '';

res.setHeader('Content-Security-Policy',
  `script-src 'self' 'unsafe-inline'${sentryScriptSrc}; ` +
  `connect-src 'self' ws: wss:${sentryConnectSrc}`
);
```

## Consequences

### Positive

- **本番監視**: エラーをリアルタイムで検知・通知
- **ゼロオーバーヘッド**: 無効時は動的インポートで依存なし
- **コンテキスト豊富**: セッション情報やスタックトレースを自動収集
- **段階的導入**: サンプルレートで負荷を調整可能

### Negative

- **外部依存**: Sentry サービスへの依存
- **CSP 複雑化**: 有効時に追加の許可ドメインが必要
- **バンドルサイズ**: クライアント側 SDK の読み込み (CDN 経由で軽減)

### 技術的考慮事項

1. **PII 保護**: ユーザー情報は送信しない設定をデフォルト化
2. **レート制限**: `sample_rate` でコスト管理
3. **ローカル開発**: `environment: development` でフィルタリング

## Implementation Details

### ファイル構成

```
src/utils/
└── sentry.ts       # サーバー側 Sentry ラッパー

src/config/
└── types.ts        # SentryConfig 型定義

src/daemon/
└── router.ts       # CSP ヘッダー (setSecurityHeaders)

src/daemon/terminal-ui/
└── index.ts        # クライアント側 SDK 注入
```

### API

| 関数 | 説明 |
|------|------|
| `initSentry(config)` | Sentry 初期化 (デーモン起動時) |
| `captureException(error, context)` | 例外キャプチャ |
| `captureMessage(message, level)` | メッセージキャプチャ |
| `isSentryEnabled()` | 有効状態確認 |

## Notes

- Bun ランタイム用に `@sentry/bun` を使用
- リリースバージョンは `version.ts` から自動取得可能
- 将来的にパフォーマンストレースを拡張予定
