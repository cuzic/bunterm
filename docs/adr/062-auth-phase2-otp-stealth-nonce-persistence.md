# ADR 062: 認証 Phase 2 — OTP・Stealth Mode・NonceStore 永続化・接続管理

## ステータス

採用

## コンテキスト

ADR 061 で Phase 1（ワンタイムトークン + Cookie）を実装したが、以下の課題が残っていた：

1. **OTP フォールバック不在**: CLI が手元にない状況（スマホからの接続等）でトークン付き URL を取得できない
2. **Stealth Mode なし**: `auth_enabled` 時もログインページが表示され、bunterm の存在が推測される
3. **NonceStore がインメモリ**: デーモン再起動時に使用済みトークンが消失し、理論上リプレイ攻撃が可能
4. **接続管理 CLI なし**: アクティブなセッションの確認・失効ができない

## 決定

### OTP マネージャー (`auth/otp-manager.ts`)

CLI から `bunterm otp` で 6 桁ワンタイムパスワードを生成し、ブラウザの OTP 入力ページで認証する。

- `randomInt(0, 999999)` で 6 桁コード生成（ゼロパディング）
- TTL: デフォルト 120 秒（設定可能 30〜300 秒）
- ブルートフォース対策: OTP ごとに最大試行回数制限（デフォルト 5 回）
- 検証後は即座に `consumed = true` でワンタイム消費

### Stealth Mode (`auth_stealth_mode`)

`security.auth_stealth_mode: true` 設定時、未認証リクエストに対し 404 を返却。ログインページを表示せず、サービスの存在を隠蔽する。

### NonceStore 永続化 (`ws/file-nonce-store.ts`)

インメモリ NonceStore に加え、ファイルベースの永続化層を追加。

- JSON Lines 形式で `~/.local/state/bunterm/nonces.json` に保存
- ファイルパーミッション 0600
- 定期フラッシュ（デフォルト 5 秒間隔）
- 起動時にファイルから既存ノンスをロード
- 期限切れノンスは自動パージ

### 接続管理 CLI

```
bunterm connections list     # アクティブセッション一覧
bunterm connections revoke <id>  # セッション失効
```

- `auth-session-routes.ts` で HTTP API を提供
- Cookie セッションストアの一覧・削除機能

## 代替案

### TOTP（Google Authenticator 等）

標準的な TOTP アプリ連携。

**採用しなかった理由**:
- シークレット共有の初回設定が煩雑（QR コード + 手動入力のセットアップ）
- ターミナルツールに認証アプリ連携は過剰
- CLI 発行の使い捨て OTP で十分なセキュリティが得られる

### NonceStore を Redis/SQLite に永続化

永続ストアにデータベースを使用。

**採用しなかった理由**:
- 外部依存が増える
- ノンスは短命（TTL 30-300 秒）で JSON ファイルで十分
- ゼロ依存の方針と一致

## 影響

### Positive

- スマホ等 CLI 非利用環境でも安全に認証可能
- デーモン再起動後もトークンリプレイが防止される
- `bunterm connections` で不審なセッションを管理可能
- Stealth Mode で攻撃面を縮小

### Negative

- OTP ページの HTML/CSS が追加（`otp-page.ts`）
- ファイル I/O によるわずかなオーバーヘッド（5 秒間隔バッチ書き込みで緩和）

## 関連

- ADR 061: CLI 発行ワンタイムトークン + Cookie 認証（Phase 1）
- ADR 063: 認証 Phase 3 — Reverse Proxy Auth + Adaptive Shield
