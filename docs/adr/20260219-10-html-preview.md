# ADR 035: HTML Preview with Live Reload

## Status

Accepted

## Context

ターミナルセッションで HTML ファイルを編集する際、変更結果を確認するために別ウィンドウでブラウザを開く必要があった。特にモバイルデバイスでは画面切り替えが煩雑で、開発効率が低下していた。

以下の要件が挙がった:

1. **リアルタイムプレビュー**: ファイル保存時に自動でプレビューを更新
2. **分割ビュー**: ターミナルとプレビューを並べて表示
3. **リサイズ可能**: ユーザーの好みに応じてプレビュー幅を調整
4. **モバイル対応**: 縦分割で上下に表示

## Decision

**WebSocket によるファイル監視 + iframe プレビュー**のアーキテクチャを採用する。

### アーキテクチャ

```
┌────────────────────────────────────────────────────────────────────┐
│  Terminal Session                    │  Preview Pane              │
│  ┌────────────────────────────────┐  │  ┌────────────────────────┐│
│  │                                │  │  │ [🔄] [📁] [×]         ││
│  │    ttyd + Toolbar              │  │  ├────────────────────────┤│
│  │                                │◀─┼──│                        ││
│  │                                │  │  │   <iframe>             ││
│  │                                │  │  │   HTML Preview         ││
│  │                                │  │  └────────────────────────┘│
│  └────────────────────────────────┘  │◀─ resizer                  │
└────────────────────────────────────────────────────────────────────┘
         │                                        ▲
         │                                        │
         ▼                                        │
┌─────────────────┐    WebSocket     ┌───────────────────────┐
│  File Browser   │ ──────────────── │  File Watcher Service │
│  (select file)  │  change events   │  (fs.watch)           │
└─────────────────┘                  └───────────────────────┘
```

### サーバー側コンポーネント

| ファイル | 責務 |
|----------|------|
| `preview/types.ts` | 型定義（FileChangeEvent, PreviewClientMessage） |
| `preview/watcher.ts` | fs.watch によるファイル監視、デバウンス処理 |
| `preview/ws-handler.ts` | WebSocket エンドポイント、購読管理 |
| `preview/index.ts` | モジュールエクスポート |

### クライアント側コンポーネント

| ファイル | 責務 |
|----------|------|
| `FileWatcherClient.ts` | WebSocket 接続、自動再接続 |
| `PreviewPane.ts` | iframe 管理、ドラッグリサイズ |
| `PreviewManager.ts` | 統合オーケストレーション |

### WebSocket プロトコル

```typescript
// クライアント → サーバー
{ action: 'watch', session: 'name', path: 'file.html' }
{ action: 'unwatch', session: 'name', path: 'file.html' }

// サーバー → クライアント
{ type: 'change', session: 'name', path: 'file.html', timestamp: 1234567890 }
```

### API エンドポイント

| エンドポイント | 説明 |
|---------------|------|
| `GET /api/preview/file?session=<name>&path=<path>` | HTML ファイル配信 |
| `WS /api/preview/ws` | ファイル変更通知 |

### 設定オプション

```yaml
preview:
  enabled: true              # プレビュー機能の有効化
  default_width: 400         # 初期幅 (px)
  debounce_ms: 300           # 変更検知のデバウンス
  auto_refresh: true         # 自動リロード有効
  allowed_extensions:        # プレビュー対象拡張子
    - .html
    - .htm
```

### セキュリティ対策

1. **パス検証**: 既存の `resolveFilePath` を使用してディレクトリトラバーサル攻撃を防止
2. **拡張子制限**: 設定で許可された拡張子のみプレビュー可能
3. **iframe sandbox**: `allow-scripts allow-same-origin` で最小限の権限
4. **セッション制限**: 自分のセッションディレクトリ内のファイルのみアクセス可能

## Consequences

### Positive

- **開発効率向上**: ファイル保存と同時にプレビュー更新、画面切り替え不要
- **既存コードの再利用**: FileTransferManager のファイルブラウザを流用
- **低レイテンシ**: fs.watch + WebSocket で即座に変更を検知
- **モバイル対応**: レスポンシブデザインで縦分割表示

### Negative

- **リソース消費**: fs.watch がファイルディスクリプタを消費
- **WebSocket 接続増加**: プレビュー中は追加の WebSocket 接続が必要
- **複雑性増加**: 新規モジュール（6ファイル）の追加

### 技術的考慮事項

1. **fs.watch の制限**: 一部のファイルシステム（NFS など）では動作しない可能性
2. **デバウンス**: エディタの自動保存による連続書き込みに対応
3. **メモリ管理**: クライアント切断時に確実に watcher をクリーンアップ

## Implementation Details

### ファイル構成

```
src/daemon/preview/
├── index.ts           # モジュールエクスポート
├── types.ts           # 型定義
├── watcher.ts         # ファイル監視サービス
└── ws-handler.ts      # WebSocket ハンドラ

src/daemon/toolbar/client/
├── FileWatcherClient.ts  # WebSocket クライアント
├── PreviewPane.ts        # iframe + リサイズ
└── PreviewManager.ts     # 統合管理
```

### UI フロー

1. ツールバーの 👁 ボタンをクリック
2. ファイルブラウザが開く（HTML ファイルのみ表示）
3. ファイルを選択
4. 右側にプレビューペインが表示
5. ファイル編集・保存で自動更新
6. × ボタンまたは 👁 ボタンで閉じる

### CSS 構造

```css
#ttyd-preview-pane {
  position: fixed;
  right: 0;
  width: var(--preview-width, 400px);
  /* ... */
}

body.preview-open .terminal {
  width: calc(100% - var(--preview-width, 400px)) !important;
}

@media (max-width: 768px) {
  #ttyd-preview-pane {
    width: 100% !important;
    height: 50vh;
    top: auto;
  }
}
```

## Notes

- 将来的に CSS/JavaScript の自動インジェクションでホットリロード対応も検討可能
- Markdown プレビュー機能への拡張も視野に入れた設計
