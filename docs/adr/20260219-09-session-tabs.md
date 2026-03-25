# ADR 034: Session Tabs

## Status

Accepted

## Context

ttyd-mux では複数のターミナルセッションを管理できるが、セッション間の切り替えには以下の課題があった：

1. **ポータルページへの往復** - セッション切り替えのたびにポータルページに戻る必要がある
2. **状態の喪失** - 新しいタブ/ウィンドウを開くため、スクロールバック履歴が保持されない
3. **コンテキストスイッチ** - 複数タブの管理が煩雑

IDE のような統合された作業環境で、複数セッションをシームレスに切り替えたいというニーズがあった。

## Decision

タブベースのセッション切り替え UI を実装する。

### URL 構造

| パス | 説明 |
|------|------|
| `/ttyd-mux/` | ポータルページ（既存、変更なし） |
| `/ttyd-mux/tabs/` | タブビュー（最初/最後のセッションを選択） |
| `/ttyd-mux/tabs/{session}` | タブビュー（指定セッションを選択） |
| `/ttyd-mux/{session}/` | 直接セッションアクセス（既存、変更なし） |

### アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│  /ttyd-mux/tabs/{session-name}                                  │
├──────────┬──────────────────────────────────────────────────────┤
│          │                                                      │
│  Tab Bar │  <iframe src="/ttyd-mux/{session-name}/">           │
│          │                                                      │
│ ┌──────┐ │  ┌──────────────────────────────────────────────┐   │
│ │ Sess1│ │  │                                              │   │
│ ├──────┤ │  │            Terminal (ttyd)                   │   │
│ │ Sess2│◀│  │                                              │   │
│ ├──────┤ │  │            + Existing Toolbar                │   │
│ │ Sess3│ │  │                                              │   │
│ └──────┘ │  └──────────────────────────────────────────────┘   │
│          │                                                      │
└──────────┴──────────────────────────────────────────────────────┘
```

### 設定オプション

```yaml
# config.yaml
tabs:
  enabled: true
  orientation: vertical      # horizontal | vertical
  position: left             # left | right | top | bottom
  tab_width: 200             # 垂直タブの幅 (px)
  tab_height: 40             # 水平タブの高さ (px)
  auto_refresh_interval: 5000  # セッションリスト更新間隔 (ms)
  preload_iframes: false     # 全 iframe を事前読み込み
  show_session_info: true    # ディレクトリ情報を表示
```

### クライアントアーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│  SessionTabManager                                              │
│  - URL パース                                                   │
│  - セッションリストのポーリング                                  │
│  - ブラウザ履歴管理 (pushState/popstate)                        │
│  - localStorage による最後のセッション記憶                       │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────────┐ ┌─────────────────────────────┐
│  TabBarController           │ │  IframeManager              │
│  - タブ UI レンダリング     │ │  - iframe 生成/破棄         │
│  - クリックイベント         │ │  - 表示/非表示切り替え      │
│  - アクティブ状態管理       │ │  - プリロード対応           │
└─────────────────────────────┘ └─────────────────────────────┘
```

### iframe 方式の選択理由

**検討した代替案：**

1. **単一ターミナル + セッション切り替え**
   - WebSocket 接続を切り替える方式
   - メリット: メモリ効率が良い
   - デメリット: スクロールバック履歴が失われる

2. **Multiple xterm.js instances**
   - 複数の xterm インスタンスを DOM 上に保持
   - メリット: 軽量
   - デメリット: ttyd の内部実装への依存が必要

3. **iframe 埋め込み**（採用）
   - 各セッションが独立した ttyd ページとして動作
   - メリット: 完全な状態分離、既存ツールバーがそのまま動作
   - デメリット: メモリ使用量増加

**iframe を選択した理由：**
- 各セッションのスクロールバック履歴が完全に保持される
- 既存のツールバー機能（IME 入力、検索、通知等）がそのまま利用可能
- セッション切り替えが瞬時（DOM 表示切り替えのみ）
- ttyd の内部実装への依存なし

### レスポンシブ対応

```css
/* 通常: 設定に従う */
#ttyd-tabs-sidebar {
  width: ${tab_width}px;  /* 垂直時 */
}

/* モバイル (480px 以下): 強制的に下部水平タブ */
@media (max-width: 480px) {
  #ttyd-tabs-container {
    flex-direction: column-reverse !important;
  }
  #ttyd-tabs-sidebar {
    width: 100% !important;
    height: auto !important;
  }
}
```

## Implementation

### 新規ファイル

| ファイル | 内容 |
|---------|------|
| `src/daemon/tabs/index.ts` | モジュールエクスポート |
| `src/daemon/tabs/config.ts` | 設定定数 |
| `src/daemon/tabs/styles.ts` | 動的 CSS 生成 |
| `src/daemon/tabs/template.ts` | HTML テンプレート |
| `src/daemon/tabs/client/index.ts` | クライアントエントリポイント |
| `src/daemon/tabs/client/types.ts` | 型定義 |
| `src/daemon/tabs/client/SessionTabManager.ts` | メインオーケストレーター |
| `src/daemon/tabs/client/TabBarController.ts` | タブバー UI |
| `src/daemon/tabs/client/IframeManager.ts` | iframe 管理 |
| `scripts/build-tabs.mjs` | tabs.js ビルドスクリプト |

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/config/types.ts` | `TabsConfigSchema` 追加 |
| `src/daemon/router.ts` | `/tabs/` ルート追加、`tabs.js` 配信 |
| `tsconfig.json` | tabs/client を除外 |
| `package.json` | `build:tabs` スクリプト追加 |

## Consequences

### Positive

- **シームレスな切り替え**: タブクリックで瞬時にセッション切り替え
- **状態保持**: 各セッションのスクロールバック履歴が完全に保持
- **既存機能の活用**: ツールバー、通知、共有リンク等がそのまま動作
- **ブラウザ統合**: 戻る/進むボタン、URL 共有が自然に動作
- **設定可能**: 垂直/水平、位置、サイズを設定で変更可能

### Negative

- **メモリ使用量**: セッション数に比例してメモリ消費が増加
- **初回読み込み**: 各 iframe の読み込みに時間がかかる
- **クロスオリジン制限**: iframe 間の直接通信は制限される

### Neutral

- **既存 URL への影響なし**: `/ttyd-mux/` と `/ttyd-mux/{session}/` は従来通り動作
- **オプトイン**: `/tabs/` にアクセスした場合のみタブ UI が表示される

## Usage

```bash
# ビルド
bun run build:tabs

# 開発サーバー起動
ttyd-mux up

# ブラウザでアクセス
# http://localhost:7680/ttyd-mux/tabs/
# http://localhost:7680/ttyd-mux/tabs/my-session

# 設定変更 (config.yaml)
tabs:
  orientation: horizontal
  position: top
```

## Future Considerations

1. **タブのドラッグ&ドロップ並び替え**
2. **タブのピン留め**
3. **セッショングループ化**
4. **キーボードショートカット** (Ctrl+Tab, Ctrl+1-9)
5. **分割ビュー** (複数セッションの同時表示)
